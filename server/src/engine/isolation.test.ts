import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@aps/shared';
import {
  create as createDiscussion,
  updateStatus
} from '../db/repositories/discussions';
import { listSince } from '../db/repositories/events';
import { listByDiscussion as listInsights } from '../db/repositories/insights';
import {
  listByDiscussion as listParticipants,
  replaceLineup
} from '../db/repositories/participants';
import { listByDiscussion as listUtterances } from '../db/repositories/utterances';
import { createTestDb } from '../test/helpers';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import { createEventBus } from './eventBus';
import { DiscussionRunner } from './runner';

let database: DatabaseSync;

function seedDiscussion(topic: string) {
  const discussion = createDiscussion(database, {
    topic,
    expertCount: 2,
    maxTurns: 4
  });
  const participants = [
    {
      id: randomUUID(),
      role: 'host' as const,
      seat: 0,
      name: '林知远',
      profession: '主持人',
      title: '圆桌主持人',
      stance: '梳理各方意见。',
      stanceTag: '引导',
      persona: '',
      color: '#E8C872',
      avatar: '林'
    },
    ...['周明', '陈澄'].map((name, index) => ({
      id: randomUUID(),
      role: 'expert' as const,
      seat: index + 1,
      name,
      profession: '研究员',
      title: '领域顾问',
      stance: '评估实际影响。',
      stanceTag: index === 0 ? '支持' : '审慎',
      persona: '',
      color: index === 0 ? '#5B9DFF' : '#FF6B9A',
      avatar: name[0] ?? name
    }))
  ];
  replaceLineup(database, discussion.id, participants);
  updateStatus(database, discussion.id, 'live');
  return {
    id: discussion.id,
    participantIds: new Set<string>(participants.map(({ id }) => id))
  };
}

beforeEach(() => {
  database = createTestDb();
});

afterEach(() => {
  database.close();
});

describe('多讨论并行隔离', () => {
  it('两场讨论同时结束且事件发言洞察序号和 transcript 各自隔离', async () => {
    const discussionA = seedDiscussion('AI 助手是否适合进入企业客服');
    const discussionB = seedDiscussion('城市公共空间如何兼顾安全与开放');
    const bus = createEventBus(database);
    const llm = createLLMGateway({
      provider: createMockProvider({ latencyMs: 0, streamDelayMs: 0 }),
      models: { quality: 'quality-model', fast: 'fast-model' },
      maxConcurrency: 6
    });
    const eventsA: Array<{ event: StreamEvent; seq: number | null }> = [];
    const eventsB: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribeA = bus.subscribe(discussionA.id, (event) =>
      eventsA.push(event)
    );
    const unsubscribeB = bus.subscribe(discussionB.id, (event) =>
      eventsB.push(event)
    );
    const runnerA = new DiscussionRunner(
      database,
      bus,
      llm,
      { maxTurns: 4, pacingMs: 0 },
      discussionA.id
    );
    const runnerB = new DiscussionRunner(
      database,
      bus,
      llm,
      { maxTurns: 4, pacingMs: 0 },
      discussionB.id
    );

    runnerA.start();
    runnerB.start();
    await Promise.all([runnerA.done, runnerB.done]);
    unsubscribeA();
    unsubscribeB();

    const utterancesA = listUtterances(database, discussionA.id);
    const utterancesB = listUtterances(database, discussionB.id);
    const insightsA = listInsights(database, discussionA.id);
    const insightsB = listInsights(database, discussionB.id);
    const durableSeqsA = listSince(database, discussionA.id, 0).map(
      ({ seq }) => seq
    );
    const durableSeqsB = listSince(database, discussionB.id, 0).map(
      ({ seq }) => seq
    );

    expect(eventsA.every(({ event }) => event.discussionId === discussionA.id)).toBe(
      true
    );
    expect(eventsB.every(({ event }) => event.discussionId === discussionB.id)).toBe(
      true
    );
    expect(
      utterancesA.every(({ participantId }) =>
        discussionA.participantIds.has(participantId)
      )
    ).toBe(true);
    expect(
      utterancesB.every(({ participantId }) =>
        discussionB.participantIds.has(participantId)
      )
    ).toBe(true);
    expect(
      insightsA.every((insight) =>
        insight.stances.every(({ participantId }) =>
          discussionA.participantIds.has(participantId)
        )
      )
    ).toBe(true);
    expect(
      insightsB.every((insight) =>
        insight.stances.every(({ participantId }) =>
          discussionB.participantIds.has(participantId)
        )
      )
    ).toBe(true);
    expect(durableSeqsA).toEqual(
      Array.from({ length: durableSeqsA.length }, (_, index) => index + 1)
    );
    expect(durableSeqsB).toEqual(
      Array.from({ length: durableSeqsB.length }, (_, index) => index + 1)
    );
    expect(utterancesA.map(({ content }) => content)).not.toEqual(
      utterancesB.map(({ content }) => content)
    );
    expect(listParticipants(database, discussionA.id)).toHaveLength(3);
    expect(listParticipants(database, discussionB.id)).toHaveLength(3);
  });
});
