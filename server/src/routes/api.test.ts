import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Discussion,
  LiveUtterance,
  StreamEvent
} from '@aps/shared';
import { createApp } from '../app';
import {
  create as createDiscussion,
  getById,
  list as listDiscussions,
  remove as removeDiscussion,
  updateStatus
} from '../db/repositories/discussions';
import { createTestConfig, createTestDb } from '../test/helpers';
import type { DiscussionEventBus } from '../engine/eventBus';
import type { DiscussionManager } from '../engine/manager';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import type { LLMGateway } from '../llm/gateway';

const fakeApiKey = 'sk-test-not-a-real-key';

let database: DatabaseSync;
let app: ReturnType<typeof createApp>;

function createTestApp(options: { failOnLineup?: boolean } = {}) {
  const config = createTestConfig({
    llm: {
      apiKey: fakeApiKey,
      provider: 'mock'
    }
  });
  const llm: LLMGateway = createLLMGateway({
    provider: createMockProvider({
      latencyMs: 0,
      streamDelayMs: 0,
      failOn: options.failOnLineup
        ? (llmRequest) => llmRequest.task === 'lineup'
        : undefined
    }),
    models: {
      quality: config.llm.qualityModel,
      fast: config.llm.fastModel
    },
    maxConcurrency: 2
  });
  const bus: DiscussionEventBus = {
    publish: (event: StreamEvent) => ({ event, seq: null }),
    subscribe: () => () => undefined,
    viewerCount: () => 0,
    closeDiscussion: () => undefined
  };
  const manager: DiscussionManager = {
    start: (discussionId: string): Discussion | null => {
      const discussion = getById(database, discussionId);
      return discussion?.status === 'lineup_ready'
        ? updateStatus(database, discussionId, 'live', {
            startedAt: new Date().toISOString()
          })
        : null;
    },
    pause: (discussionId: string): Discussion | null =>
      getById(database, discussionId)?.status === 'live'
        ? updateStatus(database, discussionId, 'paused')
        : null,
    resume: (discussionId: string): Discussion | null =>
      getById(database, discussionId)?.status === 'paused'
        ? updateStatus(database, discussionId, 'live')
        : null,
    end: (discussionId: string): Discussion | null => {
      const status = getById(database, discussionId)?.status;
      return status === 'live' || status === 'paused'
        ? updateStatus(database, discussionId, 'summarizing')
        : null;
    },
    remove: (discussionId: string) => removeDiscussion(database, discussionId),
    recoverOnBoot: () => undefined,
    getLiveUtterance: (_discussionId: string): LiveUtterance | null => null,
    stopAll: () => undefined
  };

  return createApp({ config, db: database, llm, bus, manager });
}

beforeEach(() => {
  database = createTestDb({ seed: true });
  app = createTestApp();
});

afterEach(() => {
  database.close();
});

