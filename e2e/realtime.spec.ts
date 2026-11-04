import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiGetSnapshot,
  apiStartDiscussion,
  openStudio,
  readTranscript,
  takeShot,
  transcriptItems,
  waitForStatus
} from './fixtures';

/**
 * 实时性（AC-F1-3 / AC-F6-3 / SSE 重连补发）：
 * 直播中刷新页面后讨论继续推进且 seq 不重复、不缺号；
 * 断网数秒期间徽标显示重连，恢复后 seq 依然连续。
 *
 * 说明：Chromium 的 context.setOffline 不会断开已经建立的 SSE 连接
 * （探测见报告），因此“拔网线”由 page.route 拒绝新的 stream 请求完成，
 * setOffline 同时让整个上下文断网；恢复时两者一起解除。
 */

const TOPIC = '生成式 AI 应该进入大学课堂吗？';

function assertContiguous(seqs: number[], label: string): void {
  const sorted = [...seqs].sort((left, right) => left - right);
  expect(sorted, `${label}: seq 未按序`).toEqual(seqs);
  expect(new Set(seqs).size, `${label}: seq 有重复`).toBe(seqs.length);
  expect(seqs, `${label}: seq 有缺号`).toEqual(
    seqs.map((_value, index) => index + 1)
  );
}

test('直播中刷新与断网重连都保持 seq 连续', async ({
  page,
  context,
  request
}, testInfo) => {
  // 通过拒绝新的 stream 请求来模拟连接中断。
  let blockStream = false;
  await page.route(
    (url) => url.pathname.endsWith('/stream'),
    async (route) => {
      if (blockStream) {
        await route.abort('connectionfailed');
        return;
      }
      await route.continue();
    }
  );

  const created = await apiCreateDiscussion(request, {
    topic: TOPIC,
    expertCount: 3
  });
  const discussionId = created.snapshot.discussion.id;
  await apiStartDiscussion(request, discussionId);
  await openStudio(page, discussionId);
  await waitForStatus(page, 'LIVE');

  const transcript = transcriptItems(page);
  // 等开场和第一条正文落地，此时讨论仍在直播。
  await expect(transcript.locator('.transcript-item').nth(1)).toBeVisible({
    timeout: 30_000
  });
  const beforeRefresh = (await readTranscript(page)).map((entry) => entry.seq);
  assertContiguous(beforeRefresh, '刷新前');

  // —— 直播中刷新：讨论继续推进，seq 不重复不缺号 ——
  await page.reload();
  await waitForStatus(page, 'LIVE');
  await expect
    .poll(async () => (await readTranscript(page)).length, {
      timeout: 30_000,
      intervals: [300]
    })
    .toBeGreaterThan(beforeRefresh.length);
  const afterRefresh = (await readTranscript(page)).map((entry) => entry.seq);
  assertContiguous(afterRefresh, '刷新后');
  await takeShot(page, testInfo, 'realtime-after-refresh');

  // —— 断网数秒：徽标显示重连，恢复后 seq 依然连续 ——
  blockStream = true;
  await page.reload();
  await waitForStatus(page, 'LIVE');
  await context.setOffline(true);
  await expect(page.getByText('正在重连', { exact: true })).toBeVisible({
    timeout: 20_000
  });
  await page.waitForTimeout(3_000);
  await expect(page.getByText('正在重连', { exact: true })).toBeVisible();
  await context.setOffline(false);
  blockStream = false;
  await expect(page.getByText('连接正常', { exact: true })).toBeVisible({
    timeout: 25_000
  });

  // 重连补发：UI 必须追上服务端当前快照的发言数。
  const serverSnapshot = await apiGetSnapshot(request, discussionId);
  const targetCount = serverSnapshot.snapshot.utterances.length;
  await expect
    .poll(async () => (await readTranscript(page)).length, {
      timeout: 20_000,
      intervals: [300]
    })
    .toBeGreaterThanOrEqual(targetCount);

  const afterReconnect = (await readTranscript(page)).map((entry) => entry.seq);
  assertContiguous(afterReconnect, '重连后');
  expect(afterReconnect.length).toBeGreaterThanOrEqual(afterRefresh.length);
});
