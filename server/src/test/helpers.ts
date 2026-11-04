import { setTimeout as delay } from 'node:timers/promises';
import {
  StreamEventSchema,
  type Insight,
  type Participant,
  type StreamEvent,
  type Utterance
} from '@aps/shared';
import { initSchema, openDatabase, seedIfEmpty } from '../db/connection';
import type { AppConfig } from '../config';

export interface TestConfigOverrides
  extends Partial<Omit<AppConfig, 'llm'>> {
  llm?: Partial<AppConfig['llm']>;
}

export function createTestConfig(
  overrides: TestConfigOverrides = {}
): AppConfig {
  const { llm: llmOverrides, ...otherOverrides } = overrides;
  return {
    port: 8787,
    databasePath: ':memory:',
    llm: {
      provider: 'mock',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      qualityModel: 'deepseek-v4-pro',
      fastModel: 'deepseek-flash',
      maxConcurrency: 6,
      ...llmOverrides
    },
    maxTurns: 8,
    pacingMs: 0,
    mockLatencyMs: 0,
    mockStreamDelayMs: 0,
    testDiscussionIdSeed: null,
    ...otherOverrides
  };
}

export function createTestDb(options: { seed?: boolean } = {}) {
  const database = openDatabase(':memory:');
  initSchema(database);
  if (options.seed) {
    seedIfEmpty(database);
  }
  return database;
}

export interface ParsedSseEvent {
  id: string | null;
  event: StreamEvent;
}

export interface ReadSseOptions {
  headers?: HeadersInit;
  until: (events: readonly ParsedSseEvent[]) => boolean;
  timeoutMs: number;
}

function parseSseFrame(frame: string): ParsedSseEvent | null {
  let id: string | null = null;
  const data: string[] = [];

  for (const line of frame.split(/\r\n|\n|\r/)) {
    if (line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('id:')) {
      id = line.slice(3).replace(/^ /, '');
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (data.length === 0) {
    return null;
  }

  return {
    id,
    event: StreamEventSchema.parse(JSON.parse(data.join('\n')) as unknown)
  };
}

export async function readSse(
  url: string,
  options: ReadSseOptions
): Promise<ParsedSseEvent[]> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  const events: ParsedSseEvent[] = [];
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const response = await fetch(url, {
      headers: options.headers,
      signal: controller.signal
    });
    if (!response.ok || !response.body) {
      throw new Error(`SSE request failed with status ${response.status}`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!options.until(events)) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          const parsed = parseSseFrame(buffer);
          if (parsed) {
            events.push(parsed);
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r\n\r\n|\n\n|\r\r/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (parsed) {
          events.push(parsed);
        }
        if (options.until(events)) {
          break;
        }
      }
    }

    if (!options.until(events)) {
      throw new Error('SSE stream ended before the requested event arrived');
    }
    return events;
  } catch (error) {
    if (timedOut) {
      throw new Error(`SSE read timed out after ${options.timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (reader) {
      await reader.cancel().catch(() => undefined);
    }
  }
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs} ms`);
    }
    await delay(5);
  }
}

const defaultDiscussionId = '00000000-0000-4000-8000-000000000001';

export function makeTestParticipant(
  overrides: Partial<Participant> = {}
): Participant {
  const name = overrides.name ?? '周明';
  return {
    id: '00000000-0000-4000-8000-000000000002',
    discussionId: defaultDiscussionId,
    role: 'expert',
    seat: 1,
    name,
    profession: '服务设计师',
    title: '服务设计顾问',
    stance: '支持逐步验证方案。',
    stanceTag: '谨慎',
    persona: '关注用户体验。',
    color: '#5B9DFF',
    avatar: name.slice(0, 1),
    agentState: 'idle',
    agentIntent: null,
    focus: null,
    speakCount: 0,
    ...overrides
  };
}

export function makeTestUtterance(
  overrides: Partial<Utterance> = {}
): Utterance {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    discussionId: defaultDiscussionId,
    participantId: '00000000-0000-4000-8000-000000000002',
    seq: 1,
    act: 'statement',
    replyToParticipantId: null,
    content: '先从低风险的场景开始验证。',
    createdAt: '2026-01-01T00:00:01.000Z',
    ...overrides
  };
}

export function makeTestInsight(
  overrides: Partial<Insight> = {}
): Insight {
  return {
    id: '00000000-0000-4000-8000-000000000004',
    discussionId: defaultDiscussionId,
    kind: 'consensus',
    content: '先限定问题范围。',
    status: 'active',
    stances: [
      {
        participantId: '00000000-0000-4000-8000-000000000002',
        position: '认可先限定范围'
      },
      {
        participantId: '00000000-0000-4000-8000-000000000005',
        position: '支持小步验证'
      }
    ],
    evidenceSeqs: [1, 2],
    updatedAtSeq: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:02.000Z',
    ...overrides
  };
}
