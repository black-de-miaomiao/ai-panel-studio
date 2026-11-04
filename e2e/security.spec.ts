import { expect, test } from '@playwright/test';
import {
  apiCreateDiscussion,
  apiStartDiscussion,
  assertNoForbiddenStrings,
  collectResponseBodies,
  openStudio,
  readSseRecords,
  startSseCollector,
  stopSseCollector,
  waitForStatus
} from './fixtures';

/**
 * 安全边界（AC-F4-3）：
 * 打开大厅与演播厅、调用健康检查与快照接口、读取几秒 SSE，
 * 期间收集全部响应体（HTML / JS / CSS / JSON / SSE 文本），
 * 断言都不包含假 Key、reasoning_content 与真实服务商地址。
 */

const TOPIC = '企业该怎样保护用户数据？';

test('前端资源与 API 响应不泄漏密钥、隐藏推理与服务商地址', async ({
  page,
  request
}) => {
  const collector = collectResponseBodies(page);

  // 健康检查与创建响应单独扫描。
  const health = await request.get('/api/health');
  const healthText = await health.text();
  assertNoForbiddenStrings('健康检查响应', healthText);
  expect(healthText).toContain('"provider":"mock"');

  const created = await apiCreateDiscussion(request, {
    topic: TOPIC,
    expertCount: 3
  });
  const discussionId = created.snapshot.discussion.id;
  assertNoForbiddenStrings('创建讨论响应', JSON.stringify(created.snapshot));

  await apiStartDiscussion(request, discussionId);

  // 大厅与演播厅的完整加载（HTML / JS / CSS / JSON 都在此期间经过收集器）。
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '正在发生的观点交锋' })
  ).toBeVisible();
  await openStudio(page, discussionId);
  await waitForStatus(page, 'LIVE');

  // 页面内直连 SSE（since=0 全量补发），收集数秒的事件文本。
  await startSseCollector(page, discussionId, 0);
  await expect
    .poll(
      async () => {
        const records = await readSseRecords(page);
        return records.filter((record) => record.type === 'utterance.completed')
          .length;
      },
      { timeout: 40_000, intervals: [400] }
    )
    .toBeGreaterThanOrEqual(2);
  const sseRecords = await readSseRecords(page);
  await stopSseCollector(page);

  expect(sseRecords.length).toBeGreaterThan(2);
  assertNoForbiddenStrings(
    'SSE 事件流',
    sseRecords.map((record) => JSON.stringify(record)).join('\n')
  );

  // 快照接口同样扫描。
  const snapshot = await request.get(`/api/discussions/${discussionId}`);
  assertNoForbiddenStrings('快照响应', await snapshot.text());

  await collector.settle();
  expect(collector.responses.length).toBeGreaterThan(3);
  for (const response of collector.responses) {
    assertNoForbiddenStrings(`响应 ${response.url}`, response.text);
  }
});
