import type { DatabaseSync } from 'node:sqlite';
import type {
  Discussion,
  LiveUtterance,
  StreamEvent
} from '@aps/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/connection';
import type { DiscussionEventBus } from './engine/eventBus';
import type { DiscussionManager } from './engine/manager';
import type { LLMGateway } from './llm/gateway';

function createAppDeps(config: ReturnType<typeof loadConfig>, db: DatabaseSync) {
  const llm: LLMGateway = {
    providerName: 'mock',
    models: {
      quality: config.llm.qualityModel,
      fast: config.llm.fastModel
    },
    complete: async () => ({ text: '' }),
    async *stream() {
      yield '';
    }
  };
  const bus: DiscussionEventBus = {
    publish: (event: StreamEvent) => ({ event, seq: null }),
    subscribe: () => () => undefined,
    viewerCount: () => 0,
    closeDiscussion: () => undefined
  };
  const manager: DiscussionManager = {
    start: (_discussionId: string): Discussion | null => null,
    pause: (_discussionId: string): Discussion | null => null,
    resume: (_discussionId: string): Discussion | null => null,
    end: (_discussionId: string): Discussion | null => null,
    remove: (_discussionId: string) => false,
    recoverOnBoot: () => undefined,
    getLiveUtterance: (_discussionId: string): LiveUtterance | null => null,
    stopAll: () => undefined
  };
  return { config, db, llm, bus, manager };
}

describe('createApp', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = openDatabase(':memory:');
  });

  afterEach(() => {
    database.close();
  });

  it('returns the health response with provider and model names', async () => {
    const app = createApp(createAppDeps(loadConfig({}), database));
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
    const app = createApp(createAppDeps(config, database));
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain(apiKey);
  });

  it('returns the documented not-found response for unknown routes', async () => {
    const app = createApp(createAppDeps(loadConfig({}), database));
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
