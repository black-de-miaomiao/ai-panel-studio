import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiGetSnapshot,
  apiStartDiscussion,
  apiWaitForStatus,
  openStudio,
  readTranscript,
  takeShot,
  waitForStatus,
  type ApiSnapshot
} from './fixtures';

/**
 * 多讨论隔离（AC-F3-1 / AC-F5-1 / AC-F6-1）：
 * 同时开播两场讨论并在两个页面分别打开，两边都结束后，
 * 每个页面的 Transcript 与洞察只包含本场阵容，并通过 API 快照交叉核对
 * participantId / discussionId。
 */

const TOPIC_A = '四天工作制适合哪些团队？';
const TOPIC_B = '城市该不该放开无人驾驶出租车？';

test('两场并行讨论互不干扰', async ({ page, context, request }, testInfo) => {
  const createdA = await apiCreateDiscussion(request, {
    topic: TOPIC_A,
    expertCount: 3
  });
  const createdB = await apiCreateDiscussion(request, {
    topic: TOPIC_B,
    expertCount: 3
  });
  const idA = createdA.snapshot.discussion.id;
  const idB = createdB.snapshot.discussion.id;
  expect(idA).not.toBe(idB);

  await apiStartDiscussion(request, idA);
  await apiStartDiscussion(request, idB);

  const pageA = page;
  const pageB = await context.newPage();
  await openStudio(pageA, idA);
  await openStudio(pageB, idB);
  await waitForStatus(pageA, 'LIVE');
  await waitForStatus(pageB, 'LIVE');

  // 两个页面都结束后再核对（快照与 UI 一致）。
  const snapshotA = await apiWaitForStatus(request, idA, 'ended', 90_000);
  const snapshotB = await apiWaitForStatus(request, idB, 'ended', 90_000);
  await waitForStatus(pageA, '已结束');
  await waitForStatus(pageB, '已结束');

  await assertPageBelongsToDiscussion(pageA, snapshotA, 'A');
  await assertPageBelongsToDiscussion(pageB, snapshotB, 'B');

  // 两场阵容完全不重叠（participantId 维度）。
  const idsA = new Set(snapshotA.participants.map((participant) => participant.id));
  for (const participant of snapshotB.participants) {
    expect(idsA.has(participant.id)).toBe(false);
  }

  await pageB.close();
  await pageA.getByTestId('studio-desktop-review-tab-summary').click();
  await takeShot(pageA, testInfo, 'isolation-discussion-a');
});

async function assertPageBelongsToDiscussion(
  page: import('@playwright/test').Page,
  snapshot: ApiSnapshot,
  label: string
): Promise<void> {
  const names = new Set(snapshot.participants.map((participant) => participant.name));

  // UI：Transcript 发言人都属于本场阵容。
  const transcript = await readTranscript(page);
  expect(transcript.length).toBeGreaterThan(3);
  for (const entry of transcript) {
    expect(
      names.has(entry.speaker),
      `页面 ${label} 的 Transcript 出现非本场发言人：${entry.speaker}`
    ).toBe(true);
  }

  // UI：共识与分歧涉及的专家都属于本场阵容。
  await page.getByTestId('studio-desktop-review-tab-insights').click();
  const stanceNames = await page
    .locator('.studio-insights-desktop .insight-stance__name')
    .allTextContents();
  expect(stanceNames.length).toBeGreaterThan(0);
  for (const name of stanceNames) {
    expect(
      names.has(name),
      `页面 ${label} 的洞察出现非本场专家：${name}`
    ).toBe(true);
  }

  // API：participantId 与 discussionId 交叉核对。
  const ids = new Set(snapshot.participants.map((participant) => participant.id));
  for (const utterance of snapshot.utterances) {
    expect(utterance.discussionId).toBe(snapshot.discussion.id);
    expect(ids.has(utterance.participantId)).toBe(true);
  }
  for (const insight of snapshot.insights) {
    expect(insight.discussionId).toBe(snapshot.discussion.id);
    for (const stance of insight.stances) {
      expect(ids.has(stance.participantId)).toBe(true);
    }
  }
}
