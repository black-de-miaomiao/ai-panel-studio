import { expect, test } from '@playwright/test';
import { takeShot, transcriptItems, waitForStatus } from './fixtures';

/**
 * 真实模型场景（可选，默认跳过）：只有设置 E2E_REAL_LLM=1 时才运行，
 * 由 playwright.real-llm.config.ts 驱动不设 LLM_PROVIDER、不覆盖 LLM_API_KEY
 * 的后端（使用 server/.env 的真实 Key），MAX_TURNS=8。
 * 走一遍主流程，留存阵容确认、直播中、结束三张截图与耗时数据。
 * 本测试不读取、不打印 server/.env。
 */

const TOPIC = '远程办公会全面取代固定坐班吗？';

test('真实模型：主流程端到端证据', async ({ page }, testInfo) => {
  test.skip(!process.env.E2E_REAL_LLM, '设置 E2E_REAL_LLM=1 后运行');
  test.setTimeout(280_000);

  const startedAt = Date.now();
  await page.goto('/new');
  await page.getByLabel('今晚想聊什么？').fill(TOPIC);
  await page.getByRole('button', { name: '减少专家人数' }).click();
  await expect(page.locator('.expert-stepper__value')).toHaveText('3');
  await page.getByRole('button', { name: '生成嘉宾阵容' }).click();

  // 阵容生成耗时。
  await expect(page.getByTestId('lineup-review')).toBeVisible({
    timeout: 120_000
  });
  const lineupMs = Date.now() - startedAt;
  const guestCards = page.locator('.guest-card');
  await expect(guestCards).toHaveCount(3);
  await takeShot(page, testInfo, 'real-llm-lineup');

  // 确认开播。
  await page.getByRole('button', { name: '确认阵容，进入演播厅' }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]{36}$/);
  await waitForStatus(page, 'LIVE');

  // 首条专家发言出现时间（Transcript 第二条，跳过主持人开场）。
  const transcript = transcriptItems(page);
  await expect(transcript.locator('.transcript-item').nth(1)).toBeVisible({
    timeout: 120_000
  });
  const firstExpertMs = Date.now() - startedAt;

  // 直播中：等至少一位专家发言完成且洞察区出现条目。
  await expect(
    page.locator('.studio-insights-desktop .insight-item').first()
  ).toBeVisible({ timeout: 180_000 });
  await takeShot(page, testInfo, 'real-llm-live');

  // 结束。
  await waitForStatus(page, '已结束', 180_000);  await expect(page.locator('.summary-panel__paragraphs p').first()).toBeVisible();
  await takeShot(page, testInfo, 'real-llm-ended');
  const totalMs = Date.now() - startedAt;

  const summary = {
    provider: 'deepseek (server/.env)',
    maxTurns: 8,
    lineupMs,
    firstExpertSpeechMs: firstExpertMs,
    totalMs,
    transcriptCount: await transcript.locator('.transcript-item').count(),
    insightCount: await page.locator('.studio-insights-desktop .insight-item').count()
  };
  console.log(`REAL_LLM_TIMING ${JSON.stringify(summary)}`);
  testInfo.attach('real-llm-timing.json', {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json'
  });
});
