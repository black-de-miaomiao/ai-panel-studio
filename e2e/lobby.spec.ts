import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiEndDiscussion,
  apiStartDiscussion,
  assertNoInternalEventWords,
  apiGetSnapshot,
  takeShot,
  transcriptItems,
  waitForStatus
} from './fixtures';

/**
 * 大厅：按「直播中 / 待开播 / 往期回放」分组并显示数量（AC-F1-1 / AC-F1-2），
 * 种子讨论可见；打开往期回放后 Transcript、共识与分歧、总结完整显示，
 * 且 Transcript 不暴露「举手 / 抢答 / 准备发言」等内部事件（AC-F6-2 / AC-F7-1）。
 */

const REPLAY_TOPIC = '远程办公会全面取代坐班吗？';
const UPCOMING_TOPIC = 'AI 编程助手会让初级程序员岗位消失吗？';

test('大厅按状态分组显示种子讨论，回放页完整呈现历史讨论', async (
  { page, request },
  testInfo
) => {
  // 冻结轮询：大厅每 5 秒刷新一次，固定首个响应避免计数与卡片错位。
  let cachedList: { status: number; body: string } | null = null;
  await page.route('**/api/discussions', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (cachedList) {
      await route.fulfill(cachedList);
      return;
    }
    const response = await route.fetch();
    cachedList = { status: response.status(), body: await response.text() };
    await route.fulfill(cachedList);
  });

  // 额外造一场已暂停讨论，验证 paused 被标为「已暂停」并归入直播中分组。
  const created = await apiCreateDiscussion(request, {
    topic: '大厅 paused 分组校验',
    expertCount: 3
  });
  const pausedId = created.snapshot.discussion.id;
  await apiStartDiscussion(request, pausedId);
  await request.post(`/api/discussions/${pausedId}/pause`);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '正在发生的观点交锋' })).toBeVisible();

  // 三个分组都存在，且计数与实际卡片数一致。
  for (const key of ['live', 'upcoming', 'replay'] as const) {
    const tab = page.getByTestId(key);
    await expect(tab).toBeVisible();
    const countText = (await tab.locator('.tabs__count').textContent()) ?? '0';
    await tab.click();
    const cards = page.getByTestId('discussion-card');
    await expect(cards).toHaveCount(Number(countText));
  }

  // 待开播分组能看到种子讨论；往期回放分组能看到已结束的种子讨论。
  await page.getByTestId('upcoming').click();
  await expect(page.getByText(UPCOMING_TOPIC)).toBeVisible();
  await page.getByTestId('replay').click();
  await expect(page.getByText(REPLAY_TOPIC)).toBeVisible();
  await expect(
    page.getByTestId('discussion-card').filter({ hasText: REPLAY_TOPIC }).getByText('已结束')
  ).toBeVisible();

  // 同组按 updatedAt 倒序（AC-F1-2）：与 API 返回顺序一致。
  const endedList = await request.get('/api/discussions?status=ended');
  const endedItems = (await endedList.json()).items as Array<{ topic: string }>;
  const uiTopics = await page
    .getByTestId('discussion-card')
    .locator('.discussion-card__topic')
    .allTextContents();
  expect(uiTopics).toEqual(endedItems.map((item) => item.topic));

  // 直播中分组里的 paused 讨论标为「已暂停」。
  await page.getByTestId('live').click();
  const pausedCard = page
    .getByTestId('discussion-card')
    .filter({ hasText: '大厅 paused 分组校验' });
  await expect(pausedCard.getByText('已暂停')).toBeVisible();

  // 打开往期回放种子讨论：Transcript / 洞察 / 总结完整呈现。
  await page.getByTestId('replay').click();
  await page.getByRole('link', { name: `观看回放：${REPLAY_TOPIC}` }).click();
  await waitForStatus(page, '已结束');

  const transcript = transcriptItems(page);
  await expect(transcript.locator('.transcript-item')).toHaveCount(16);
  await expect(transcript.locator('.transcript-item').first()).toContainText('沈知遥');
  await expect(transcript.locator('.transcript-item').first()).toContainText(
    '远程办公会全面取代坐班吗？'
  );
  const transcriptText = (await transcript.textContent()) ?? '';
  assertNoInternalEventWords('回放 Transcript', transcriptText);

  // 桌面端结束态默认显示「主持人总结」。
  await expect(page.getByRole('heading', { name: '本场收束' })).toBeVisible();
  const summaryParagraphs = page.locator('.summary-panel__paragraphs p');
  await expect(summaryParagraphs).toHaveCount(4);
  await expect(summaryParagraphs.first()).toContainText('远程办公');

  // 切换到「共识与分歧」：全部条目及其专家立场可见，已化解分歧有标记。
  await page.getByTestId('studio-desktop-review-tab-insights').click();
  const insightsPanel = page.locator('.studio-insights-desktop');
  await expect(insightsPanel.locator('.insight-item--consensus')).toHaveCount(3);
  await expect(insightsPanel.locator('.insight-item--divergence')).toHaveCount(3);
  await expect(insightsPanel.locator('.insight-item__resolved')).toHaveText('已化解');
  const firstInsight = insightsPanel.locator('.insight-item').first();
  await expect(firstInsight.locator('.insight-stance__name')).toHaveCount(2);
  await expect(firstInsight.locator('.insight-item__evidence')).toContainText('依据发言');

  // 页面上没有 JSON 痕迹。
  const layoutText = (await page.locator('.studio-layout').textContent()) ?? '';
  expect(layoutText).not.toContain('{"');
  expect(layoutText).not.toContain('"type"');
  expect(layoutText).not.toContain('[{');

  await takeShot(page, testInfo, 'lobby-replay');
});
