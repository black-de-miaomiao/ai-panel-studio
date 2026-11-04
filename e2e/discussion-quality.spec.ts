import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiStartDiscussion,
  apiWaitForStatus,
  countSentences,
  openStudio,
  readSseRecords,
  startSseCollector,
  stopSseCollector,
  takeShot,
  waitForStatus,
  type ApiUtterance
} from './fixtures';

/**
 * 讨论质量（ARCHITECTURE §5.B–D；跑完一场后取快照 + SSE 记录）：
 * 非机械轮转、句子上限、主持人插话、抢答额度、串联与追问交替、
 * 总结流式推送。统计性断言依赖 TEST_DISCUSSION_ID_SEED 固定的可复现讨论
 * （同一 seed + 话题必然得到同一场讨论，见报告「种子问题」一节）。
 */

const TOPIC = '远程办公会全面取代固定坐班吗？';
const EXPERT_COUNT = 3;

test('讨论质量：轮转、句式、插话、抢答额度与总结流式', async ({
  page,
  request
}, testInfo) => {
  const created = await apiCreateDiscussion(request, {
    topic: TOPIC,
    expertCount: EXPERT_COUNT
  });
  const discussionId = created.snapshot.discussion.id;

  // 在应用源上挂 SSE 收集器（先连接再开播，才能收到总结的流式 delta）。
  await page.goto('/');
  await startSseCollector(page, discussionId, 0);
  await apiStartDiscussion(request, discussionId);

  const snapshot = await apiWaitForStatus(request, discussionId, 'ended', 90_000);
  const sseRecords = await readSseRecords(page);
  await stopSseCollector(page);

  const participantById = new Map(
    snapshot.participants.map((participant) => [participant.id, participant])
  );
  const isExpert = (utterance: ApiUtterance) =>
    participantById.get(utterance.participantId)?.role === 'expert';
  const isHost = (utterance: ApiUtterance) =>
    participantById.get(utterance.participantId)?.role === 'host';

  const ordered = [...snapshot.utterances].sort((left, right) => left.seq - right.seq);
  const opening = ordered.find((utterance) => utterance.act === 'opening');
  const closing = ordered.find((utterance) => utterance.act === 'closing');
  const body = ordered.filter(
    (utterance) => utterance.act !== 'opening' && utterance.act !== 'closing'
  );
  const expertBody = body.filter(isExpert);

  // 1. 没有同一专家连续两条发言。
  for (let index = 1; index < ordered.length; index += 1) {
    expect(
      ordered[index]?.participantId,
      `seq ${ordered[index]?.seq} 与上一条同一发言人`
    ).not.toBe(ordered[index - 1]?.participantId);
  }

  // 2. 专家发言顺序不是按座位轮转。
  const seats = expertBody.map(
    (utterance) => participantById.get(utterance.participantId)?.seat ?? 0
  );
  expect(seats.length).toBeGreaterThanOrEqual(6);
  const rotatesBySeat =
    seats.length >= 4 &&
    seats.every(
      (seat, index) =>
        index === 0 || seat === ((seats[index - 1]! % EXPERT_COUNT) + 1)
    );
  expect(rotatesBySeat, `专家发言按座位轮转：${seats.join(',')}`).toBe(false);

  // 3. 句子上限：开场 ≤ 3，专家与主持人插话 ≤ 2。
  expect(opening, '缺少主持人开场').toBeTruthy();
  expect(countSentences(opening!.content)).toBeLessThanOrEqual(3);
  for (const utterance of body) {
    expect(
      countSentences(utterance.content),
      `seq ${utterance.seq} 超过两句`
    ).toBeLessThanOrEqual(2);
  }

  // 4. 至少 1 次主持人插话（追问 / 串联 / 点名）。
  const hostInterventions = body.filter(
    (utterance) =>
      isHost(utterance) &&
      ['follow_up', 'bridge', 'invite'].includes(utterance.act)
  );
  expect(hostInterventions.length).toBeGreaterThanOrEqual(1);

  // 5. 专家发言的 act 至少有 2 种。
  const expertActs = new Set(expertBody.map((utterance) => utterance.act));
  expect(expertActs.size, `专家 act 仅 ${[...expertActs].join('/')}`).toBeGreaterThanOrEqual(2);

  // 6. 自然结束：轮次跑满，最后一条正文发言来自专家。
  expect(snapshot.discussion.turnCount).toBe(snapshot.discussion.maxTurns);
  const lastBody = body.at(-1);
  expect(lastBody, '缺少正文发言').toBeTruthy();
  expect(isExpert(lastBody!), '最后一条正文发言不是专家').toBe(true);

  // 7. 抢答额度（ARCHITECTURE §5.B）。
  const interruptLimit = Math.max(1, Math.floor(snapshot.discussion.maxTurns / 6));
  const interrupts = body.filter((utterance) => utterance.act === 'interrupt');
  expect(interrupts.length).toBeLessThanOrEqual(interruptLimit);
  for (let index = 1; index < body.length; index += 1) {
    expect(
      body[index]?.act === 'interrupt' && body[index - 1]?.act === 'interrupt',
      '出现相邻两条 interrupt 正文发言'
    ).toBe(false);
  }

  // 8. 主持人的 bridge 与 follow_up 插话不会相邻两次都是 bridge（派发补充 6）。
  const bridgeAndFollowUps = hostInterventions.map((utterance) => utterance.act);
  for (let index = 1; index < bridgeAndFollowUps.length; index += 1) {
    expect(
      bridgeAndFollowUps[index] === 'bridge' && bridgeAndFollowUps[index - 1] === 'bridge',
      '主持人连续两次串联'
    ).toBe(false);
  }

  // 9. 总结流式推送：closing 有多条 delta，且第一条 delta 早于 summary.completed。
  const closingStarted = sseRecords.find(
    (record) => record.type === 'utterance.started' && record.act === 'closing'
  );
  expect(closingStarted, 'SSE 中没有 closing 的 utterance.started').toBeTruthy();
  const closingUtteranceId = String(closingStarted!.utteranceId);
  const deltaIndexes = sseRecords
    .map((record, index) => ({ record, index }))
    .filter(
      ({ record }) =>
        record.type === 'utterance.delta' &&
        record.utteranceId === closingUtteranceId
    )
    .map(({ index }) => index);
  const summaryIndex = sseRecords.findIndex(
    (record) => record.type === 'summary.completed'
  );
  expect(deltaIndexes.length, 'closing 的流式 delta 不足').toBeGreaterThanOrEqual(2);
  expect(summaryIndex, 'SSE 中没有 summary.completed').toBeGreaterThanOrEqual(0);
  expect(deltaIndexes[0]!, '第一条 closing delta 不早于 summary.completed').toBeLessThan(
    summaryIndex
  );

  // 洞察与总结内容健全：结束前已有共识或分歧，总结不含 JSON 痕迹。
  expect(snapshot.insights.length).toBeGreaterThanOrEqual(1);
  expect(snapshot.discussion.summary).toBeTruthy();
  expect(snapshot.discussion.summary).not.toContain('{"');
  expect(snapshot.discussion.summary).not.toContain('[{');

  // 审查截图：这场讨论同时包含串联（bridge）与追问（follow_up）。
  await openStudio(page, discussionId);
  await waitForStatus(page, '已结束');
  await expect(page.locator('.summary-panel__paragraphs p').first()).toBeVisible();
  await takeShot(page, testInfo, 'discussion-quality-ended-summary');
  await page.getByTestId('studio-desktop-review-tab-insights').click();
  await expect(
    page.locator('.studio-insights-desktop .insight-item').first()
  ).toBeVisible();
  await takeShot(page, testInfo, 'discussion-quality-ended-insights');
});
