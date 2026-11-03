import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const envFilePath = fileURLToPath(new URL('../.env', import.meta.url));

const providerSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.enum(['deepseek', 'mock']).optional()
);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_PATH: z.string().default('./data/panel.db'),
  LLM_PROVIDER: providerSchema,
  LLM_API_KEY: z.string().default(''),
  LLM_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  LLM_MODEL_QUALITY: z.string().min(1).default('deepseek-v4-pro'),
  LLM_MODEL_FAST: z.string().min(1).default('deepseek-flash'),
  LLM_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(6),
  MAX_TURNS: z.coerce.number().int().min(1).default(16),
  PACING_MS: z.coerce.number().int().min(0).default(800),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(400),
  MOCK_STREAM_DELAY_MS: z.coerce.number().int().min(0).default(30)
});

export type LlmProvider = 'deepseek' | 'mock';

export interface AppConfig {
  port: number;
  databasePath: string;
  llm: {
    provider: LlmProvider;
    apiKey: string;
    baseUrl: string;
    qualityModel: string;
    fastModel: string;
    maxConcurrency: number;
  };
  maxTurns: number;
  pacingMs: number;
  mockLatencyMs: number;
  mockStreamDelayMs: number;
}

export function loadDotEnv(): void {
  if (existsSync(envFilePath)) {
    process.loadEnvFile(envFilePath);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const provider =
    parsed.LLM_PROVIDER ??
    (parsed.LLM_API_KEY.trim().length > 0 ? 'deepseek' : 'mock');

  return {
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    llm: {
      provider,
      apiKey: parsed.LLM_API_KEY,
      baseUrl: parsed.LLM_BASE_URL,
      qualityModel: parsed.LLM_MODEL_QUALITY,
      fastModel: parsed.LLM_MODEL_FAST,
      maxConcurrency: parsed.LLM_MAX_CONCURRENCY
    },
    maxTurns: parsed.MAX_TURNS,
    pacingMs: parsed.PACING_MS,
    mockLatencyMs: parsed.MOCK_LATENCY_MS,
    mockStreamDelayMs: parsed.MOCK_STREAM_DELAY_MS
  };
}

export function describeConfig(config: AppConfig) {
  return {
    port: config.port,
    databasePath: config.databasePath,
    llm: {
      provider: config.llm.provider,
      baseUrl: config.llm.baseUrl,
      qualityModel: config.llm.qualityModel,
      fastModel: config.llm.fastModel,
      maxConcurrency: config.llm.maxConcurrency,
      hasApiKey: config.llm.apiKey.length > 0
    },
    maxTurns: config.maxTurns,
    pacingMs: config.pacingMs,
    mockLatencyMs: config.mockLatencyMs,
    mockStreamDelayMs: config.mockStreamDelayMs
  };
}
