import { describe, expect, it } from 'vitest';
import { createOpenAICompatibleProvider } from './openaiCompatible';

const testApiKey = 'sk-test-not-a-real-key';
const baseUrl = 'https://llm.example.test/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('createOpenAICompatibleProvider', () => {
  it('JSON 完成请求使用兼容接口契约并返回文本内容', async () => {
    let requestedUrl = '';
    let requestedHeaders: Headers | undefined;
    let requestedBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        choices: [{ message: { content: '{"host":"林知远"}' } }]
      });
    };
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      fetchImpl
    });
    const result = await provider.complete({
      task: 'lineup',
      model: 'quality-model',
      system: '生成阵容',
      user: '主题',
      json: true,
      temperature: 0.9,
      maxTokens: 2048
    });

    expect(requestedUrl).toBe(`${baseUrl}/chat/completions`);
    expect(requestedHeaders?.get('authorization')).toBe(
      `Bearer ${testApiKey}`
    );
    expect(requestedBody).toMatchObject({
      model: 'quality-model',
      messages: [
        { role: 'system', content: '生成阵容' },
        { role: 'user', content: '主题' }
      ],
      temperature: 0.9,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    });
    expect(result.text).toBe('{"host":"林知远"}');
  });

  it('thinking disabled 时发送禁用标记及 temperature 和 max_tokens', async () => {
    let requestedBody: Record<string, unknown> | undefined;
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      fetchImpl: async (_input, init) => {
        requestedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return jsonResponse({
          choices: [{ message: { content: '已关闭思考模式' } }]
        });
      }
    });

    await provider.complete({
      task: 'lineup',
      model: 'quality-model',
      system: '阵容',
      user: '话题',
      thinking: 'disabled',
      temperature: 0.9,
      maxTokens: 3000
    });

    expect(requestedBody).toMatchObject({
      thinking: { type: 'disabled' },
      temperature: 0.9,
      max_tokens: 3000
    });
  });

  it('thinking low 时启用推理模式并省略 temperature', async () => {
    let requestedBody: Record<string, unknown> | undefined;
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      fetchImpl: async (_input, init) => {
        requestedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return jsonResponse({
          choices: [{ message: { content: '低思考模式结果' } }]
        });
      }
    });

    await provider.complete({
      task: 'summary',
      model: 'quality-model',
      system: '总结',
      user: '讨论',
      thinking: 'low',
      temperature: 0.5,
      maxTokens: 1500
    });

    expect(requestedBody).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
      max_tokens: 1500
    });
    expect(requestedBody).not.toHaveProperty('temperature');
  });

  it('未提供 thinking 时请求体不包含 thinking 和 reasoning_effort', async () => {
    let requestedBody: Record<string, unknown> | undefined;
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      fetchImpl: async (_input, init) => {
        requestedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return jsonResponse({
          choices: [{ message: { content: '默认思考模式结果' } }]
        });
      }
    });

    await provider.complete({
      task: 'bid',
      model: 'fast-model',
      system: '出价',
      user: '上下文'
    });

    expect(requestedBody).not.toHaveProperty('thinking');
    expect(requestedBody).not.toHaveProperty('reasoning_effort');
  });

  it('完成响应只返回 content 并丢弃 reasoning_content', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '面向观众的内容',
              reasoning_content: '不得传递的内部内容'
            }
          }
        ]
      });
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      fetchImpl
    });

    const result = await provider.complete({
      task: 'bid',
      model: 'fast-model',
      system: '出价',
      user: '上下文'
    });

    expect(result.text).toBe('面向观众的内容');
    expect(JSON.stringify(result)).not.toContain('reasoning');
  });

  it('解析跨 chunk SSE 且只产出 content 增量', async () => {
    const sseText =
      'data: {"choices":[{"delta":{"reasoning_content":"思"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
      'data: {"choices":[{"delta":{"reasoning_content":"考","content":"好"}}]}\n\n' +
      'data: [DONE]\n\n';
    const encoded = new TextEncoder().encode(sseText);
    const chunks = [
      encoded.slice(0, 17),
      encoded.slice(17, 73),
      encoded.slice(73)
    ];
    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          }
        }),
        { headers: { 'content-type': 'text/event-stream' } }
      );
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      fetchImpl
    });
    const deltas: string[] = [];

    for await (const delta of provider.stream({
      task: 'utterance',
      model: 'fast-model',
      system: '发言',
      user: '讨论'
    })) {
      deltas.push(delta);
    }

    expect(deltas).toEqual(['你', '好']);
    expect(deltas.join('')).toBe('你好');
    expect(deltas.join('')).not.toContain('思考');
  });

  it('429 重试一次成功且连续失败时错误不泄漏 API Key', async () => {
    let retryCalls = 0;
    const retryProvider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      timeoutsMs: { quality: 100, fast: 100 },
      fetchImpl: async () => {
        retryCalls += 1;
        return retryCalls === 1
          ? jsonResponse({ error: '限流' }, 429)
          : jsonResponse({ choices: [{ message: { content: '恢复成功' } }] });
      }
    });
    const recovered = await retryProvider.complete({
      task: 'bid',
      model: 'fast-model',
      system: '',
      user: ''
    });
    let failureCalls = 0;
    const failingProvider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      timeoutsMs: { quality: 100, fast: 100 },
      fetchImpl: async () => {
        failureCalls += 1;
        return jsonResponse({ error: '服务暂不可用' }, 503);
      }
    });
    const error = await failingProvider
      .complete({
        task: 'bid',
        model: 'fast-model',
        system: '',
        user: ''
      })
      .catch((caught: unknown) => caught);

    expect(recovered.text).toBe('恢复成功');
    expect(retryCalls).toBe(2);
    expect(failureCalls).toBe(2);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(testApiKey);
  });

  it('请求超时后以短时限失败', async () => {
    const provider = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: testApiKey,
      timeoutsMs: { quality: 20, fast: 20 },
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('请求已取消', 'AbortError')),
            { once: true }
          );
        })
    });

    await expect(
      provider.complete({
        task: 'bid',
        model: 'fast-model',
        system: '',
        user: ''
      })
    ).rejects.toThrow();
  });
});
