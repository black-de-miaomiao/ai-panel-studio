import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@aps/shared';
import {
  createLineupSnapshot,
  createShowcaseSnapshot
} from '../mocks/fixtures';
import {
  initState,
  patchDiscussionState,
  reduce
} from './discussionReducer';

const at = '2026-04-15T09:05:00.000Z';

describe('discussion reducer', () => {
  it('continues a snapshot live utterance and ignores unrelated deltas', () => {
    const snapshot = createShowcaseSnapshot(31, 'live');
    const live = snapshot.liveUtterance;
    expect(live).not.toBeNull();
    if (!live) return;
    const state = initState(snapshot);

    const unchanged = reduce(state, {
      type: 'utterance.delta',
      discussionId: snapshot.discussion.id,
      at,
      utteranceId: '60000000-0000-4000-8000-999999999999',
      delta: '不属于当前发言'
    });
    expect(unchanged).toBe(state);

    const continued = reduce(state, {
      type: 'utterance.delta',
      discussionId: snapshot.discussion.id,
      at,
      utteranceId: live.utteranceId,
      delta: '，并说明边界。'
    });
    expect(continued.liveUtterance?.text).toBe(
      `${live.text}，并说明边界。`
    );
  });

  it('deduplicates durable events by event sequence', () => {
    const snapshot = createLineupSnapshot({ fixtureNo: 32 });
    const initial = initState(snapshot);
    const liveEvent: StreamEvent = {
      type: 'discussion.status',
      discussionId: snapshot.discussion.id,
      at,
      status: 'live',
      turnCount: 0,
      maxTurns: 16
    };
    const first = reduce(initial, liveEvent, 1);
    const duplicate = reduce(
      first,
      { ...liveEvent, status: 'ended' },
      1
    );

    expect(first.discussion.status).toBe('live');
    expect(first.lastEventSeq).toBe(1);
    expect(duplicate).toBe(first);
    expect(duplicate.discussion.status).toBe('live');
  });

  it('advances the summary timestamp and prevents stale control patches', () => {
    const snapshot = createLineupSnapshot({
      fixtureNo: 35,
      status: 'live'
    });
    const initialUpdatedAt = Date.parse(snapshot.discussion.updatedAt);
    const summarizingAt = new Date(initialUpdatedAt + 1_000).toISOString();
    const summaryAt = new Date(initialUpdatedAt + 2_000).toISOString();
    const endedAt = new Date(initialUpdatedAt + 3_000).toISOString();
    const laterButRegressiveAt = new Date(initialUpdatedAt + 4_000).toISOString();
    const summary = '讨论形成了明确的协作结论。';
    let state = initState(snapshot);

    state = reduce(
      state,
      {
        type: 'discussion.status',
        discussionId: snapshot.discussion.id,
        at: summarizingAt,
        status: 'summarizing',
        turnCount: 0,
        maxTurns: snapshot.discussion.maxTurns
      },
      1
    );
    expect(state.discussion.updatedAt).toBe(summarizingAt);

    const equalTimeResponse = patchDiscussionState(state, {
      ...state.discussion,
      status: 'live',
      summary: null,
      updatedAt: summarizingAt
    });
    expect(equalTimeResponse).toBe(state);

    const laterButRegressiveResponse = patchDiscussionState(state, {
      ...state.discussion,
      status: 'live',
      summary: null,
      updatedAt: new Date(initialUpdatedAt + 1_500).toISOString()
    });
    expect(laterButRegressiveResponse.discussion.status).toBe('summarizing');

    state = reduce(
      state,
      {
        type: 'summary.completed',
        discussionId: snapshot.discussion.id,
        at: summaryAt,
        summary
      },
      2
    );
    expect(state.discussion.updatedAt).toBe(summaryAt);
    const responseBetweenSummaryAndEnded = patchDiscussionState(state, {
      ...state.discussion,
      status: 'summarizing',
      summary: null,
      updatedAt: summarizingAt
    });
    expect(responseBetweenSummaryAndEnded).toBe(state);

    state = reduce(
      state,
      {
        type: 'discussion.status',
        discussionId: snapshot.discussion.id,
        at: endedAt,
        status: 'ended',
        turnCount: 0,
        maxTurns: snapshot.discussion.maxTurns
      },
      3
    );
    const olderResponseAfterEnded = patchDiscussionState(state, {
      ...state.discussion,
      status: 'summarizing',
      summary: null,
      updatedAt: summarizingAt
    });
    expect(olderResponseAfterEnded).toBe(state);

    const newerButRegressiveResponse = patchDiscussionState(state, {
      ...state.discussion,
      status: 'summarizing',
      summary: null,
      updatedAt: laterButRegressiveAt
    });
    expect(newerButRegressiveResponse.discussion.status).toBe('ended');
    expect(newerButRegressiveResponse.discussion.summary).toBe(summary);
  });

  it('streams matching text and appends completed utterances once by seq', () => {
    const snapshot = createLineupSnapshot({ fixtureNo: 33 });
    const [host, expert] = snapshot.participants;
    expect(host).toBeDefined();
    expect(expert).toBeDefined();
    if (!host || !expert) return;

    let state = initState(snapshot);
    state = reduce(state, {
      type: 'utterance.started',
      discussionId: snapshot.discussion.id,
      at,
      utteranceId: '60000000-0000-4000-8000-000000000101',
      participantId: expert.id,
      act: 'statement',
      replyToParticipantId: null,
      seq: 1
    });
    state = reduce(state, {
      type: 'utterance.delta',
      discussionId: snapshot.discussion.id,
      at,
      utteranceId: '60000000-0000-4000-8000-000000000101',
      delta: '流式片段'
    });
    expect(state.liveUtterance?.text).toBe('流式片段');

    const completed: StreamEvent = {
      type: 'utterance.completed',
      discussionId: snapshot.discussion.id,
      at,
      utterance: {
        id: '60000000-0000-4000-8000-000000000101',
        discussionId: snapshot.discussion.id,
        participantId: expert.id,
        seq: 1,
        act: 'statement',
        replyToParticipantId: null,
        content: '最终持久文本。',
        createdAt: at
      }
    };
    state = reduce(state, completed, 1);
    const duplicate = reduce(state, completed, 2);

    expect(state.utterances).toHaveLength(1);
    expect(state.utterances[0]?.content).toBe('最终持久文本。');
    expect(state.liveUtterance).toBeNull();
    expect(state.participants.find((item) => item.id === expert.id)?.speakCount)
      .toBe(1);
    expect(duplicate.utterances).toHaveLength(1);
    expect(duplicate.lastEventSeq).toBe(2);
  });

  it('replaces insights and applies public participant, viewer, summary, and error events', () => {
    const snapshot = createLineupSnapshot({ fixtureNo: 34 });
    const [host, expert] = snapshot.participants;
    expect(host).toBeDefined();
    expect(expert).toBeDefined();
    if (!host || !expert) return;
    let state = initState(snapshot);

    state = reduce(state, {
      type: 'participant.state',
      discussionId: snapshot.discussion.id,
      at,
      participantId: expert.id,
      agentState: 'preparing',
      agentIntent: 'rebut',
      focus: '回应用户信任问题'
    });
    expect(state.participants[1]?.agentIntent).toBe('rebut');

    const insight: StreamEvent = {
      type: 'insights.updated',
      discussionId: snapshot.discussion.id,
      at,
      insights: [
        {
          id: '40000000-0000-4000-8000-000000000777',
          discussionId: snapshot.discussion.id,
          kind: 'consensus',
          content: '先设定清晰试点边界。',
          status: 'active',
          stances: [
            { participantId: expert.id, position: '支持低风险试点' },
            { participantId: host.id, position: '支持明确边界' }
          ],
          evidenceSeqs: [1],
          updatedAtSeq: 1,
          createdAt: at,
          updatedAt: at
        }
      ]
    };
    state = reduce(state, insight, 1);
    expect(state.insights).toHaveLength(1);
    expect(state.insightsVersion).toBe(1);

    state = reduce(state, {
      type: 'viewers.updated',
      discussionId: snapshot.discussion.id,
      at,
      viewerCount: 19
    });
    state = reduce(state, {
      type: 'summary.completed',
      discussionId: snapshot.discussion.id,
      at,
      summary: '试点从可核验的问题开始。'
    }, 2);
    state = reduce(state, {
      type: 'error',
      discussionId: snapshot.discussion.id,
      at,
      code: 'LLM_ERROR',
      message: '一位嘉宾暂时掉线，讨论继续。'
    });

    expect(state.viewerCount).toBe(19);
    expect(state.discussion.summary).toContain('试点');
    expect(state.lastError).toContain('讨论继续');
    expect(state.lastEventSeq).toBe(2);
  });
});
