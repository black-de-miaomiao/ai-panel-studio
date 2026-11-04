import { expect, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { API_BASE } from './ports';

/**
 * E2E fixtures：API 辅助函数 + 页面等待/截图助手。
 * 只用 Playwright 的等待机制（expect.poll / toHaveCount / evaluate），不用固定 sleep；
 * 唯一例外是「一段时间内不再增长」的观察窗口（见 controls.spec.ts，任务书明确允许）。
 */

// —— 本地契约类型：与 @aps/shared 的结构对齐，避免 E2E 依赖 shared 包的运行时加载。 ——
export interface ApiDiscussion {
  id: string;
  topic: string;
  expertCount: number;
  status: string;
  maxTurns: number;
  turnCount: number;
  summary: string | null;
  errorMessage: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ApiParticipant {
  id: string;
  discussionId: string;
  role: 'host' | 'expert';
  seat: number;
  name: string;
  profession: string;
  title: string;
  stance: string;
  stanceTag: string;
  persona: string;
  color: string;
  avatar: string;
  agentState: string;
  agentIntent: string | null;
  focus: string | null;
  speakCount: number;
}

export interface ApiUtterance {
  id: string;
  discussionId: string;
  participantId: string;
  seq: number;
  act: string;
  replyToParticipantId: string | null;
  content: string;
  createdAt: string;
}

export interface ApiInsightStance {
  participantId: string;
  position: string;
}

export interface ApiInsight {
  id: string;
  discussionId: string;
  kind: 'consensus' | 'divergence';
  content: string;
  status: string;
  stances: ApiInsightStance[];
  evidenceSeqs: number[];
  updatedAtSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSnapshot {
  discussion: ApiDiscussion;
  participants: ApiParticipant[];
  utterances: ApiUtterance[];
  insights: ApiInsight[];
  liveUtterance: {
    utteranceId: string;
    participantId: string;
    act: string;
    replyToParticipantId: string | null;
    seq: number;
    text: string;
  } | null;
  lastEventSeq: number;
  viewerCount: number;
}

export interface SseRecord {
  type: string;
  discussionId: string;
  at: string;
  [key: string]: unknown;
}

/** 内部事件文字：不得出现在 Transcript、导出文件等用户可见内容里。 */
export const INTERNAL_EVENT_WORDS = ['举手', '抢答', '准备发言'] as const;

/** 泄漏检测禁用串：假 Key、隐藏思维链字段、真实服务商地址。 */
export const FORBIDDEN_STRINGS = [
  'sk-test-not-a-real-key',
  'reasoning_content',
  'api.deepseek.com'
] as const;

// —— API 辅助（直连后端 8790，避免与浏览器链路混在一起；浏览器侧走 vite preview 代理） ——

async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown; expectedStatus?: number }
): Promise<T> {
  const method = init?.method ?? 'GET';
  const response = await request.fetch(`${API_BASE}${path}`, {
    method,
    ...(init?.body === undefined
      ? {}
      : { data: init.body, headers: { 'Content-Type': 'application/json' } })
  });
  const expected = init?.expectedStatus ?? (method === 'POST' ? 200 : 200);
  const text = await response.text();
  expect(
    response.status(),
    `${method} ${path} -> ${response.status()}: ${text.slice(0, 300)}`
  ).toBe(expected);
  return (text ? JSON.parse(text) : null) as T;
}

export function apiCreateDiscussion(
  request: APIRequestContext,
  input: { topic: string; expertCount?: number }
): Promise<{ snapshot: ApiSnapshot }> {
  return apiJson(request, '/discussions', {
    method: 'POST',
    body: input,
    expectedStatus: 201
  });
}

export function apiRegenerateLineup(
  request: APIRequestContext,
  discussionId: string
): Promise<{ snapshot: ApiSnapshot }> {
  return apiJson(request, `/discussions/${discussionId}/lineup/regenerate`, {
    method: 'POST'
  });
}

export function apiStartDiscussion(
  request: APIRequestContext,
  discussionId: string
): Promise<{ discussion: ApiDiscussion }> {
  return apiJson(request, `/discussions/${discussionId}/start`, { method: 'POST' });
}

export function apiEndDiscussion(
  request: APIRequestContext,
  discussionId: string
): Promise<{ discussion: ApiDiscussion }> {
  return apiJson(request, `/discussions/${discussionId}/end`, {
    method: 'POST',
    expectedStatus: 202
  });
}

export function apiGetSnapshot(
  request: APIRequestContext,
  discussionId: string
): Promise<{ snapshot: ApiSnapshot }> {
  return apiJson(request, `/discussions/${discussionId}`);
}

/** 轮询快照直到讨论进入目标状态。 */
export async function apiWaitForStatus(
  request: APIRequestContext,
  discussionId: string,
  status: string,
  timeoutMs = 80_000
): Promise<ApiSnapshot> {
  let latest: ApiSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const body = await apiGetSnapshot(request, discussionId);
        latest = body.snapshot;
        return body.snapshot.discussion.status;
      },
      { timeout: timeoutMs, intervals: [250] }
    )
    .toBe(status);
  return latest as unknown as ApiSnapshot;
}

// —— 页面助手 ——