describe('讨论 REST API', () => {
  it('拒绝空话题越界长度和非法专家人数并返回中文校验错误', async () => {
    const invalidBodies = [
      { topic: '' },
      { topic: 'A' },
      { topic: '甲'.repeat(201) },
      { topic: '有效主题', expertCount: 1 },
      { topic: '有效主题', expertCount: 7 },
      { topic: '有效主题', expertCount: 2.5 }
    ];

    for (const body of invalidBodies) {
      const response = await request(app).post('/api/discussions').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(/[\u3400-\u9fff]/);
    }
  });

  it('创建成功后返回默认四位专家及已分配角色颜色和头像', async () => {
    const response = await request(app)
      .post('/api/discussions')
      .send({ topic: 'AI 助手是否适合进入企业客服' });

    expect(response.status).toBe(201);
    expect(response.body.snapshot.discussion).toMatchObject({
      status: 'lineup_ready',
      expertCount: 4
    });
    expect(response.body.snapshot.participants).toHaveLength(5);
    expect(response.body.snapshot.participants[0]).toMatchObject({
      role: 'host',
      seat: 0,
      color: '#E8C872'
    });
    expect(response.body.snapshot.participants.slice(1).map(
      (participant: { color: string }) => participant.color
    )).toEqual(['#5B9DFF', '#FF6B9A', '#3DDC97', '#B18CFF']);
    expect(
      response.body.snapshot.participants.every(
        (participant: { avatar: string; name: string }) =>
          participant.avatar === participant.name[0]
      )
    ).toBe(true);
  });

  it('列表包含新讨论和结构性种子记录并按状态排序且支持 ended 过滤', async () => {
    const created = await request(app)
      .post('/api/discussions')
      .send({ topic: '新建测试讨论', expertCount: 2 });
    const response = await request(app).get('/api/discussions');
    const ended = await request(app).get('/api/discussions?status=ended');
    const seeds = response.body.items?.filter(
      (item: { source: string }) => item.source === 'seed'
    ) ?? [];

    expect(created.status).toBe(201);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(7);
    expect(
      seeds.filter(
        (item: { status: string }) => item.status === 'lineup_ready'
      )
    ).toHaveLength(5);
    expect(
      seeds.filter(
        (item: { status: string }) => item.status === 'ended'
      )
    ).toHaveLength(1);
    expect(response.body.items.map((item: { status: string }) => item.status)).toEqual([
      'lineup_ready',
      'lineup_ready',
      'lineup_ready',
      'lineup_ready',
      'lineup_ready',
      'lineup_ready',
      'ended'
    ]);
    expect(ended.body.items).toHaveLength(1);
    expect(ended.body.items.every((item: { status: string }) => item.status === 'ended')).toBe(
      true
    );
  });

  it('获取完整快照且不存在的讨论返回 NOT_FOUND', async () => {
    const existingId = listDiscussions(database)[0]?.id;
    expect(existingId).toBeTruthy();
    if (!existingId) {
      throw new Error('种子数据缺少讨论');
    }
    const found = await request(app).get(`/api/discussions/${existingId}`);
    const missing = await request(app).get(
      '/api/discussions/00000000-0000-4000-8000-000000000999'
    );

    expect(found.status).toBe(200);
    expect(found.body.snapshot).toMatchObject({
      discussion: { id: existingId },
      participants: expect.any(Array),
      utterances: expect.any(Array),
      insights: expect.any(Array)
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('待开播讨论换阵容后参与者 ID 改变而直播状态换阵容返回冲突', async () => {
    const id = listDiscussions(database).find(
      ({ status }) => status === 'lineup_ready'
    )?.id;
    expect(id).toBeTruthy();
    if (!id) {
      throw new Error('种子数据缺少待开播讨论');
    }
    const live = createDiscussion(database, {
      topic: '直播中的测试讨论',
      expertCount: 2,
      maxTurns: 8
    });
    updateStatus(database, live.id, 'live');
    const current = await request(app).get(`/api/discussions/${id}`);
    const regenerated = await request(app).post(
      `/api/discussions/${id}/lineup/regenerate`
    );
    const invalid = await request(app).post(
      `/api/discussions/${live.id}/lineup/regenerate`
    );

    expect(regenerated.status).toBe(200);
    expect(
      regenerated.body.snapshot.participants.map(
        (participant: { id: string }) => participant.id
      )
    ).not.toEqual(
      current.body.snapshot.participants.map(
        (participant: { id: string }) => participant.id
      )
    );
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('INVALID_STATE');
  });

  it('开播仅允许 lineup_ready 且重复开播返回冲突', async () => {
    const id = listDiscussions(database).find(
      ({ status }) => status === 'lineup_ready'
    )?.id;
    expect(id).toBeTruthy();
    if (!id) {
      throw new Error('种子数据缺少待开播讨论');
    }
    const started = await request(app).post(`/api/discussions/${id}/start`);
    const repeated = await request(app).post(`/api/discussions/${id}/start`);

    expect(started.status).toBe(200);
    expect(started.body.discussion.status).toBe('live');
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('INVALID_STATE');
  });

  it('暂停继续和结束遵守状态转换并拒绝结束态暂停', async () => {
    const live = createDiscussion(database, {
      topic: '直播状态转换测试',
      expertCount: 2,
      maxTurns: 8
    });
    const pausedDiscussion = createDiscussion(database, {
      topic: '暂停状态转换测试',
      expertCount: 2,
      maxTurns: 8
    });
    const endedDiscussion = createDiscussion(database, {
      topic: '结束状态转换测试',
      expertCount: 2,
      maxTurns: 8
    });
    updateStatus(database, live.id, 'live');
    updateStatus(database, pausedDiscussion.id, 'paused');
    updateStatus(database, endedDiscussion.id, 'ended');
    const paused = await request(app).post(`/api/discussions/${live.id}/pause`);
    const resumed = await request(app).post(
      `/api/discussions/${pausedDiscussion.id}/resume`
    );
    const ended = await request(app).post(`/api/discussions/${live.id}/end`);
    const invalidPause = await request(app).post(
      `/api/discussions/${endedDiscussion.id}/pause`
    );

    expect(paused.status).toBe(200);
    expect(paused.body.discussion.status).toBe('paused');
    expect(resumed.status).toBe(200);
    expect(resumed.body.discussion.status).toBe('live');
    expect(ended.status).toBe(202);
    expect(ended.body.discussion.status).toBe('summarizing');
    expect(invalidPause.status).toBe(409);
    expect(invalidPause.body.error.code).toBe('INVALID_STATE');
  });

  it('删除讨论后资源不再可获取', async () => {
    const id = listDiscussions(database)[0]?.id;
    expect(id).toBeTruthy();
    if (!id) {
      throw new Error('种子数据缺少讨论');
    }
    const deleted = await request(app).delete(`/api/discussions/${id}`);
    const fetched = await request(app).get(`/api/discussions/${id}`);

    expect(deleted.status).toBe(204);
    expect(fetched.status).toBe(404);
    expect(fetched.body.error.code).toBe('NOT_FOUND');
  });

  it('阵容失败保留 failed 状态和讨论 ID 且之后可重新生成', async () => {
    app = createTestApp({ failOnLineup: true });
    const response = await request(app)
      .post('/api/discussions')
      .send({ topic: 'AI 助手是否适合进入企业客服', expertCount: 2 });
    const discussionId = response.body.error.details?.[0]?.discussionId as
      | string
      | undefined;
    app = createTestApp();
    const regenerated = discussionId
      ? await request(app).post(
          `/api/discussions/${discussionId}/lineup/regenerate`
        )
      : undefined;

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('LLM_ERROR');
    expect(discussionId).toBeTruthy();
    expect(getById(database, discussionId ?? '')?.status).toBe('failed');
    expect(regenerated?.status).toBe(200);
    expect(regenerated?.body.snapshot.discussion.status).toBe('lineup_ready');
  });

  it('健康检查与 REST 响应中不泄漏配置的假密钥', async () => {
    const health = await request(app).get('/api/health');
    const invalid = await request(app)
      .post('/api/discussions')
      .send({ topic: 'A', expertCount: 1 });
    const created = await request(app)
      .post('/api/discussions')
      .send({ topic: '密钥响应边界检查', expertCount: 2 });
    const listing = await request(app).get('/api/discussions');
    const seedId = listDiscussions(database).find(
      ({ status }) => status === 'lineup_ready'
    )?.id;
    const responses = [health, invalid, created, listing];

    if (seedId) {
      responses.push(
        await request(app).get(`/api/discussions/${seedId}`),
        await request(app).post(
          `/api/discussions/${seedId}/lineup/regenerate`
        ),
        await request(app).post(`/api/discussions/${seedId}/start`),
        await request(app).post(`/api/discussions/${seedId}/pause`),
        await request(app).post(`/api/discussions/${seedId}/resume`),
        await request(app).post(`/api/discussions/${seedId}/end`),
        await request(app).delete(`/api/discussions/${seedId}`)
      );
    }

    expect(health.status).toBe(200);
    for (const response of responses) {
      expect(response.text).not.toContain(fakeApiKey);
    }
  });
});
