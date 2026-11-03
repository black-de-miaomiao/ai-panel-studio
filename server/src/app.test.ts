import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/connection';

describe('createApp', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = openDatabase(':memory:');
  });

  afterEach(() => {
    database.close();
  });

  it('returns the health response with provider and model names', async () => {
    const app = createApp({ config: loadConfig({}), db: database });
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      llm: {
        provider: 'mock',
        qualityModel: 'deepseek-v4-pro',
        fastModel: 'deepseek-flash'
      }
    });
  });

  it('does not include the configured API key in the health response', async () => {
    const apiKey = 'sk-test-not-a-real-key';
    const config = loadConfig({ LLM_API_KEY: apiKey });
    const app = createApp({ config, db: database });
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain(apiKey);
  });

  it('returns the documented not-found response for unknown routes', async () => {
    const app = createApp({ config: loadConfig({}), db: database });
    const response = await request(app).get('/api/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: '接口不存在'
      }
    });
  });
});