/** 等待演播厅头部状态徽标显示指定文案（live 显示 LIVE）。 */
export async function waitForStatus(
  page: Page,
  label: string,
  timeout = 30_000
): Promise<void> {
  await expect(page.getByTestId('studio-status')).toHaveText(label, { timeout });
}

export async function openStudio(page: Page, discussionId: string): Promise<void> {
  await page.goto(`/studio/${discussionId}`);
  await expect(page.getByTestId('studio-status')).toBeVisible();
}

export function transcriptItems(page: Page): Locator {
  // role=log 只匹配可见的那一个实录面板（桌面 / 窄屏互斥显示）。
  return page.getByRole('log', { name: '已完成的现场发言' });
}

export interface TranscriptEntry {
  seq: number;
  speaker: string;
  title: string;
  text: string;
}

export async function readTranscript(page: Page): Promise<TranscriptEntry[]> {
  return transcriptItems(page)
    .locator('.transcript-item')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        seq: Number(node.getAttribute('data-seq')),
        speaker: node.querySelector('strong')?.textContent ?? '',
        title: node.querySelector('.transcript-item__title')?.textContent ?? '',
        text: node.querySelector('p')?.textContent ?? ''
      }))
    );
}

/** 设置 E2E_SHOTS_DIR 时保存 {场景}-{project}.png 审查截图；未设置时不保存。 */
export async function takeShot(
  page: Page,
  testInfo: TestInfo,
  scene: string
): Promise<void> {
  const directory = process.env.E2E_SHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: join(directory, `${scene}-${testInfo.project.name}.png`)
  });
}

/** 在页面内挂一个 SSE 收集器（与前端平行连接），用于核对流式推送顺序。 */
export async function startSseCollector(
  page: Page,
  discussionId: string,
  since = 0
): Promise<void> {
  await page.evaluate(
    ({ id, since: cursor }) => {
      const store = window as unknown as {
        __e2eSseRecords: string[];
        __e2eSseSource?: EventSource;
      };
      store.__e2eSseRecords = [];
      const source = new EventSource(
        `/api/discussions/${encodeURIComponent(id)}/stream?since=${cursor}`
      );
      source.onmessage = (event) => {
        store.__e2eSseRecords.push(event.data);
      };
      store.__e2eSseSource = source;
    },
    { id: discussionId, since }
  );
}

export async function stopSseCollector(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __e2eSseSource?: EventSource };
    store.__e2eSseSource?.close();
    store.__e2eSseSource = undefined;
  });
}

export async function readSseRecords(page: Page): Promise<SseRecord[]> {
  const raw = await page.evaluate(() => {
    const store = window as unknown as { __e2eSseRecords: string[] };
    return store.__e2eSseRecords ?? [];
  });
  return raw.map((line) => JSON.parse(line) as SseRecord);
}

/** 收集页面期间的全部响应体（跳过 SSE 长连接，单独用 startSseCollector 覆盖）。 */
export interface CollectedResponse {
  url: string;
  contentType: string;
  status: number;
  text: string;
}

export function collectResponseBodies(page: Page): {
  responses: CollectedResponse[];
  settle: () => Promise<void>;
} {
  const responses: CollectedResponse[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (response) => {
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('text/event-stream')) return;
    const url = response.url();
    pending.push(
      response
        .text()
        .then((text) => {
          responses.push({ url, contentType, status: response.status(), text });
        })
        .catch(() => undefined)
    );
  });
  return {
    responses,
    settle: () => Promise.all(pending).then(() => undefined)
  };
}

export function assertNoForbiddenStrings(
  where: string,
  text: string,
  forbidden: readonly string[] = FORBIDDEN_STRINGS
): void {
  for (const needle of forbidden) {
    expect(text.includes(needle), `${where} 包含禁止出现的字符串「${needle}」`).toBe(
      false
    );
  }
}

export function assertNoInternalEventWords(where: string, text: string): void {
  for (const word of INTERNAL_EVENT_WORDS) {
    expect(text.includes(word), `${where} 包含内部事件文字「${word}」`).toBe(false);
  }
}

/** 统计正文发言的句数（句末标记：。！？!? 与省略号）。 */
export function countSentences(text: string): number {
  return (text.match(/[。！？!?]|…{1,2}/gu) ?? []).length;
}

/** 页面整体不滚动（应用外壳 overflow:hidden，滚动只允许发生在内容区域）。 */
export async function expectPageNotScrolled(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement;
    return {
      scrollHeight: root?.scrollHeight ?? document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY
    };
  });
  expect(metrics.scrollY).toBe(0);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
}

/** 内容区域可以在自身容器内滚动，且不影响页面位置。 */
export async function expectRegionScrollsIndependently(
  page: Page,
  region: Locator
): Promise<void> {
  const metrics = await region.evaluate((element) => {
    const before = window.scrollY;
    element.scrollTop = 240;
    return {
      scrollTop: element.scrollTop,
      pageScrollY: window.scrollY,
      before,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  });
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollTop).toBeGreaterThan(0);
  expect(metrics.pageScrollY).toBe(metrics.before);
}

/** 等待某区域出现至少 count 个元素。 */
export async function waitForCount(
  locator: Locator,
  count: number,
  timeout = 30_000
): Promise<void> {
  await expect(locator).toHaveCount(count, { timeout });
}
