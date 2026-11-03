import { describe, expect, it, vi } from 'vitest';
import { createLineupSnapshot } from '../mocks/fixtures';
import { createHttpApi } from './httpApi';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

describe('HTTP discussion API', () => {
  it('parses health and list responses and encodes status filters', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const api = createHttpApi(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      return jsonResponse(
        url === '/api/health'
          ? {
              ok: true,
              llm: {
                provider: 'mock',
                qualityModel: 'deepseek-v4-pro',
                fastModel: 'deepseek-flash'
              }
            }
          : { items: [] }
      );
    });

    expect((await api.getHealth()).llm.provider).toBe('mock');
    expect(await api.listDiscussions(['live', 'paused'])).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([
      '/api/health',
      '/api/discussions?status=live%2Cpaused'
    ]);
  });

  it('uses documented REST paths and parses snapshot and discussion envelopes', async () => {
    const snapshot = createLineupSnapshot({ fixtureNo: 88 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const api = createHttpApi(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/discussions' && init?.method === 'POST') {
        return jsonResponse({ snapshot }, 201);
      }
      if (url.endsWith('/lineup/regenerate')) {
        return jsonResponse({ snapshot });
      }
      if (url.endsWith('/start')) {
        return jsonResponse({
          discussion: { ...snapshot.discussion, status: 'live' }
        });
      }
      if (url.endsWith('/pause')) {
        return jsonResponse({
          discussion: { ...snapshot.discussion, status: 'paused' }
        });
      }
      if (url.endsWith('/resume')) {
        return jsonResponse({
          discussion: { ...snapshot.discussion, status: 'live' }
        });
      }
      if (url.endsWith('/end')) {
        return jsonResponse({
          discussion: { ...snapshot.discussion, status: 'summarizing' }
        }, 202);
      }
      return jsonResponse({ snapshot });
    });

    const created = await api.createDiscussion({
      topic: snapshot.discussion.topic,
      expertCount: snapshot.discussion.expertCount
    });
    const loaded = await api.getDiscussion(snapshot.discussion.id);
    const regenerated = await api.regenerateLineup(snapshot.discussion.id);
    const started = await api.start(snapshot.discussion.id);
    const paused = await api.pause(snapshot.discussion.id);
    const resumed = await api.resume(snapshot.discussion.id);
    const ended = await api.end(snapshot.discussion.id);

    expect(created.discussion.id).toBe(snapshot.discussion.id);
    expect(loaded.lastEventSeq).toBe(snapshot.lastEventSeq);
    expect(regenerated.discussion.id).toBe(snapshot.discussion.id);
    expect(started.status).toBe('live');
    expect(paused.status).toBe('paused');
    expect(resumed.status).toBe('live');
    expect(ended.status).toBe('summarizing');
    expect(calls.map(({ url, init }) => [init?.method ?? 'GET', url])).toEqual([
      ['POST', '/api/discussions'],
      ['GET', `/api/discussions/${snapshot.discussion.id}`],
      ['POST', `/api/discussions/${snapshot.discussion.id}/lineup/regenerate`],
      ['POST', `/api/discussions/${snapshot.discussion.id}/start`],
      ['POST', `/api/discussions/${snapshot.discussion.id}/pause`],
      ['POST', `/api/discussions/${snapshot.discussion.id}/resume`],
      ['POST', `/api/discussions/${snapshot.discussion.id}/end`]
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      topic: snapshot.discussion.topic,
      expertCount: snapshot.discussion.expertCount
    });
  });

  it('converts API error bodies while preserving the Chinese message and details', async () => {
    const discussionId = '00000000-0000-4000-8000-000000000123';
    const api = createHttpApi(async () =>
      jsonResponse(
        {
          error: {
            code: 'LLM_ERROR',
            message: '暂时无法生成阵容，请稍后重试',
            details: [{ discussionId }]
          }
        },
        502
      )
    );

    await expect(
      api.createDiscussion({ topic: '有效讨论话题', expertCount: 2 })
    ).rejects.toMatchObject({
      name: 'ApiError',
      code: 'LLM_ERROR',
      message: '暂时无法生成阵容，请稍后重试',
      details: [{ discussionId }]
    });
  });

  it('maps non-contract 5xx proxy responses to NETWORK', async () => {
    for (const status of [500, 502, 503, 504]) {
      const api = createHttpApi(async () => ({
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('response is not JSON');
        }
      } as unknown as Response));

      await expect(api.getHealth()).rejects.toMatchObject({
        code: 'NETWORK',
        message: '无法连接服务器，请确认后端已启动'
      });
    }
  });

  it('maps fetch rejection to NETWORK and rejects invalid successful data', async () => {
    const networkApi = createHttpApi(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(networkApi.getHealth()).rejects.toMatchObject({
      code: 'NETWORK',
      message: '无法连接服务器，请确认后端已启动'
    });

    const invalidApi = createHttpApi(async () => jsonResponse({ items: 'bad' }));
    await expect(invalidApi.listDiscussions()).rejects.toMatchObject({
      code: 'INTERNAL',
      message: '服务返回了无法识别的数据'
    });

    const unexpectedStatusApi = createHttpApi(async () =>
      jsonResponse(
        {
          ok: true,
          llm: {
            provider: 'mock',
            qualityModel: 'quality',
            fastModel: 'fast'
          }
        },
        201
      )
    );
    await expect(unexpectedStatusApi.getHealth()).rejects.toMatchObject({
      code: 'INTERNAL',
      message: '服务返回了无法识别的数据'
    });
  });

  it('deletes a discussion without trying to parse the 204 response body', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('204 responses have no JSON body');
      }
    } as unknown as Response));
    const api = createHttpApi(fetcher);

    await expect(
      api.deleteDiscussion('00000000-0000-4000-8000-000000000124')
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/discussions/00000000-0000-4000-8000-000000000124',
      { method: 'DELETE' }
    );
  });
});
