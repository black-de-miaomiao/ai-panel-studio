import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiStartDiscussion,
  expectPageNotScrolled,
  expectRegionScrollsIndependently,
  openStudio,
  takeShot,
  transcriptItems,
  waitForStatus
} from './fixtures';

/**
 * 响应式布局（UI-DESIGN 断点约定；四个视口都跑）：
 * 大厅、新建页、直播中的演播厅里页面本身不滚动；
 * Transcript 等内容区域在自身容器内独立滚动；
 * 窄屏下 Tab 能在「实录 / 共识与分歧 / 总结」之间切换。
 */

const TOPIC = '短视频正在改变年轻人的阅读习惯吗？';

test('布局：页面不滚动、区域独立滚动、窄屏 Tab 可切换', async ({
  page,
  request
}, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';

  // 大厅
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '正在发生的观点交锋' })
  ).toBeVisible();
  await expectPageNotScrolled(page);

  // 新建页
  await page.goto('/new');
  await expect(page.getByLabel('今晚想聊什么？')).toBeVisible();
  await expectPageNotScrolled(page);

  // 演播厅（直播中，Transcript 已经溢出自身容器）
  const created = await apiCreateDiscussion(request, {
    topic: TOPIC,
    expertCount: 3
  });
  const discussionId = created.snapshot.discussion.id;
  await apiStartDiscussion(request, discussionId);
  await openStudio(page, discussionId);
  await waitForStatus(page, 'LIVE');

  const transcript = transcriptItems(page);
  await expect
    .poll(
      async () =>
        transcript.evaluate(
          (element) => element.scrollHeight > element.clientHeight + 8
        ),
      { timeout: 45_000, intervals: [300] }
    )
    .toBe(true);

  await expectPageNotScrolled(page);
  await expectRegionScrollsIndependently(page, transcript);
  await takeShot(page, testInfo, 'layout-studio-live');

  // 窄屏：Tab 在「实录 / 共识与分歧 / 总结」之间切换。
  if (isMobile) {
    const tabs = page.getByRole('tablist', { name: '演播厅信息面板' });
    await expect(tabs).toBeVisible();
    await page.getByTestId('insights').click();
    await expect(page.locator('.insights-panel--compact')).toBeVisible();
    await page.getByTestId('summary').click();
    await expect(page.locator('.summary-panel--compact')).toBeVisible();
    await page.getByTestId('transcript').click();
    await expect(transcript).toBeVisible();
    await takeShot(page, testInfo, 'layout-studio-mobile-tabs');
  }
});
