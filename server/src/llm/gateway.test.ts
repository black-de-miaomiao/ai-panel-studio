import { describe, expect, it } from 'vitest';
import type { LLMProvider, LLMRequest } from './types';
import { createLLMGateway } from './gateway';

function providerWith(
  complete: LLMProvider['complete'],
  requests: Array<LLMRequest & { model: string }>
): LLMProvider {
  return {
    name: 'mock',
    complete: async (request) => {
      requests.push(request);
      return complete(request);
    },
    async *stream() {
      yield '片段';
    }
  };
}

const models = { quality: 'quality-model', fast: 'fast-model' };

describe('createLLMGateway', () => {
  it('按任务路由模型并将 thinking temperature 和 maxTokens 透传', async () => {
    const requests: Array<LLMRequest & { model: string }> = [];
    const provider = providerWith(async () => ({ text: '完成' }), requests);
    const gateway = createLLMGateway({
      provider,
      models,
      maxConcurrency: 2
    });

    for (const task of [
      'lineup',
      'summary',
      'bid',
      'utterance',
      'host',
      'insights'
    ] as const) {
      await gateway.complete({ task, system: '系统', user: '用户' });
    }

    expect(requests.map(({ task, model }) => [task, model])).toEqual([
      ['lineup', models.quality],
      ['summary', models.quality],
      ['bid', models.fast],
      ['utterance', models.fast],
      ['host', models.fast],
      ['insights', models.fast]
    ]);
    expect(
      requests.map(
        ({ task, thinking, temperature, maxTokens }) => [
          task,
          thinking,
          temperature,
          maxTokens
        ]
      )
    ).toEqual([
      ['lineup', 'disabled', 0.9, 3000],
      ['summary', 'disabled', 0.5, 1500],
      ['bid', 'disabled', 0.7, 300],
      ['utterance', 'disabled', 0.8, 300],
      ['host', 'disabled', 0.7, 300],
      ['insights', 'disabled', 0.2, 1500]
    ]);
  });

  it('并发上限为二时第三个调用须等待前两个中的一个完成', async () => {
    const release: Array<() => void> = [];
    let inFlight = 0;
    let maximumInFlight = 0;
    const provider = providerWith(
      async (request) => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise<void>((resolve) => release.push(resolve));
        inFlight -= 1;
        return { text: request.task };
      },
      []
    );
    const gateway = createLLMGateway({
      provider,
      models,
      maxConcurrency: 2
    });
    const requests = [
      gateway.complete({ task: 'bid', system: '', user: '' }),
      gateway.complete({ task: 'host', system: '', user: '' }),
      gateway.complete({ task: 'utterance', system: '', user: '' })
    ];

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(release).toHaveLength(2);
    expect(maximumInFlight).toBe(2);

    for (let index = 0; index < 3; index += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      release.shift()?.();
    }
    await Promise.all(requests);

    expect(maximumInFlight).toBe(2);
  });

  it('JSON 任务将 json 标志透传给提供商', async () => {
    const requests: Array<LLMRequest & { model: string }> = [];
    const provider = providerWith(async () => ({ text: '{}' }), requests);
    const gateway = createLLMGateway({
      provider,
      models,
      maxConcurrency: 2
    });

    await gateway.complete({
      task: 'lineup',
      system: '返回 JSON',
      user: '生成阵容',
      json: true
    });

    expect(requests[0]?.json).toBe(true);
    expect(requests[0]?.model).toBe(models.quality);
  });
});
