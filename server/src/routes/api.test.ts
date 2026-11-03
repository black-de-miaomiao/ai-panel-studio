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
import { listByDiscussion as listParticipants } from '../db/repositories/participants';
import { createTestConfig, createTestDb } from '../test/helpers';
import type { DiscussionEventBus } from '../engine/eventBus';
import type { DiscussionManager } from '../engine/manager';
import { createLLMGateway } from '../llm/gateway';
import { createMockProvider } from '../llm/mock';
import type { LLMGateway } from '../llm/gateway';
import type { LLMProvider } from '../llm/types';

const fakeApiKey = 'sk-test-not-a-real-key';

let database: DatabaseSync;
let app: ReturnType<typeof createApp>;

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function gatewayFor(provider: LLMProvider): LLMGateway {
  return createLLMGateway({
    provider,
    models: { quality: 'quality-model', fast: 'fast-model' },
    maxConcurrency: 2
  });
}

function createBlockedLineupGateway() {
  const mock = createMockProvider({ latencyMs: 0, streamDelayMs: 0 });
  const started = createDeferred();
  const release = createDeferred();
  let blocked = false;
  const provider: LLMProvider = {
    name: mock.name,
    async complete(request) {
      if (request.task === 'lineup' && !blocked) {
        blocked = true;
        started.resolve();
        await release.promise;
      }
      return mock.complete(request);
    },
    async *stream(request) {
      yield* mock.stream(request);
    }
  };
  return {
    gateway: gatewayFor(provider),
    started: started.promise,
    release: release.resolve
  };
}

function createToggleFailureGateway() {
  const mock = createMockProvider({ latencyMs: 0, streamDelayMs: 0 });
  let shouldFail = true;
  const provider: LLMProvider = {
    name: mock.name,
    async complete(request) {
      if (request.task === 'lineup' && shouldFail) {
        throw new Error('可控的阵容生成失败');
      }
      return mock.complete(request);
    },
    async *stream(request) {
      yield* mock.stream(request);
    }
  };
  return {
    gateway: gatewayFor(provider),
    setShouldFail(value: boolean) {
      shouldFail = value;
    }
  };
}

