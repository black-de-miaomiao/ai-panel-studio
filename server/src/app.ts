import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config';
import type { DiscussionEventBus } from './engine/eventBus';
import type { DiscussionManager } from './engine/manager';
import type { LLMGateway } from './llm/gateway';
import { createDiscussionsRouter } from './routes/discussions';
import { sendApiError } from './routes/errors';
import { createStreamRouter } from './routes/stream';

export function createApp(deps: {
  config: AppConfig;
  db: DatabaseSync;
  llm: LLMGateway;
  bus: DiscussionEventBus;
  manager: DiscussionManager;
}): express.Express {
  const { config } = deps;
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      llm: {
        provider: config.llm.provider,
        qualityModel: config.llm.qualityModel,
        fastModel: config.llm.fastModel
      }
    });
  });

  app.use('/api/discussions', createDiscussionsRouter(deps));
  app.use(
    '/api/discussions',
    createStreamRouter({ db: deps.db, bus: deps.bus })
  );

  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next
  ) => {
    if (error instanceof z.ZodError) {
      sendApiError(
        response,
        400,
        'VALIDATION_ERROR',
        error.issues[0]?.message ?? '请求参数无效'
      );
      return;
    }
    if (
      error instanceof SyntaxError &&
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.parse.failed'
    ) {
      sendApiError(
        response,
        400,
        'VALIDATION_ERROR',
        '请求体 JSON 格式无效'
      );
      return;
    }
    sendApiError(response, 500, 'INTERNAL', '服务器内部错误');
  };
  app.use(errorHandler);

  app.use((_request, response) => {
    sendApiError(response, 404, 'NOT_FOUND', '接口不存在');
  });

  return app;
}
