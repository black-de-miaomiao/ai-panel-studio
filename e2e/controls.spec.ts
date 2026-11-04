import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiGetSnapshot,
  apiStartDiscussion,
  openStudio,
  takeShot,
  transcriptItems,
  waitForStatus
} from './fixtures';

/**
 * 演播厅控制（AC-F3-4 / AC-F3-5）：
 * 暂停后当前发言完成即停止推进（观察 3 秒），继续后恢复，
 * 结束讨论经二次确认后状态经「总结中」变为「已结束」，且正文发言数低于上限。
 * 「观察 3 秒不再增长」是任务书允许的固定观察窗口；其余等待都用 Playwright 机制。
 */

const TOPIC = '企业该不该自建大模型？';

test('控制：暂停停止推进、继续恢复、结束后发言数低于上限', async ({
  page,
  request
}, testInfo) => {
  const created = await apiCreateDiscussion(request, {
    topic: TOPIC,
    expertCount: 3
  });
  const discussionId = created.snapshot.discussion.id;
  await apiStartDiscussion(request, discussionId);
  await openStudio(page, discussionId);
  await waitForStatus(page, 'LIVE');

  // 记录状态徽标的历史轨迹：「总结中」是短暂瞬态，用观察者捕获。
  await page.evaluate(() => {
    const store = window as unknown as { __e2eStatusHistory: string[] };
    store.__e2eStatusHistory = [];
    const badge = document.querySelector('[data-testid="studio-status"]');
    if (!badge) return;
    const record = () => {
      const text = (badge.textContent ?? '').trim();
      if (text && store.__e2eStatusHistory.at(-1) !== text) {
        store.__e2eStatusHistory.push(text);
      }
    };
    new MutationObserver(record).observe(badge, {
      subtree: true,
      childList: true,
      characterData: true
    });
    record();
  });

  const transcript = transcriptItems(page);
  // 至少有两条发言（开场 + 一条正文）再暂停。
  await expect(transcript.locator('.transcript-item').nth(1)).toBeVisible({
    timeout: 30_000
  });

  // —— 暂停：当前发言完成后不再增长 ——
  await page.getByRole('button', { name: '暂停' }).click();
  await waitForStatus(page, '已暂停');

  // 以服务端为准判定“在途发言已写完”：liveUtterance 清空后不会再起新发言。
  await expect
    .poll(
      async () => {
        const snapshot = await apiGetSnapshot(request, discussionId);
        return (
          snapshot.snapshot.discussion.status === 'paused' &&
          snapshot.snapshot.liveUtterance === null
        );
      },
      { timeout: 20_000, intervals: [250] }
    )
    .toBe(true);
  // UI 追平服务端快照后再读数。
  const serverUtteranceCount = (await apiGetSnapshot(request, discussionId))
    .snapshot.utterances.length;
  await expect
    .poll(async () => transcript.locator('.transcript-item').count(), {
      timeout: 10_000,
      intervals: [200]
    })
    .toBeGreaterThanOrEqual(serverUtteranceCount);
  const pausedCount = await transcript.locator('.transcript-item').count();

  // 观察 3 秒：发言数不再增长（任务书指定的观察窗口）。
  await page.waitForTimeout(3_000);
  expect(await transcript.locator('.transcript-item').count()).toBe(pausedCount);

  // —— 继续：发言数继续增长 ——
  await page.getByRole('button', { name: '继续' }).click();
  await waitForStatus(page, 'LIVE');
  await expect
    .poll(async () => transcript.locator('.transcript-item').count(), {
      timeout: 30_000,
      intervals: [300]
    })
    .toBeGreaterThan(pausedCount);

  // —— 结束讨论：二次确认后经「总结中」到「已结束」 ——
  await page.getByRole('button', { name: '结束讨论' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('结束这场讨论？');
  await page.getByRole('button', { name: '结束并生成总结' }).click();
  await waitForStatus(page, '已结束');

  const statusHistory = await page.evaluate(() => {
    const store = window as unknown as { __e2eStatusHistory: string[] };
    return store.__e2eStatusHistory;
  });
  expect(statusHistory).toContain('总结中');
  expect(statusHistory.indexOf('总结中')).toBeLessThan(
    statusHistory.indexOf('已结束')
  );

  // 正文发言数小于上限（用户主动结束，不是自然跑满）。
  const snapshot = await apiGetSnapshot(request, discussionId);
  expect(snapshot.snapshot.discussion.turnCount).toBeLessThan(
    snapshot.snapshot.discussion.maxTurns
  );
  expect(snapshot.snapshot.discussion.summary).toBeTruthy();
  await takeShot(page, testInfo, 'controls-ended');
});
