import express, { type ErrorRequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config';
import type { DiscussionEventBus } from './engine/eventBus';
import type { DiscussionManager } from './engine/manager';
import type { LLMGateway } from './llm/gateway';
import { createDiscussionsRouter } from './routes/discussions';
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

  app.use('/api/discussions', (request, response, next) => {
    const routeDeps = {
      config,
      db: deps.db,
      llm: deps.llm,
      bus: deps.bus,
      manager: deps.manager
    };
    const router = request.path.endsWith('/stream')
      ? createStreamRouter({ db: deps.db, bus: deps.bus })
      : createDiscussionsRouter(routeDeps);
    return router(request, response, next);
  });

  const errorHandler: ErrorRequestHandler = (
    _error,
    _request,
    response,
    _next
  ) => {
    response.status(500).json({
      error: {
        code: 'INTERNAL',
        message: '服务器内部错误'
      }
    });
  };
  app.use(errorHandler);

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: '接口不存在'
      }
    });
  });

  return app;
}
