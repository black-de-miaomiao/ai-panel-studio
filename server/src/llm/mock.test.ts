import { describe, expect, it } from 'vitest';
import { normalizeBid } from '../core/bid';
import { normalizeLineup } from '../core/lineup';
import { parseJsonLoose } from '../core/json';
import { createMockProvider } from './mock';
import type { LLMRequest } from './types';

function request(
  task: LLMRequest['task'],
  context: unknown = {},
  discussionId = 'discussion-test'
): LLMRequest & { model: string } {
  return {
    task,
    system: `完成${task}任务`,
    user: '围绕测试话题开展讨论',
    context,
    discussionId,
    model: task === 'lineup' || task === 'summary' ? 'quality-model' : 'fast-model'
  };
}

describe('createMockProvider', () => {
  it('相同讨论任务和调用序号生成相同结果', async () => {
    const firstProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const secondProvider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const req = request('utterance', { turnIndex: 3 });

    const firstCall = await firstProvider.complete(req);
    const secondCall = await firstProvider.complete(req);
    const firstCallAgain = await secondProvider.complete(req);
    const secondCallAgain = await secondProvider.complete(req);

    expect(firstCallAgain).toEqual(firstCall);
    expect(secondCallAgain).toEqual(secondCall);
  });

  it('生成二至六名专家且阵容输出可解析并通过规范化', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });

    for (let expertCount = 2; expertCount <= 6; expertCount += 1) {
      const result = await provider.complete(
        request('lineup', {
          topic: '企业客服中的 AI 助手',
          expertCount
        })
      );
      const raw = parseJsonLoose(result.text);
      const lineup = normalizeLineup(raw, expertCount);

      expect(lineup.experts).toHaveLength(expertCount);
    }
  });

  it('出价任务输出可被规范化为合法出价', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const ctx = {
      selfId: 'participant-e1',
      aliasToParticipantId: {
        H: 'participant-host',
        E1: 'participant-e1',
        E2: 'participant-e2'
      }
    };
    const result = await provider.complete(
      request('bid', {
        speakerAlias: 'E1',
        aliasMap: { H: '主持人', E1: '周明', E2: '陈澄' },
        recentTranscript: [
          '#4 E2 陈澄（用户研究负责人）：复杂问题需要人工升级。'
        ]
      })
    );
    const normalized = normalizeBid(parseJsonLoose(result.text), ctx);

    expect(normalized.participantId).toBe(ctx.selfId);
    expect(normalized.urgency).toBeGreaterThanOrEqual(0);
    expect(normalized.urgency).toBeLessThanOrEqual(1);
  });

  it('根据真实反驳和补充关系提炼分歧共识并引用上下文序号', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0
    });
    const context = {
      aliasMap: { E1: '周明', E2: '陈澄' },
      newUtterances: [
        {
          seq: 3,
          speakerAlias: 'E1',
          act: 'rebut',
          replyToAlias: 'E2',
          content: '效率收益应在低风险场景逐步验证。'
        },
        {
          seq: 4,
          speakerAlias: 'E2',
          act: 'supplement',
          replyToAlias: 'E1',
          content: '试点也需要明确人工升级路径。'
        }
      ]
    };
    const result = await provider.complete(request('insights', context));
    const patch = parseJsonLoose(result.text) as {
      consensus?: Array<{ evidence?: number[] }>;
      divergences?: Array<{ evidence?: number[] }>;
    };
    const validSeqs = new Set(context.newUtterances.map(({ seq }) => seq));

    expect(patch.divergences?.length).toBeGreaterThan(0);
    expect(patch.consensus?.length).toBeGreaterThan(0);
    for (const item of [...(patch.consensus ?? []), ...(patch.divergences ?? [])]) {
      expect(item.evidence?.length).toBeGreaterThan(0);
      expect(item.evidence?.every((seq) => validSeqs.has(seq))).toBe(true);
    }
  });

  it('流式分片拼接等于完成文本且自然语言任务不输出 JSON', async () => {
    const tasks = ['utterance', 'host', 'summary'] as const;

    for (const task of tasks) {
      const completeProvider = createMockProvider({
        latencyMs: 0,
        streamDelayMs: 0
      });
      const streamProvider = createMockProvider({
        latencyMs: 0,
        streamDelayMs: 0
      });
      const req = request(task, { turnIndex: 2 });
      const complete = await completeProvider.complete(req);
      const chunks: string[] = [];

      for await (const chunk of streamProvider.stream(req)) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toBe(complete.text);
      expect(complete.text.trimStart()).not.toMatch(/^(?:\{|\[)/);
      expect(complete.text).toMatch(/[\u3400-\u9fff]/);
    }
  });

  it('failOn 命中时提供商拒绝该任务', async () => {
    const provider = createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0,
      failOn: (req) => req.task === 'bid'
    });

    await expect(provider.complete(request('bid'))).rejects.toThrow();
  });
});
