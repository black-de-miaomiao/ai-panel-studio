import { Router, type RequestHandler, type Response } from 'express';
import {
  CreateDiscussionRequestSchema,
  DISCUSSION_STATUSES,
  type Discussion,
  type DiscussionStatus,
  type StreamEvent
} from '@aps/shared';
import { z } from 'zod';
import { normalizeLineup, LineupValidationError } from '../core/lineup';
import { createDiscussionIdFactory } from '../core/deterministicIds';
import { LLMFormatError, parseJsonLoose } from '../core/json';
import { withTransaction } from '../db/connection';
import {
  create as createDiscussion,
  getById,
  list as listDiscussions,
  updateStatus
} from '../db/repositories/discussions';
import { appendInTransaction } from '../db/repositories/events';
import {
  listByDiscussion as listParticipants,
  replaceLineupInTransaction
} from '../db/repositories/participants';
import { buildSnapshot } from '../db/repositories/snapshot';
import { buildLineupPrompt } from '../prompts';
import type { AppConfig } from '../config';
import type { DiscussionEventBus, EventEnvelope } from '../engine/eventBus';
import type { DiscussionManager } from '../engine/manager';
import type { LLMGateway } from '../llm/gateway';
import type { DatabaseSync } from 'node:sqlite';
import { sendApiError } from './errors';

export interface DiscussionsRouteDeps {
  db: DatabaseSync;
  config: AppConfig;
  llm: LLMGateway;
  bus: DiscussionEventBus;
  manager: DiscussionManager;
}

const statusFilterSchema = z.array(z.enum(DISCUSSION_STATUSES)).min(1);

function isoNow(): string {
  return new Date().toISOString();
}

function broadcastPersisted(
  bus: DiscussionEventBus,
  envelope: EventEnvelope
): void {
  if (bus.broadcastPersisted) {
    bus.broadcastPersisted(envelope);
  } else {
    bus.publish(envelope.event);
  }
}

function persistEvent(
  database: DatabaseSync,
  event: StreamEvent
): EventEnvelope {
  const seq = appendInTransaction(database, event.discussionId, event);
  return { event, seq };
}

function lineupFailureReason(error: unknown): string {
  if (error instanceof LineupValidationError) {
    switch (error.code) {
      case 'INSUFFICIENT_EXPERTS':
        return '专家人数不足';
      case 'DUPLICATE_NAMES':
        return '主持人与专家姓名重复';
      case 'LOW_DIVERSITY':
        return '专家立场多样性不足';
      case 'INVALID_FORMAT':
        return '阵容字段格式无效';
    }
  }
  if (error instanceof LLMFormatError) {
    return 'JSON 解析失败';
  }
  return '大模型请求失败';
}

function logLineupFailure(discussionId: string, error: unknown): void {
  console.warn(
    `lineup failed: discussionId=${discussionId} category=${lineupFailureReason(error)}`
  );
}

async function generateLineup(
  deps: DiscussionsRouteDeps,
  discussion: Discussion
) {
  let lastError: unknown = new Error('阵容生成失败');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = buildLineupPrompt({
      topic: discussion.topic,
      expertCount: discussion.expertCount
    });
    const validationFeedback =
      attempt === 0 ? null : lineupFailureReason(lastError);
    try {
      const response = await deps.llm.complete({
        task: 'lineup',
        discussionId: discussion.id,
        system: prompt.system,
        user: validationFeedback
          ? `${prompt.user}\n上一轮阵容校验失败：${validationFeedback}。请修正后重新输出完整 JSON。`
          : prompt.user,
        context: validationFeedback
          ? { ...(prompt.context as Record<string, unknown>), validationFeedback }
          : prompt.context
      });
      return normalizeLineup(
        parseJsonLoose(response.text),
        discussion.expertCount
      );
    } catch (error) {
      lastError = error;
      logLineupFailure(discussion.id, error);
    }
  }
  throw lastError;
}

function persistReadyLineup(
  database: DatabaseSync,
  bus: DiscussionEventBus,
  discussionId: string,
  lineup: ReturnType<typeof normalizeLineup>,
  allowedStatuses: readonly DiscussionStatus[]
): 'saved' | 'not-found' | 'state-conflict' {
  const at = isoNow();
  const envelopes: EventEnvelope[] = [];
  let result: 'saved' | 'not-found' | 'state-conflict' = 'saved';
  withTransaction(database, () => {
    const current = getById(database, discussionId);
    if (!current) {
      result = 'not-found';
      return;
    }
    if (!allowedStatuses.includes(current.status)) {
      result = 'state-conflict';
      return;
    }
    replaceLineupInTransaction(
      database,
      discussionId,
      [lineup.host, ...lineup.experts],
      at
    );
    const participants = listParticipants(database, discussionId);
    const updated = updateStatus(
      database,
      discussionId,
      'lineup_ready',
      { errorMessage: null },
      at
    );
    if (!updated) {
      throw new Error('Discussion disappeared during lineup update');
    }
    const lineupEvent: StreamEvent = {
      type: 'lineup.updated',
      discussionId,
      at,
      participants
    };
    const statusEvent: StreamEvent = {
      type: 'discussion.status',
      discussionId,
      at,
      status: updated.status,
      turnCount: updated.turnCount,
      maxTurns: updated.maxTurns
    };
    envelopes.push(persistEvent(database, lineupEvent));
    envelopes.push(persistEvent(database, statusEvent));
  });
  for (const envelope of envelopes) {
    broadcastPersisted(bus, envelope);
  }
  return result;
}

