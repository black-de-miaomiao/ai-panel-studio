import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  StreamEventSchema,
  type Discussion,
  type LiveUtterance,
  type StreamEvent
} from '@aps/shared';
import { createApp } from '../app';
import {
  create as createDiscussion,
  list as listDiscussions,
  updateStatus
} from '../db/repositories/discussions';
import { listSince } from '../db/repositories/events';
import {
  createTestConfig,
  createTestDb,
  type ParsedSseEvent,
  readSse
} from '../test/helpers';
import {
  createEventBus,
  type DiscussionEventBus
} from '../engine/eventBus';
import type { DiscussionManager } from '../engine/manager';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import type { LLMGateway } from '../llm/gateway';

interface OpenSseConnection {
  response: Response;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  controller: AbortController;
  buffer: string;
}

let database: DatabaseSync;
let server: Server | undefined;
let baseUrl: string;
let bus: DiscussionEventBus;
const activeConnections: AbortController[] = [];

function createTestApp() {
  const config = createTestConfig();
  const llm: LLMGateway = createLLMGateway({
    provider: createMockProvider({ latencyMs: 0, streamDelayMs: 0 }),
    models: {
      quality: config.llm.qualityModel,
      fast: config.llm.fastModel
    },
    maxConcurrency: 2
  });
  const manager: DiscussionManager = {
    start: (_discussionId: string): Discussion | null => null,
    pause: (_discussionId: string): Discussion | null => null,
    resume: (_discussionId: string): Discussion | null => null,
    end: (_discussionId: string): Discussion | null => null,
    remove: (_discussionId: string) => false,
    recoverOnBoot: () => undefined,
    getLiveUtterance: (_discussionId: string): LiveUtterance | null => null,
    stopAll: () => undefined
  };

  return createApp({ config, db: database, llm, bus, manager });
}

async function openConnection(path: string): Promise<OpenSseConnection> {
  const controller = new AbortController();
  activeConnections.push(controller);
  const response = await fetch(`${baseUrl}${path}`, {
    signal: controller.signal
  });
  if (!response.body) {
    throw new Error('Expected an SSE response body');
  }
  return {
    response,
    reader: response.body.getReader(),
    controller,
    buffer: ''
  };
}

