import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  assertNoInternalEventWords,
  openStudio,
  readTranscript,
  takeShot,
  transcriptItems,
  waitForStatus
} from './fixtures';

/**
 * 主流程（AC-F1-4 / AC-F2-1..7 / AC-F3-1..3 / AC-F5-1 / AC-F6-1..2 / AC-F7-1..2 / AC-F8-1..2）：
 * /new 输入与校验 → 生成阵容（骨架屏）→ 换一批（含 502 失败）→ 确认开播 →
 * 直播中的小窗状态与流式字幕 → 结束后的总结 → 导出 Markdown。
 * 讨论 ID 由 TEST_DISCUSSION_ID_SEED 固定，整场走向可复现。
 */

const TOPIC = 'AI 助手应该先进入哪些企业客服场景？';
const REGENERATE_FAILURE_MESSAGE = '换一批失败，已保留当前阵容，可以重试或直接确认开播';

test('主流程：校验、阵容、换一批失败恢复、直播与结束导出', async (
  { page },
  testInfo
) => {
  // —— 1. 话题校验：1 个字被拒绝 ——
  await page.goto('/new');
  await page.getByLabel('今晚想聊什么？').fill('x');
  await page.getByRole('button', { name: '生成嘉宾阵容' }).click();
  await expect(page.locator('#topic-validation')).toHaveText(
    '话题长度需在 2–200 字之间'
  );
  await expect(page.locator('.topic-form__inline-hint')).toHaveText(
    '话题至少需要 2 字'
  );

  // —— 2. 输入话题、选择 3 位专家，观察骨架屏 ——
  await page.getByLabel('今晚想聊什么？').fill(TOPIC);
  await page.getByRole('button', { name: '减少专家人数' }).click();
  await expect(page.locator('.expert-stepper__value')).toHaveText('3');

  // 延迟创建响应，确保骨架屏可被稳定观察（只改时序，不改内容）。
  await page.route('**/api/discussions', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.getByRole('button', { name: '生成嘉宾阵容' }).click();
  await expect(
    page.getByRole('status', { name: '正在生成嘉宾阵容' })
  ).toBeVisible();

  // —— 3. 阵容：1 主持人 + 3 专家，字段完整、颜色互斥 ——
  await expect(page.getByTestId('lineup-review')).toBeVisible();
  // 响应落地后再摘除路由：在途请求期间 unroute 会让 Playwright 立即放行并重复处理。
  await page.unroute('**/api/discussions');
  const hostCard = page.locator('.host-lineup-card');
  await expect(hostCard).toBeVisible();
  const hostName = ((await hostCard.locator('h3').textContent()) ?? '').trim();
  expect(hostName.length).toBeGreaterThan(1);
  await expect(hostCard).toContainText('圆桌主持人');

  const guestCards = page.locator('.guest-card');
  await expect(guestCards).toHaveCount(3);
  const expertNames = await guestCards.locator('h3').allTextContents();
  expect(expertNames).toHaveLength(3);
  expect(new Set(expertNames).size).toBe(3);
  for (let index = 0; index < 3; index += 1) {
    const card = guestCards.nth(index);
    await expect(card.locator('p').first()).toContainText(' · ');
    await expect(card.locator('.badge')).not.toBeEmpty();
    const seatColor = await card.evaluate((element) =>
      element.style.getPropertyValue('--seat-color')
    );
    expect(seatColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  }
  const seatColors = await guestCards.evaluateAll((cards) =>
    cards.map((card) => card.style.getPropertyValue('--seat-color'))
  );
  expect(new Set(seatColors).size).toBe(3);
  await expect(
    page.getByRole('button', { name: '确认阵容，进入演播厅' })
  ).toBeEnabled();
  await takeShot(page, testInfo, 'create-and-live-lineup');

  // —— 4. 换一批：专家姓名变化，仍可确认 ——
  await page.getByRole('button', { name: '换一批' }).click();
  await expect
    .poll(async () => (await guestCards.locator('h3').allTextContents()).join('|'), {
      timeout: 20_000
    })
    .not.toBe(expertNames.join('|'));
  await expect(guestCards).toHaveCount(3);
  await expect(page.locator('.host-lineup-card h3')).not.toHaveText(hostName);
  const lineupNames = await guestCards.locator('h3').allTextContents();
  const lineupHostName = (
    (await page.locator('.host-lineup-card h3').textContent()) ?? ''
  ).trim();

  // —— 5. 换一批失败（AC-F2-7）：502 + 服务端错误体，原阵容保留、仍可开播 ——
  let failedDiscussionId = '';
  await page.route('**/api/discussions/*/lineup/regenerate', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    failedDiscussionId = decodeURIComponent(pathname.split('/')[3] ?? '');
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'LLM_ERROR',
          message: REGENERATE_FAILURE_MESSAGE,
          details: [{ discussionId: failedDiscussionId }]
        }
      })
    });
  });
  await page.getByRole('button', { name: '换一批' }).click();
  await expect(page.getByRole('alert')).toContainText(REGENERATE_FAILURE_MESSAGE);
  expect(failedDiscussionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await guestCards.locator('h3').allTextContents()).toEqual(lineupNames);
  await expect(
    page.getByRole('button', { name: '确认阵容，进入演播厅' })
  ).toBeEnabled();
  await page.unroute('**/api/discussions/*/lineup/regenerate');

  // —— 6. 确认开播，进入演播厅 ——
  await page.getByRole('button', { name: '确认阵容，进入演播厅' }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]{36}$/);
  await waitForStatus(page, 'LIVE');

  // 记录专家小窗状态与字幕的历史轨迹（状态切换是毫秒级瞬态，用 MutationObserver 观察）。
  await page.evaluate(() => {
    const store = window as unknown as {
      __e2eWindowStates: Array<{
        name: string;
        state: string;
        intent: string;
        captionLive: boolean;
        captionText: string;
      }>;
    };
    store.__e2eWindowStates = [];
    const record = () => {
      document.querySelectorAll('.expert-window').forEach((element) => {
        const expertWindow = element as HTMLElement;
        store.__e2eWindowStates.push({
          name: expertWindow.querySelector('h3')?.textContent ?? '',
          state: expertWindow.getAttribute('data-state') ?? '',
          intent:
            expertWindow.querySelector('.expert-window__intent')?.textContent ??
            '',
          captionLive: false,
          captionText: ''
        });
      });
      const caption = document.querySelector('.on-air-caption__text');
      if (caption?.classList.contains('is-live')) {
        store.__e2eWindowStates.push({
          name: '',
          state: 'caption',
          intent: '',
          captionLive: true,
          captionText: caption.textContent ?? ''
        });
      }
    };
    new MutationObserver(record).observe(document.body, {
      subtree: true,
      attributes: true,
      childList: true
    });
    record();
  });

  // 第一条 Transcript 是主持人开场。
  const transcript = transcriptItems(page);
  await expect(transcript.locator('.transcript-item').first()).toContainText(
    lineupHostName,
    { timeout: 30_000 }
  );
  await expect(transcript.locator('.transcript-item').first()).toContainText(TOPIC);

  // 结束前，共识或分歧至少出现 1 条。
  await expect
    .poll(
      async () => {
        const status = await page.getByTestId('studio-status').textContent();
        if (status === '已结束') return 'ended';
        const count = await page
          .locator('.studio-insights-desktop .insight-item')
          .count();
        return count > 0 ? 'insight' : 'pending';
      },
      { timeout: 70_000, intervals: [300] }
    )
    .toBe('insight');
  await takeShot(page, testInfo, 'create-and-live-live');

  // —— 7. 结束后的总结 ——
  await waitForStatus(page, '已结束');
  const summaryParagraphs = page.locator('.summary-panel__paragraphs p');
  await expect(summaryParagraphs).toHaveCount(4, { timeout: 15_000 });
  const summaryText =
    (await page.locator('.summary-panel__paragraphs').textContent()) ?? '';
  expect(summaryText).toContain(TOPIC);
  await takeShot(page, testInfo, 'create-and-live-ended');

  // 页面没有 JSON 痕迹。
  const layoutText = (await page.locator('.studio-layout').textContent()) ?? '';
  expect(layoutText).not.toContain('{"');
  expect(layoutText).not.toContain('"type"');
  expect(layoutText).not.toContain('[{');
  assertNoInternalEventWords('演播厅', layoutText);

  // 瞬态状态确实出现过：准备发言（带意图徽标）、发言中、流式字幕。
  const windowStates = await page.evaluate(() => {
    const store = window as unknown as {
      __e2eWindowStates: Array<{
        name: string;
        state: string;
        intent: string;
        captionLive: boolean;
        captionText: string;
      }>;
    };
    return store.__e2eWindowStates;
  });
  expect(
    windowStates.some((entry) => entry.state === 'preparing' && entry.intent.length > 0),
    '未观察到专家小窗进入准备发言（带意图徽标）'
  ).toBe(true);
  expect(
    windowStates.some((entry) => entry.state === 'speaking'),
    '未观察到专家小窗进入发言中'
  ).toBe(true);
  expect(
    windowStates.some((entry) => entry.captionLive && entry.captionText.length > 0),
    '未观察到流式字幕的部分文本'
  ).toBe(true);

  // —— 8. 导出 Markdown（AC-F8-1 / AC-F8-2） ——
  const finalTranscript = await readTranscript(page);
  expect(finalTranscript.length).toBeGreaterThan(3);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出实录（Markdown）' }).click()
  ]);
  const downloadPath = await download.path();
  const markdown = await readFile(downloadPath, 'utf8');
  expect(markdown).toContain(TOPIC);
  expect(markdown).toContain(lineupHostName);
  for (const name of lineupNames) {
    expect(markdown).toContain(name);
  }
  for (const entry of finalTranscript) {
    expect(markdown).toContain(entry.text);
  }
  assertNoInternalEventWords('导出 Markdown', markdown);
  expect(markdown).not.toContain('reasoning_content');
});