function persistFailedLineup(
  database: DatabaseSync,
  bus: DiscussionEventBus,
  discussionId: string,
  allowedStatuses: readonly DiscussionStatus[]
): 'saved' | 'not-found' | 'state-conflict' {
  const at = isoNow();
  let envelope: EventEnvelope | null = null;
  let result: 'saved' | 'not-found' | 'state-conflict' = 'saved';
  withTransaction(database, () => {
    const current = getById(database, discussionId);
    if (!current) {
      result = 'not-found';
      return;
    }
    if (!allowedStatuses.includes(current.status)) {
      result = 'state-conflict';
      return;
    }
    const updated = updateStatus(
      database,
      discussionId,
      'failed',
      { errorMessage: '暂时无法生成阵容，请稍后重试' },
      at
    );
    if (!updated) {
      throw new Error('Discussion disappeared during lineup failure update');
    }
    const event: StreamEvent = {
      type: 'discussion.status',
      discussionId,
      at,
      status: updated.status,
      turnCount: updated.turnCount,
      maxTurns: updated.maxTurns
    };
    envelope = persistEvent(database, event);
  });
  if (envelope) {
    broadcastPersisted(bus, envelope);
  }
  return result;
}

function verifyLineupStatus(
  database: DatabaseSync,
  discussionId: string,
  allowedStatuses: readonly DiscussionStatus[]
): 'saved' | 'not-found' | 'state-conflict' {
  let result: 'saved' | 'not-found' | 'state-conflict' = 'saved';
  withTransaction(database, () => {
    const current = getById(database, discussionId);
    if (!current) {
      result = 'not-found';
      return;
    }
    if (!allowedStatuses.includes(current.status)) {
      result = 'state-conflict';
    }
  });
  return result;
}

function getSnapshot(
  deps: DiscussionsRouteDeps,
  discussionId: string
) {
  return buildSnapshot(deps.db, discussionId, {
    viewerCount: deps.bus.viewerCount(discussionId),
    liveUtterance: deps.manager.getLiveUtterance(discussionId)
  });
}