async function nextSseEvent(
  connection: OpenSseConnection
): Promise<ParsedSseEvent> {
  const decoder = new TextDecoder();

  while (true) {
    const boundary = connection.buffer.search(/\r?\n\r?\n/);
    if (boundary >= 0) {
      const frame = connection.buffer.slice(0, boundary);
      const match = connection.buffer.slice(boundary).match(/^\r?\n\r?\n/);
      connection.buffer = connection.buffer.slice(
        boundary + (match?.[0].length ?? 2)
      );
      let id: string | null = null;
      const data: string[] = [];
      for (const line of frame.split(/\r\n|\n|\r/)) {
        if (line.startsWith('id:')) {
          id = line.slice(3).replace(/^ /, '');
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (data.length > 0) {
        return {
          id,
          event: StreamEventSchema.parse(JSON.parse(data.join('\n')) as unknown)
        };
      }
      continue;
    }

    const { value, done } = await connection.reader.read();
    if (done) {
      throw new Error('SSE connection ended before the next event');
    }
    connection.buffer += decoder.decode(value, { stream: true });
  }
}

beforeEach(async () => {
  database = createTestDb({ seed: true });
  bus = createEventBus(database);
  const listeningServer = createTestApp().listen(0, '127.0.0.1');
  server = listeningServer;
  await once(listeningServer, 'listening');
  const address = listeningServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const controller of activeConnections.splice(0)) {
    controller.abort();
  }
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  server = undefined;
  database.close();
});

describe('SSE 讨论事件流', () => {
  it('连接返回 event-stream 并先收到观众数更新', async () => {
    const discussion = createDiscussion(database, {
      topic: '首次连接观众数测试',
      expertCount: 2,
      maxTurns: 8
    });
    const connection = await openConnection(
      `/api/discussions/${discussion.id}/stream?since=0`
    );
    const first = await nextSseEvent(connection);

    expect(connection.response.headers.get('content-type')).toContain(
      'text/event-stream'
    );
    expect(first.event.type).toBe('viewers.updated');
    if (first.event.type === 'viewers.updated') {
      expect(first.event.viewerCount).toBeGreaterThanOrEqual(1);
    }
    connection.controller.abort();
  });

  it('ended 种子讨论从 since 零补发全部持久事件且序号递增并带事件 ID', async () => {
    const ended = listDiscussions(database).find(
      ({ status }) => status === 'ended'
    );
    expect(ended).toBeTruthy();
    if (!ended) {
      throw new Error('种子数据缺少已结束讨论');
    }
    const expectedEventCount = listSince(database, ended.id, 0).length;
    const events = await readSse(
      `${baseUrl}/api/discussions/${ended.id}/stream?since=0`,
      {
        until: (received) =>
          received.filter(({ id }) => id !== null).length >= expectedEventCount,
        timeoutMs: 1000
      }
    );
    const persisted = events.filter(({ id: eventId }) => eventId !== null);
    const ids = persisted.map(({ id: eventId }) => Number(eventId));

    expect(persisted.length).toBeGreaterThan(0);
    expect(ids).toEqual(
      Array.from({ length: expectedEventCount }, (_, index) => index + 1)
    );
    expect(persisted.every(({ event }) => event.discussionId === ended.id)).toBe(
      true
    );
  });

  it('只补发游标后的事件且 Last-Event-ID 优先于 since', async () => {
    const ended = listDiscussions(database).find(
      ({ status }) => status === 'ended'
    );
    expect(ended).toBeTruthy();
    if (!ended) {
      throw new Error('种子数据缺少已结束讨论');
    }
    const sinceEvents = await readSse(
      `${baseUrl}/api/discussions/${ended.id}/stream?since=3`,
      {
        until: (received) =>
          received.filter(({ id }) => id !== null).length >=
          listSince(database, ended.id, 3).length,
        timeoutMs: 1000
      }
    );
    const lastIdEvents = await readSse(
      `${baseUrl}/api/discussions/${ended.id}/stream?since=0`,
      {
        headers: { 'Last-Event-ID': '5' },
        until: (received) =>
          received.filter(({ id }) => id !== null).length >=
          listSince(database, ended.id, 5).length,
        timeoutMs: 1000
      }
    );

    expect(
      sinceEvents
        .filter(({ id }) => id !== null)
        .every(({ id }) => Number(id) > 3)
    ).toBe(true);
    expect(
      lastIdEvents
        .filter(({ id }) => id !== null)
        .every(({ id }) => Number(id) > 5)
    ).toBe(true);
  });

  it('讨论不存在时建立 SSE 前返回 404 JSON', async () => {
    const response = await fetch(
      `${baseUrl}/api/discussions/00000000-0000-4000-8000-000000000999/stream`
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('两个连接时观众数为二且断开一个后降为一', async () => {
    const discussion = createDiscussion(database, {
      topic: '多观众连接数测试',
      expertCount: 2,
      maxTurns: 8
    });
    const first = await openConnection(
      `/api/discussions/${discussion.id}/stream?since=0`
    );
    const firstEvent = await nextSseEvent(first);
    const second = await openConnection(
      `/api/discussions/${discussion.id}/stream?since=0`
    );
    const secondEvent = await nextSseEvent(second);

    first.controller.abort();
    const afterDisconnect = await nextSseEvent(second);

    expect(first.response.headers.get('content-type')).toContain(
      'text/event-stream'
    );
    expect(second.response.headers.get('content-type')).toContain(
      'text/event-stream'
    );
    expect(firstEvent.event.type).toBe('viewers.updated');
    expect(secondEvent.event.type).toBe('viewers.updated');
    expect(afterDisconnect.event.type).toBe('viewers.updated');
    if (secondEvent.event.type === 'viewers.updated') {
      expect(secondEvent.event.viewerCount).toBe(2);
    }
    if (afterDisconnect.event.type === 'viewers.updated') {
      expect(afterDisconnect.event.viewerCount).toBe(1);
    }
    second.controller.abort();
  });

  it('直播讨论能够接收发言开始增量和完成事件', async () => {
    const live = createDiscussion(database, {
      topic: '实时流式发言测试',
      expertCount: 2,
      maxTurns: 4
    });
    updateStatus(database, live.id, 'live');
    const connection = await openConnection(
      `/api/discussions/${live.id}/stream?since=0`
    );
    await nextSseEvent(connection);
    const participantId = randomUUID();
    const utteranceId = randomUUID();
    const at = new Date().toISOString();
    bus.publish({
      type: 'utterance.started',
      discussionId: live.id,
      at,
      utteranceId,
      participantId,
      act: 'statement',
      replyToParticipantId: null,
      seq: 1
    });
    bus.publish({
      type: 'utterance.delta',
      discussionId: live.id,
      at,
      utteranceId,
      delta: '实时增量。'
    });
    bus.publish({
      type: 'utterance.completed',
      discussionId: live.id,
      at,
      utterance: {
        id: utteranceId,
        discussionId: live.id,
        participantId,
        seq: 1,
        act: 'statement',
        replyToParticipantId: null,
        content: '实时增量。',
        createdAt: at
      }
    });
    const events: ParsedSseEvent[] = [];
    while (!events.some(({ event }) => event.type === 'utterance.completed')) {
      events.push(await nextSseEvent(connection));
    }
    const types = new Set(events.map(({ event }) => event.type));

    expect(types.has('utterance.started')).toBe(true);
    expect(types.has('utterance.delta')).toBe(true);
    expect(types.has('utterance.completed')).toBe(true);
    connection.controller.abort();
  });
});
