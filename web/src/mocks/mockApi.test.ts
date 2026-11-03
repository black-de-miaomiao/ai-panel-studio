import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi } from './mockApi';

beforeEach(() => {
  mockApi.reset();
});

describe('mock discussion API', () => {
  it('mirrors the lineup, live, paused, summarizing, and ended transitions', async () => {
    const list = await mockApi.listDiscussions();
    const lineup = list.find((item) => item.status === 'lineup_ready');
    expect(lineup).toBeDefined();
    if (!lineup) return;

    const started = await mockApi.start(lineup.id);
    expect(started.status).toBe('live');
    expect((await mockApi.pause(lineup.id)).status).toBe('paused');
    expect((await mockApi.resume(lineup.id)).status).toBe('live');
    expect((await mockApi.end(lineup.id)).status).toBe('summarizing');
    expect(mockApi.completeSummary(lineup.id, '本场讨论形成了下一步建议。').status)
      .toBe('ended');

    const replay = await mockApi.getDiscussion(lineup.id);
    expect(replay.discussion.summary).toContain('下一步');
    expect(replay.discussion.endedAt).not.toBeNull();
    expect((await mockApi.listDiscussions()).some(
      (item) => item.id === lineup.id && item.status === 'ended'
    )).toBe(true);
  });
});