export function createDiscussionsRouter(
  deps: DiscussionsRouteDeps
): Router {
  const router = Router();
  const lineupGenerating = new Set<string>();
  // 仅供测试：设置种子后新建讨论使用可复现的 ID（见 core/deterministicIds）。
  const discussionIdFactory = deps.config.testDiscussionIdSeed
    ? createDiscussionIdFactory(deps.config.testDiscussionIdSeed)
    : null;

  const sendLineupWriteFailure = (
    response: Response,
    result: 'not-found' | 'state-conflict'
  ): void => {
    if (result === 'not-found') {
      sendApiError(response, 404, 'NOT_FOUND', '讨论不存在');
    } else {
      sendApiError(
        response,
        409,
        'INVALID_STATE',
        '讨论状态已改变，无法应用新阵容'
      );
    }
  };

  router.get('/', (request, response) => {
    let statuses: DiscussionStatus[] | undefined;
    const rawStatus = request.query.status;
    if (rawStatus !== undefined) {
      if (typeof rawStatus !== 'string') {
        sendApiError(
          response,
          400,
          'VALIDATION_ERROR',
          '讨论状态筛选无效'
        );
        return;
      }
      const parsed = statusFilterSchema.safeParse(rawStatus.split(','));
      if (!parsed.success) {
        sendApiError(
          response,
          400,
          'VALIDATION_ERROR',
          '讨论状态筛选无效'
        );
        return;
      }
      statuses = parsed.data;
    }
    response.json({
      items: listDiscussions(deps.db, {
        statuses,
        viewerCountOf: (discussionId) => deps.bus.viewerCount(discussionId)
      })
    });
  });

  router.post('/', async (request, response) => {
    const parsed = CreateDiscussionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      sendApiError(
        response,
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '请求参数无效'
      );
      return;
    }

    const discussion = createDiscussion(
      deps.db,
      {
        topic: parsed.data.topic,
        expertCount: parsed.data.expertCount,
        maxTurns: deps.config.maxTurns
      },
      discussionIdFactory
        ? () => discussionIdFactory(parsed.data.topic)
        : undefined
    );
    lineupGenerating.add(discussion.id);
    try {
      let lineup: ReturnType<typeof normalizeLineup>;
      try {
        lineup = await generateLineup(deps, discussion);
      } catch {
        const failure = persistFailedLineup(deps.db, deps.bus, discussion.id, [
          'draft'
        ]);
        if (failure !== 'saved') {
          sendLineupWriteFailure(response, failure);
          return;
        }
        sendApiError(response, 502, 'LLM_ERROR', '暂时无法生成阵容，请稍后重试', [
          { discussionId: discussion.id }
        ]);
        return;
      }
      const persisted = persistReadyLineup(
        deps.db,
        deps.bus,
        discussion.id,
        lineup,
        ['draft']
      );
      if (persisted !== 'saved') {
        sendLineupWriteFailure(response, persisted);
        return;
      }
      const snapshot = getSnapshot(deps, discussion.id);
      if (!snapshot) {
        sendApiError(response, 500, 'INTERNAL', '服务器内部错误');
        return;
      }
      response.status(201).json({ snapshot });
    } finally {
      lineupGenerating.delete(discussion.id);
    }
  });

  router.get('/:id', (request, response) => {
    const snapshot = getSnapshot(deps, request.params.id);
    if (!snapshot) {
      sendApiError(response, 404, 'NOT_FOUND', '讨论不存在');
      return;
    }
    response.json({ snapshot });
  });

  router.post('/:id/lineup/regenerate', async (request, response) => {
    const rawId = request.params.id;
    const discussionId = Array.isArray(rawId) ? rawId[0] ?? '' : rawId;
    const discussion = getById(deps.db, discussionId);
    if (!discussion) {
      sendApiError(response, 404, 'NOT_FOUND', '讨论不存在');
      return;
    }
    if (lineupGenerating.has(discussionId)) {
      sendApiError(
        response,
        409,
        'INVALID_STATE',
        '阵容正在更新，请稍后重试'
      );
      return;
    }
    if (
      discussion.status !== 'lineup_ready' &&
      discussion.status !== 'failed'
    ) {
      sendApiError(response, 409, 'INVALID_STATE', '当前状态不允许更换阵容');
      return;
    }

    const preserveReadyLineup = discussion.status === 'lineup_ready';
    lineupGenerating.add(discussionId);
    try {
      let lineup: ReturnType<typeof normalizeLineup>;
      try {
        lineup = await generateLineup(deps, discussion);
      } catch {
        const failure = preserveReadyLineup
          ? verifyLineupStatus(deps.db, discussionId, ['lineup_ready'])
          : persistFailedLineup(deps.db, deps.bus, discussionId, ['failed']);
        if (failure !== 'saved') {
          sendLineupWriteFailure(response, failure);
          return;
        }
        if (preserveReadyLineup) {
          sendApiError(
            response,
            502,
            'LLM_ERROR',
            '换一批失败，已保留当前阵容，可以重试或直接确认开播',
            [{ discussionId }]
          );
          return;
        }
        sendApiError(response, 502, 'LLM_ERROR', '暂时无法生成阵容，请稍后重试', [
          { discussionId }
        ]);
        return;
      }
      const persisted = persistReadyLineup(
        deps.db,
        deps.bus,
        discussionId,
        lineup,
        ['lineup_ready', 'failed']
      );
      if (persisted !== 'saved') {
        sendLineupWriteFailure(response, persisted);
        return;
      }
      const snapshot = getSnapshot(deps, discussionId);
      if (!snapshot) {
        sendApiError(response, 500, 'INTERNAL', '服务器内部错误');
        return;
      }
      response.json({ snapshot });
    } finally {
      lineupGenerating.delete(discussionId);
    }
  });

  const control = (
    action: 'start' | 'pause' | 'resume' | 'end',
    statusCode: number
  ): RequestHandler => async (request, response) => {
    const rawId = request.params.id;
    const discussionId = Array.isArray(rawId) ? rawId[0] ?? '' : rawId;
    if (!getById(deps.db, discussionId)) {
      sendApiError(response, 404, 'NOT_FOUND', '讨论不存在');
      return;
    }
    if (action === 'start' && lineupGenerating.has(discussionId)) {
      sendApiError(
        response,
        409,
        'INVALID_STATE',
        '阵容正在更新，暂时无法开播'
      );
      return;
    }
    const discussion = deps.manager[action](discussionId);
    if (!discussion) {
      sendApiError(response, 409, 'INVALID_STATE', '当前讨论状态不允许此操作');
      return;
    }
    response.status(statusCode).json({ discussion });
  };

  router.post('/:id/start', control('start', 200));
  router.post('/:id/pause', control('pause', 200));
  router.post('/:id/resume', control('resume', 200));
  router.post('/:id/end', control('end', 202));

  router.delete('/:id', (request, response) => {
    if (!deps.manager.remove(request.params.id)) {
      sendApiError(response, 404, 'NOT_FOUND', '讨论不存在');
      return;
    }
    response.status(204).end();
  });

  return router;
}