function createTestApp(options: {
  failOnLineup?: boolean;
  llm?: LLMGateway;
} = {}) {
  const config = createTestConfig({
    llm: {
      apiKey: fakeApiKey,
      provider: 'mock'
    }
  });
  const llm: LLMGateway =
    options.llm ??
    createLLMGateway({
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
    closeDiscussion: () => undefined,
    closeAll: () => undefined
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
  it('非法状态筛选和 JSON 请求体返回中文 400 错误', async () => {
    const invalidStatus = await request(app).get(
      '/api/discussions?status=live,unknown'
    );
    const malformedJson = await request(app)
      .post('/api/discussions')
      .set('content-type', 'application/json')
      .send('{"topic":');

    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalidStatus.body.error.message).toMatch(/[\u3400-\u9fff]/);
    expect(malformedJson.status).toBe(400);
    expect(malformedJson.body.error.code).toBe('VALIDATION_ERROR');
    expect(malformedJson.body.error.message).toMatch(/[\u3400-\u9fff]/);
  });

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
    const statusAfterFailure = getById(database, discussionId ?? '')?.status;
    app = createTestApp();
    const regenerated = discussionId
      ? await request(app).post(
          `/api/discussions/${discussionId}/lineup/regenerate`
        )
      : undefined;

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('LLM_ERROR');
    expect(discussionId).toBeTruthy();
    expect(statusAfterFailure).toBe('failed');
    expect(regenerated?.status).toBe(200);
    expect(regenerated?.body.snapshot.discussion.status).toBe('lineup_ready');
  });

  it('待开播讨论换一批失败时保留原阵容与状态且仍可开播', async () => {
    const created = await request(app)
      .post('/api/discussions')
      .send({ topic: '换一批失败仍可开播', expertCount: 2 });
    const discussionId = created.body.snapshot.discussion.id as string;
    const before = await request(app).get(`/api/discussions/${discussionId}`);
    const originalParticipantIds = before.body.snapshot.participants.map(
      (participant: { id: string }) => participant.id
    );
    const beforeDiscussion = before.body.snapshot.discussion;
    const beforeEventSeq = before.body.snapshot.lastEventSeq;

    app = createTestApp({ failOnLineup: true });
    const failed = await request(app).post(
      `/api/discussions/${discussionId}/lineup/regenerate`
    );
    const afterFailure = await request(app).get(
      `/api/discussions/${discussionId}`
    );

    expect(created.status).toBe(201);
    expect(before.status).toBe(200);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('LLM_ERROR');
    expect(failed.body.error.message).toBe(
      '换一批失败，已保留当前阵容，可以重试或直接确认开播'
    );
    expect(failed.body.error.details?.[0]?.discussionId).toBe(discussionId);
    expect(afterFailure.body.snapshot.discussion.status).toBe('lineup_ready');
    expect(afterFailure.body.snapshot.discussion.errorMessage).toBeNull();
    expect(afterFailure.body.snapshot.discussion.updatedAt).toBe(
      beforeDiscussion.updatedAt
    );
    expect(afterFailure.body.snapshot.lastEventSeq).toBe(beforeEventSeq);
    expect(
      afterFailure.body.snapshot.participants.map(
        (participant: { id: string }) => participant.id
      )
    ).toEqual(originalParticipantIds);

    const started = await request(app).post(
      `/api/discussions/${discussionId}/start`
    );
    const afterStart = await request(app).get(
      `/api/discussions/${discussionId}`
    );

    expect(started.status).toBe(200);
    expect(started.body.discussion.status).toBe('live');
    expect(afterStart.body.snapshot.participants.map(
      (participant: { id: string }) => participant.id
    )).toEqual(originalParticipantIds);
  });

  it('阵容更新期间拒绝开播和重复更换，完成后开播保留新阵容', async () => {
    const created = await request(app)
      .post('/api/discussions')
      .send({ topic: '阵容更新与开播互斥', expertCount: 2 });
    const discussionId = created.body.snapshot.discussion.id as string;
    const oldIds = listParticipants(database, discussionId).map(
      ({ id }) => id
    );
    const gate = createBlockedLineupGateway();
    app = createTestApp({ llm: gate.gateway });
    const pendingRegenerate = request(app)
      .post(`/api/discussions/${discussionId}/lineup/regenerate`)
      .then((response) => response);
    await gate.started;

    try {
      const blockedStart = await request(app).post(
        `/api/discussions/${discussionId}/start`
      );
      const duplicateRegenerate = await request(app).post(
        `/api/discussions/${discussionId}/lineup/regenerate`
      );

      expect(blockedStart.status).toBe(409);
      expect(blockedStart.body.error.code).toBe('INVALID_STATE');
      expect(blockedStart.body.error.message).toMatch(/阵容正在更新/u);
      expect(duplicateRegenerate.status).toBe(409);
      expect(duplicateRegenerate.body.error.code).toBe('INVALID_STATE');
    } finally {
      gate.release();
    }

    const regenerated = await pendingRegenerate;
    const newIds = regenerated.body.snapshot.participants.map(
      (participant: { id: string }) => participant.id
    );
    expect(regenerated.status).toBe(200);
    expect(newIds).not.toEqual(oldIds);

    const started = await request(app).post(
      `/api/discussions/${discussionId}/start`
    );
    const afterStart = await request(app).get(
      `/api/discussions/${discussionId}`
    );
    expect(started.status).toBe(200);
    expect(afterStart.body.snapshot.participants.map(
      (participant: { id: string }) => participant.id
    )).toEqual(newIds);
  });

  it('阵容更新期间删除讨论后丢弃生成结果且不创建孤儿参与者', async () => {
    const created = await request(app)
      .post('/api/discussions')
      .send({ topic: '删除时阵容仍在生成', expertCount: 2 });
    const discussionId = created.body.snapshot.discussion.id as string;
    const gate = createBlockedLineupGateway();
    app = createTestApp({ llm: gate.gateway });
    const pendingRegenerate = request(app)
      .post(`/api/discussions/${discussionId}/lineup/regenerate`)
      .then((response) => response);
    await gate.started;

    const deleted = await request(app).delete(
      `/api/discussions/${discussionId}`
    );
    gate.release();
    const regenerated = await pendingRegenerate;

    expect(deleted.status).toBe(204);
    expect(regenerated.status).toBe(404);
    expect(regenerated.body.error.code).toBe('NOT_FOUND');
    expect(getById(database, discussionId)).toBeNull();
    expect(listParticipants(database, discussionId)).toEqual([]);
  });

  it('创建讨论生成阵容期间被删除时返回 404 且不写入参与者', async () => {
    const gate = createBlockedLineupGateway();
    app = createTestApp({ llm: gate.gateway });
    const pendingCreate = request(app)
      .post('/api/discussions')
      .send({ topic: '创建过程中删除', expertCount: 2 })
      .then((response) => response);
    await gate.started;
    const draft = listDiscussions(database, { statuses: ['draft'] })[0];
    expect(draft).toBeTruthy();
    if (!draft) {
      gate.release();
      throw new Error('创建中的讨论未进入 draft');
    }

    const deleted = await request(app).delete(`/api/discussions/${draft.id}`);
    gate.release();
    const created = await pendingCreate;

    expect(deleted.status).toBe(204);
    expect(created.status).toBe(404);
    expect(created.body.error.code).toBe('NOT_FOUND');
    expect(listParticipants(database, draft.id)).toEqual([]);
  });

  it('待开播讨论换一批失败后释放互斥并允许再次尝试', async () => {
    const created = await request(app)
      .post('/api/discussions')
      .send({ topic: '失败后释放阵容锁', expertCount: 2 });
    const discussionId = created.body.snapshot.discussion.id as string;
    const toggle = createToggleFailureGateway();
    app = createTestApp({ llm: toggle.gateway });

    const failed = await request(app).post(
      `/api/discussions/${discussionId}/lineup/regenerate`
    );
    expect(failed.status).toBe(502);
    expect(getById(database, discussionId)?.status).toBe('lineup_ready');

    toggle.setShouldFail(false);
    const retried = await request(app).post(
      `/api/discussions/${discussionId}/lineup/regenerate`
    );
    expect(retried.status).toBe(200);
    expect(retried.body.snapshot.discussion.status).toBe('lineup_ready');
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
