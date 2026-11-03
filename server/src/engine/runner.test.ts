import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@aps/shared';
import {
  create as createDiscussion,
  getById,
  updateStatus
} from '../db/repositories/discussions';
import { listSince } from '../db/repositories/events';
import {
  listByDiscussion as listInsights
} from '../db/repositories/insights';
import {
  listByDiscussion as listParticipants,
  replaceLineup
} from '../db/repositories/participants';
import { listByDiscussion as listUtterances } from '../db/repositories/utterances';
import { createTestDb, waitFor } from '../test/helpers';
import { createEventBus } from './eventBus';
import { DiscussionRunner } from './runner';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import type { LLMProvider } from '../llm/types';

let database: DatabaseSync;

function makeLineup() {
  return [
    {
      role: 'host' as const,
      seat: 0,
      name: '林知远',
      profession: '访谈主持',
      title: '圆桌主持人',
      stance: '帮助各方充分表达观点。',
      stanceTag: '引导',
      persona: '善于倾听。',
      color: '#E8C872',
      avatar: '林'
    },
    ...['周明', '陈澄', '顾言', '唐宁'].map((name, index) => ({
      role: 'expert' as const,
      seat: index + 1,
      name,
      profession: '研究员',
      title: '领域顾问',
      stance: '关注方案的实际影响。',
      stanceTag: ['支持', '审慎', '观望', '反对'][index] ?? '观点',
      persona: '',
      color: ['#5B9DFF', '#FF6B9A', '#3DDC97', '#B18CFF'][index] ?? '#5B9DFF',
      avatar: name[0] ?? name
    }))
  ];
}

function makeRunner(options: {
  maxTurns?: number;
  mockFailOn?: (task: string) => boolean;
  failFirstInsight?: boolean;
  invalidSummary?: boolean;
  failSummary?: boolean;
  wrapProvider?: (provider: LLMProvider) => LLMProvider;
}) {
  const discussion = createDiscussion(database, {
    topic: 'AI 助手是否适合进入企业客服',
    expertCount: 4,
    maxTurns: options.maxTurns ?? 8
  });
  const id = discussion.id;
  replaceLineup(
    database,
    id,
    makeLineup().map((participant) => ({
      ...participant,
      id: randomUUID()
    }))
  );
  updateStatus(database, id, 'live');
  const bus = createEventBus(database);
  const mockProvider = createMockProvider({
    latencyMs: 0,
    streamDelayMs: 0,
    failOn: options.mockFailOn
      ? (req) => options.mockFailOn?.(req.task) ?? false
      : undefined
  });
  const insightContexts: unknown[] = [];
  let failedInsightCalls = 0;
  let summaryCalls = 0;
  const provider: LLMProvider = {
    name: mockProvider.name,
    async complete(req) {
      if (req.task === 'insights') {
        insightContexts.push(req.context);
        if (options.failFirstInsight && failedInsightCalls < 2) {
          failedInsightCalls += 1;
          throw new Error('洞察服务暂不可用');
        }
      }
      return mockProvider.complete(req);
    },
    async *stream(req) {
      if (req.task === 'summary' && options.invalidSummary) {
        summaryCalls += 1;
        yield '{"summary":"不应展示的 JSON 总结"}';
        return;
      }
      if (req.task === 'summary' && options.failSummary) {
        summaryCalls += 1;
        throw new Error('总结服务暂不可用');
      }
      yield* mockProvider.stream(req);
    }
  };
  const gateway = createLLMGateway({
    provider: options.wrapProvider?.(provider) ?? provider,
    models: { quality: 'quality-model', fast: 'fast-model' },
    maxConcurrency: 6
  });
  const runner = new DiscussionRunner(
    database,
    bus,
    gateway,
    { maxTurns: options.maxTurns ?? 8, pacingMs: 0 },
    id
  );
  return {
    runner,
    bus,
    gateway,
    id,
    insightContexts,
    getSummaryCalls: () => summaryCalls
  };
}

