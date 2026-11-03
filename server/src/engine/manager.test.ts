import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '../test/helpers';
import {
  create as createDiscussion,
  getById,
  updateStatus
} from '../db/repositories/discussions';
import { listSince } from '../db/repositories/events';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import { createEventBus } from './eventBus';
import { DiscussionManager } from './manager';

let database: DatabaseSync;

beforeEach(() => {
  database = createTestDb();
});

afterEach(() => {
  database.close();
});

describe('DiscussionManager', () => {
  it('stopAll 也会关闭没有 Runner 的 SSE 频道', () => {
    const discussion = createDiscussion(database, {
      topic: '没有 Runner 的待开播讨论',
      expertCount: 2,
      maxTurns: 8
    });
    const bus = createEventBus(database);
    let closeCount = 0;
    bus.subscribe(discussion.id, () => undefined, () => {
      closeCount += 1;
    });
    const llm = createLLMGateway({
      provider: createMockProvider({ latencyMs: 0, streamDelayMs: 0 }),
      models: { quality: 'quality-model', fast: 'fast-model' },
      maxConcurrency: 2
    });
    const manager = new DiscussionManager(
      database,
      bus,
      llm,
      { maxTurns: 8, pacingMs: 0 }
    );

    manager.stopAll();

    expect(closeCount).toBe(1);
    expect(bus.viewerCount(discussion.id)).toBe(0);
  });

  it('启动恢复将 live 与 summarizing 持久转为 paused 并记录同一时间戳事件', () => {
    const live = createDiscussion(database, {
      topic: '恢复直播讨论',
      expertCount: 2,
      maxTurns: 8
    });
    const summarizing = createDiscussion(database, {
      topic: '恢复总结讨论',
      expertCount: 2,
      maxTurns: 8
    });
    const ready = createDiscussion(database, {
      topic: '保持待开播讨论',
      expertCount: 2,
      maxTurns: 8
    });
    updateStatus(database, live.id, 'live');
    updateStatus(database, summarizing.id, 'summarizing');
    updateStatus(database, ready.id, 'lineup_ready');

    const bus = createEventBus(database);
    const llm = createLLMGateway({
      provider: createMockProvider({ latencyMs: 0, streamDelayMs: 0 }),
      models: { quality: 'quality-model', fast: 'fast-model' },
      maxConcurrency: 2
    });
    const manager = new DiscussionManager(
      database,
      bus,
      llm,
      { maxTurns: 8, pacingMs: 0 }
    );

    manager.recoverOnBoot();

    for (const id of [live.id, summarizing.id]) {
      const discussion = getById(database, id);
      const events = listSince(database, id, 0);
      expect(discussion?.status).toBe('paused');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        type: 'discussion.status',
        status: 'paused'
      });
      expect(events[0]?.payload.at).toBe(discussion?.updatedAt);
    }
    expect(getById(database, ready.id)?.status).toBe('lineup_ready');
    expect(listSince(database, ready.id, 0)).toHaveLength(0);
  });
});
