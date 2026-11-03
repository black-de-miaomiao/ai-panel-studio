import { describe, expect, it } from 'vitest';
import { describeConfig, loadConfig } from './config';

describe('loadConfig', () => {
  it('uses the documented defaults and mock provider without a key', () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      port: 8787,
      databasePath: './data/panel.db',
      llm: {
        provider: 'mock',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        qualityModel: 'deepseek-v4-pro',
        fastModel: 'deepseek-flash',
        maxConcurrency: 6
      },
      maxTurns: 16,
      pacingMs: 800,
      mockLatencyMs: 400,
      mockStreamDelayMs: 30
    });
  });

  it('selects deepseek when an API key is supplied without an explicit provider', () => {
    const config = loadConfig({ LLM_API_KEY: 'sk-test-not-a-real-key' });

    expect(config.llm.provider).toBe('deepseek');
  });

  it('uses mock when no API key is supplied', () => {
    const config = loadConfig({ LLM_API_KEY: '' });

    expect(config.llm.provider).toBe('mock');
  });

  it('lets an explicit mock provider take precedence over an API key', () => {
    const config = loadConfig({
      LLM_API_KEY: 'sk-test-not-a-real-key',
      LLM_PROVIDER: 'mock'
    });

    expect(config.llm.provider).toBe('mock');
  });

  it('describes key presence without exposing the key', () => {
    const apiKey = 'sk-test-not-a-real-key';
    const config = loadConfig({ LLM_API_KEY: apiKey });
    const description = JSON.stringify(describeConfig(config));

    expect(description).toContain('"hasApiKey":true');
    expect(description).not.toContain(apiKey);
  });
});
