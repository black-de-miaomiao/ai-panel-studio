import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API_ORIGIN,
  BACKEND_PORT,
  TEST_DISCUSSION_ID_SEED,
  WEB_PORT,
  FAKE_API_KEY
} from './e2e/ports';

/**
 * E2E 使用独立的临时数据库与端口，绝不触碰开发库；进程环境变量优先于
 * server/.env（process.loadEnvFile 不覆盖已存在的变量），因此 E2E 永远跑在
 * mock 提供商上，不会加载真实 Key。
 */
const databasePath = join(
  mkdtempSync(join(tmpdir(), 'aps-e2e-')),
  'panel.db'
);

const backendWebServer = {
  command: 'npm run start -w @aps/server',
  url: `${API_ORIGIN}/api/health`,
  reuseExistingServer: false,
  env: {
    PORT: String(BACKEND_PORT),
    LLM_PROVIDER: 'mock',
    LLM_API_KEY: FAKE_API_KEY,
    DATABASE_PATH: databasePath,
    MAX_TURNS: '12',
    PACING_MS: '150',
    MOCK_LATENCY_MS: '40',
    MOCK_STREAM_DELAY_MS: '20',
    TEST_DISCUSSION_ID_SEED
  }
};

const frontendWebServer = {
  command: 'npm run build -w @aps/web && npm run preview:e2e -w @aps/web',
  url: `http://127.0.0.1:${WEB_PORT}/`,
  reuseExistingServer: false,
  env: {
    API_PROXY_TARGET: API_ORIGIN
  }
};

const sharedUse = {
  baseURL: `http://127.0.0.1:${WEB_PORT}`,
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
  video: 'off' as const
};

/** 布局场景在四个视口都跑；功能场景只在 desktop 跑。 */
const LAYOUT_MATCH = '**/layout.spec.ts';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  // 真实模型场景默认不跑，由 playwright.real-llm.config.ts 单独驱动。
  testIgnore: ['**/real-llm.spec.ts'],
  webServer: [backendWebServer, frontendWebServer],
  projects: [
    {
      name: 'desktop',
      use: {
        ...sharedUse,
        channel: 'msedge',
        viewport: { width: 1440, height: 900 }
      },
      testIgnore: [LAYOUT_MATCH]
    },
    {
      name: 'fhd',
      use: {
        ...sharedUse,
        channel: 'msedge',
        viewport: { width: 1920, height: 1080 }
      },
      testMatch: [LAYOUT_MATCH]
    },
    {
      name: 'ultrawide',
      use: {
        ...sharedUse,
        channel: 'msedge',
        viewport: { width: 2560, height: 1080 }
      },
      testMatch: [LAYOUT_MATCH]
    },
    {
      name: 'mobile',
      use: {
        ...sharedUse,
        channel: 'msedge',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3
      },
      testMatch: [LAYOUT_MATCH]
    }
  ]
});