function collectEvents(
  bus: ReturnType<typeof createEventBus>,
  id: string,
  events: Array<{ event: StreamEvent; seq: number | null }>
) {
  return bus.subscribe(id, (event) => events.push(event));
}

beforeEach(() => {
  database = createTestDb();
});

afterEach(() => {
  database.close();
});

describe('DiscussionRunner', () => {
  it('完整运行后从直播经总结结束且开场收尾与正文计数符合上限', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 8 });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    expect(getById(database, id)?.status).toBe('live');
    runner.start();
    await runner.done;
    unsubscribe();

    const discussion = getById(database, id);
    const utterances = listUtterances(database, id);
    const body = utterances.filter(
      ({ act }) => act !== 'opening' && act !== 'closing'
    );

    expect(discussion?.status).toBe('ended');
    expect(utterances[0]?.act).toBe('opening');
    expect(utterances.at(-1)?.act).toBe('closing');
    expect(body).toHaveLength(8);
    expect(discussion?.summary?.length).toBeGreaterThan(0);
    expect(discussion?.turnCount).toBe(8);
    const statuses = events.flatMap(({ event }) =>
      event.type === 'discussion.status' ? [event.status] : []
    );
    expect(statuses).toContain('summarizing');
    expect(statuses.at(-1)).toBe('ended');
  });

  it('连续两条专家发言不会由同一专家完成', async () => {
    const { runner, id } = makeRunner({ maxTurns: 8 });
    runner.start();
    await runner.done;

    const participants = new Map(
      listParticipants(database, id).map((participant) => [
        participant.id,
        participant
      ])
    );
    const utterances = listUtterances(database, id);

    for (let index = 1; index < utterances.length; index += 1) {
      const previous = utterances[index - 1];
      const current = utterances[index];
      if (
        participants.get(previous?.participantId ?? '')?.role === 'expert' &&
        participants.get(current?.participantId ?? '')?.role === 'expert'
      ) {
        expect(current?.participantId).not.toBe(previous?.participantId);
      }
    }
  });

  it('专家和主持人插话最多两句且主持人开场最多三句', async () => {
    const { runner, id } = makeRunner({ maxTurns: 8 });
    runner.start();
    await runner.done;

    const utterances = listUtterances(database, id);
    expect(utterances[0]?.content).toBeTruthy();
    expect(utterances[0]?.content.match(/[。！？!?…]+/g)?.length ?? 0).toBeLessThanOrEqual(
      3
    );
    for (const utterance of utterances) {
      if (utterance.act === 'closing') {
        continue;
      }
      if (utterance.act !== 'opening') {
        expect(
          utterance.content.match(/[。！？!?…]+/g)?.length ?? 0
        ).toBeLessThanOrEqual(2);
      }
    }
  });

  it('总结完成前至少推送一次洞察更新且结束时存在洞察', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 8 });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    runner.start();
    await runner.done;
    unsubscribe();
    const summaryIndex = events.findIndex(
      ({ event }) => event.type === 'summary.completed'
    );

    expect(
      events.some(
        ({ event }, index) =>
          event.type === 'insights.updated' && index < summaryIndex
      )
    ).toBe(true);
    expect(listInsights(database, id).length).toBeGreaterThan(0);
  });

  it('洞察提炼失败不阻塞主循环且下一次触发包含遗漏发言', async () => {
    const { runner, id, insightContexts } = makeRunner({
      maxTurns: 4,
      failFirstInsight: true
    });
    runner.start();
    await runner.done;

    expect(getById(database, id)?.status).toBe('ended');
    expect(getById(database, id)?.turnCount).toBe(4);
    expect(insightContexts.length).toBeGreaterThan(2);
    expect(
      insightContexts
        .slice(2)
        .some((context) => JSON.stringify(context).includes('"seq":2'))
    ).toBe(true);
  });

  it('总结为自然语言且不能解析为 JSON', async () => {
    const { runner, id } = makeRunner({ maxTurns: 8 });
    runner.start();
    await runner.done;
    const summary = getById(database, id)?.summary ?? '';

    expect(summary.trimStart()).not.toMatch(/^(?:\{|\[)/);
    expect(() => JSON.parse(summary)).toThrow();
  });

  it('模型总结返回 JSON 时不展示 JSON 原文而保存自然语言总结', async () => {
    const { runner, id } = makeRunner({
      maxTurns: 4,
      invalidSummary: true
    });
    runner.start();
    await runner.done;
    const summary = getById(database, id)?.summary ?? '';

    expect(summary.trimStart()).not.toMatch(/^(?:\{|\[)/);
    expect(() => JSON.parse(summary)).toThrow();
  });

  it('总结连续失败时根据讨论内容生成自然语言兜底总结', async () => {
    const { runner, id, getSummaryCalls } = makeRunner({
      maxTurns: 4,
      failSummary: true
    });
    runner.start();
    await runner.done;
    const summary = getById(database, id)?.summary ?? '';

    expect(getSummaryCalls()).toBeGreaterThanOrEqual(2);
    expect(summary.trim().length).toBeGreaterThan(0);
    expect(summary.trimStart()).not.toMatch(/^(?:\{|\[)/);
    expect(() => JSON.parse(summary)).toThrow();
  });

  it('每条完成事件之前先有同 ID 的开始事件且 speaking 只标记当前发言人', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 8 });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    runner.start();
    await runner.done;
    unsubscribe();
    const started = new Set<string>();
    let pendingSpeakingParticipantId: string | null = null;

    for (const { event } of events) {
      if (event.type === 'participant.state' && event.agentState === 'speaking') {
        pendingSpeakingParticipantId = event.participantId;
      } else if (event.type === 'utterance.started') {
        started.add(event.utteranceId);
        if (pendingSpeakingParticipantId) {
          expect(event.participantId).toBe(pendingSpeakingParticipantId);
          pendingSpeakingParticipantId = null;
        }
      } else if (event.type === 'utterance.completed') {
        expect(started.has(event.utterance.id)).toBe(true);
      }
    }
    expect(pendingSpeakingParticipantId).toBeNull();
  });

  it('正文中至少包含一次主持人追问串联或点名插话', async () => {
    const { runner, id } = makeRunner({ maxTurns: 8 });
    runner.start();
    await runner.done;

    expect(
      listUtterances(database, id).some(({ act }) =>
        ['follow_up', 'bridge', 'invite'].includes(act)
      )
    ).toBe(true);
  });

  it('专家正文发言至少覆盖两种发言行为', async () => {
    const { runner, id } = makeRunner({ maxTurns: 8 });
    runner.start();
    await runner.done;
    const participantById = new Map(
      listParticipants(database, id).map((participant) => [
        participant.id,
        participant
      ])
    );
    const acts = new Set(
      listUtterances(database, id)
        .filter(
          ({ participantId, act }) =>
            participantById.get(participantId)?.role === 'expert' &&
            act !== 'opening' &&
            act !== 'closing'
        )
        .map(({ act }) => act)
    );

    expect(acts.size).toBeGreaterThanOrEqual(2);
  });

  it('专家状态和出价事件不会被写成 Transcript 发言', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 4 });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    runner.start();
    await runner.done;
    unsubscribe();

    const utterances = listUtterances(database, id);
    expect(
      events.some(({ event }) => event.type === 'participant.state')
    ).toBe(true);
    expect(
      utterances.length
    ).toBe(
      events.filter(({ event }) => event.type === 'utterance.completed').length
    );
  });

  it('暂停后至多完成当前一条发言并在继续后恢复至结束', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 8 });
    let pauseRequested = false;
    const unsubscribe = bus.subscribe(id, ({ event }) => {
      if (
        !pauseRequested &&
        event.type === 'utterance.completed' &&
        event.utterance.act !== 'opening' &&
        event.utterance.act !== 'closing'
      ) {
        pauseRequested = true;
        runner.pause();
      }
    });
    runner.start();
    await waitFor(
      () => getById(database, id)?.status === 'paused',
      2000
    );
    const pausedCount = listUtterances(database, id).length;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    expect(listUtterances(database, id).length).toBeLessThanOrEqual(
      pausedCount + 1
    );

    runner.resume();
    await runner.done;
    unsubscribe();
    expect(getById(database, id)?.status).toBe('ended');
    expect(getById(database, id)?.turnCount).toBe(8);
  });

  it('直播中请求结束会进入总结并以少于上限的正文发言数结束', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 8 });
    let endRequested = false;
    const unsubscribe = bus.subscribe(id, ({ event }) => {
      if (
        !endRequested &&
        event.type === 'utterance.completed' &&
        event.utterance.act !== 'opening' &&
        event.utterance.act !== 'closing'
      ) {
        endRequested = true;
        runner.requestEnd();
      }
    });
    runner.start();
    await runner.done;
    unsubscribe();

    expect(getById(database, id)?.status).toBe('ended');
    expect(getById(database, id)?.turnCount).toBeLessThan(8);
  });

  it('发言任务连续失败三轮后暂停并广播错误而不拒绝 done', async () => {
    const { runner, bus, id } = makeRunner({
      maxTurns: 8,
      mockFailOn: (task) => task === 'utterance'
    });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    runner.start();
    await runner.done;
    unsubscribe();

    expect(getById(database, id)?.status).toBe('paused');
    expect(events.some(({ event }) => event.type === 'error')).toBe(true);
  });

  it('连续三轮出价任务失败后暂停广播错误且不新增正文发言', async () => {
    const expertCount = 4;
    let bidCalls = 0;
    const { runner, bus, id } = makeRunner({
      maxTurns: 8,
      mockFailOn: (task) => task === 'bid',
      wrapProvider(provider) {
        return {
          name: provider.name,
          async complete(request) {
            if (request.task === 'bid') {
              bidCalls += 1;
            }
            return provider.complete(request);
          },
          async *stream(request) {
            yield* provider.stream(request);
          }
        };
      }
    });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    runner.start();
    await expect(runner.done).resolves.toBeUndefined();
    unsubscribe();

    const bodyUtterances = listUtterances(database, id).filter(
      ({ act }) => act !== 'opening' && act !== 'closing'
    );
    expect(getById(database, id)?.status).toBe('paused');
    expect(bidCalls).toBeGreaterThanOrEqual(expertCount * 3);
    expect(events.some(({ event }) => event.type === 'error')).toBe(true);
    expect(bodyUtterances).toHaveLength(0);
  });

  it('开场后首轮无人出价时主持人点名并继续至正常结束', async () => {
    const expertCount = 4;
    let noBidResponsesRemaining = expertCount;
    let noBidResponses = 0;
    const { runner, id } = makeRunner({
      maxTurns: 8,
      wrapProvider(provider) {
        return {
          name: provider.name,
          async complete(request) {
            if (
              request.task === 'bid' &&
              noBidResponsesRemaining > 0
            ) {
              noBidResponsesRemaining -= 1;
              noBidResponses += 1;
              return { text: '{"wantToSpeak": false}' };
            }
            return provider.complete(request);
          },
          async *stream(request) {
            yield* provider.stream(request);
          }
        };
      }
    });
    runner.start();
    await runner.done;

    const utterances = listUtterances(database, id);
    expect(noBidResponses).toBe(expertCount);
    expect(getById(database, id)?.status).toBe('ended');
    expect(utterances.some(({ act }) => act === 'invite')).toBe(true);
    expect(utterances.at(-1)?.act).toBe('closing');
  });

  it('持久与瞬时事件载荷均不包含 reasoning 字样', async () => {
    const { runner, bus, id } = makeRunner({ maxTurns: 8 });
    const events: Array<{ event: StreamEvent; seq: number | null }> = [];
    const unsubscribe = collectEvents(bus, id, events);
    runner.start();
    await runner.done;
    unsubscribe();

    expect(
      JSON.stringify(events).toLowerCase()
    ).not.toContain('reasoning');
    expect(
      JSON.stringify(listSince(database, id, 0)).toLowerCase()
    ).not.toContain('reasoning');
  });
});
