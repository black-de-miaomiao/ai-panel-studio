import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@aps/shared';
import { createTestDb } from '../test/helpers';
import { create as createDiscussion } from '../db/repositories/discussions';
import { listSince } from '../db/repositories/events';
import type { DatabaseSync } from 'node:sqlite';
import { createEventBus } from './eventBus';

let database: DatabaseSync;

function statusEvent(
  discussionId: string,
  status: 'live' | 'paused',
  turnCount = 0
): StreamEvent {
  return {
    type: 'discussion.status',
    discussionId,
    at: new Date().toISOString(),
    status,
    turnCount,
    maxTurns: 8
  };
}

beforeEach(() => {
  database = createTestDb();
});

afterEach(() => {
  database.close();
});

describe('DiscussionEventBus', () => {
  it('按讨论隔离频道并在单个 listener 抛错时继续广播', () => {
    const discussionA = createDiscussion(database, {
      topic: '事件总线讨论甲',
      expertCount: 2,
      maxTurns: 8
    });
    const discussionB = createDiscussion(database, {
      topic: '事件总线讨论乙',
      expertCount: 2,
      maxTurns: 8
    });
    const bus = createEventBus(database);
    const receivedA: number[] = [];
    const receivedB: number[] = [];
    bus.subscribe(discussionA.id, () => {
      throw new Error('观察者故障');
    });
    bus.subscribe(discussionA.id, ({ seq }) => {
      if (seq !== null) {
        receivedA.push(seq);
      }
    });
    bus.subscribe(discussionB.id, ({ seq }) => {
      if (seq !== null) {
        receivedB.push(seq);
      }
    });

    const envelope = bus.publish(statusEvent(discussionA.id, 'live'));

    expect(envelope.seq).toBe(1);
    expect(receivedA).toEqual([1]);
    expect(receivedB).toEqual([]);
    expect(listSince(database, discussionA.id, 0)).toHaveLength(1);
    expect(listSince(database, discussionB.id, 0)).toHaveLength(0);
  });

  it('瞬时事件不持久化且 closeDiscussion 通知并清理频道', () => {
    const discussion = createDiscussion(database, {
      topic: '关闭事件频道',
      expertCount: 2,
      maxTurns: 8
    });
    const bus = createEventBus(database);
    let closeCount = 0;
    const received: Array<number | null> = [];
    bus.subscribe(
      discussion.id,
      ({ seq }) => received.push(seq),
      () => {
        closeCount += 1;
      }
    );

    const transient = bus.publish({
      type: 'viewers.updated',
      discussionId: discussion.id,
      at: new Date().toISOString(),
      viewerCount: 1
    });
    bus.closeDiscussion(discussion.id);
    bus.publish(statusEvent(discussion.id, 'paused'));

    expect(transient.seq).toBeNull();
    expect(received).toEqual([null]);
    expect(closeCount).toBe(1);
    expect(bus.viewerCount(discussion.id)).toBe(0);
  });

  it('closeAll 结束所有仍有订阅的讨论频道', () => {
    const discussionA = createDiscussion(database, {
      topic: '关闭全部频道甲',
      expertCount: 2,
      maxTurns: 8
    });
    const discussionB = createDiscussion(database, {
      topic: '关闭全部频道乙',
      expertCount: 2,
      maxTurns: 8
    });
    const bus = createEventBus(database);
    const closed: string[] = [];
    bus.subscribe(discussionA.id, () => undefined, () =>
      closed.push(discussionA.id)
    );
    bus.subscribe(discussionB.id, () => undefined, () =>
      closed.push(discussionB.id)
    );

    bus.closeAll();

    expect(closed.sort()).toEqual([discussionA.id, discussionB.id].sort());
    expect(bus.viewerCount(discussionA.id)).toBe(0);
    expect(bus.viewerCount(discussionB.id)).toBe(0);
  });

  it('重入发布保持事件序号顺序', () => {
    const discussion = createDiscussion(database, {
      topic: '事件重入顺序测试',
      expertCount: 2,
      maxTurns: 8
    });
    const bus = createEventBus(database);
    const received: Array<number | null> = [];
    bus.subscribe(discussion.id, ({ seq }) => {
      received.push(seq);
      if (seq === 1) {
        bus.publish(statusEvent(discussion.id, 'paused'));
      }
    });

    bus.publish(statusEvent(discussion.id, 'live'));

    expect(received).toEqual([1, 2]);
    expect(listSince(database, discussion.id, 0).map(({ seq }) => seq)).toEqual([
      1,
      2
    ]);
  });
});
