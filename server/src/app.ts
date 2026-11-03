import express, { type ErrorRequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config';

export function createApp(deps: {
  config: AppConfig;
  db: DatabaseSync;
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
