import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_ORIGIN, BACKEND_PORT, WEB_PORT } from './e2e/ports';

/**
 * 真实模型场景专用配置：只跑 real-llm.spec.ts。
 * 后端不设 LLM_PROVIDER、不覆盖 LLM_API_KEY，由服务自己加载 server/.env 的
 * 真实 Key；轮次上限 8，与任务书一致。测试本身不读取、不打印 server/.env。
 */
const databasePath = join(
  mkdtempSync(join(tmpdir(), 'aps-e2e-real-')),
  'panel.db'
);

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/real-llm.spec.ts'],
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: 'msedge',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: [
    {
      command: 'npm run start -w @aps/server',
      url: `${API_ORIGIN}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(BACKEND_PORT),
        DATABASE_PATH: databasePath,
        MAX_TURNS: '8',
        PACING_MS: '300'
        // 不设置 LLM_PROVIDER / LLM_API_KEY：由服务自己加载 server/.env 的真实 Key。
      }
    },
    {
      command: 'npm run build -w @aps/web && npm run preview:e2e -w @aps/web',
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: false,
      env: {
        API_PROXY_TARGET: API_ORIGIN
      }
    }
  ],
  projects: [{ name: 'desktop' }]
});
