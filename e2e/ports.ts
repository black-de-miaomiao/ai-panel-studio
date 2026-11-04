/**
 * E2E 端口约定：与 playwright.config.ts、playwright.real-llm.config.ts 保持一致。
 * 避开开发默认端口（server 8787 / web 5173），防止与本地 dev 进程互相干扰。
 */
export const BACKEND_PORT = 8790;
export const WEB_PORT = 5180;

export const API_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
export const API_BASE = `${API_ORIGIN}/api`;

/** E2E 后端的测试种子：固定讨论 ID，使整场讨论可复现（见 server/src/core/deterministicIds.ts）。 */
export const TEST_DISCUSSION_ID_SEED = 'e2e-a';

/** 供泄漏检测使用的假 Key（AGENTS.md 安全红线：任何代码里都不得出现真实 Key）。 */
export const FAKE_API_KEY = 'sk-test-not-a-real-key';
