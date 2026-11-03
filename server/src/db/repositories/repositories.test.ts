import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Insight, StreamEvent } from '@aps/shared';
import { DatabaseSync } from 'node:sqlite';
import { initSchema, openDatabase, seedIfEmpty } from '../connection';
import {
  create as createDiscussion,
  getById,
  incrementTurnCount,
  list as listDiscussions,
  markInterruptedAsPaused,
  remove,
  setSummary,
  updateStatus
} from './discussions';
import {
  append,
  lastSeq,
  listSince
} from './events';
import {
  listByDiscussion as listInsightsByDiscussion,
  replaceAll
} from './insights';
import {
  incrementSpeakCount,
  listByDiscussion as listParticipantsByDiscussion,
  replaceLineup,
  resetAgentStates,
  updateAgentState,
  type ParticipantDraft
} from './participants';
import {
  count as countUtterances,
  insert as insertUtterance,
  latest,
  listByDiscussion as listUtterancesByDiscussion,
  nextSeq
} from './utterances';

const firstSeedId = '00000000-0000-4000-8000-000000000101';
const secondSeedId = '00000000-0000-4000-8000-000000000102';
const replayId = '00000000-0000-4000-8000-000000000106';
const firstExpertId = '00000000-0000-4000-8000-000000000202';
const secondExpertId = '00000000-0000-4000-8000-000000000203';
const otherDiscussionExpertId = '00000000-0000-4000-8000-000000000212';
const at = '2026-04-15T12:00:00.000Z';

let database: DatabaseSync;

beforeEach(() => {
  database = openDatabase(':memory:');
  initSchema(database);
  seedIfEmpty(database);
});

afterEach(() => {
  database.close();
});

function makeDraft(
  id: string,
  role: 'host' | 'expert',
  seat: number,
  name: string,
  color: string
): ParticipantDraft {
  return {
    id,
    role,
    seat,
    name,
    profession: role === 'host' ? '讨论主持人' : '软件工程师',
    title: role === 'host' ? '圆桌主持人' : '工程顾问',
    stance: '关注具体证据与可执行条件。',
    stanceTag: role === 'host' ? '引导' : '审慎',
    persona: '背景清晰，表达克制。',
    color,
    avatar: name[0] ?? name
  };
}

function makeInsight(
  discussionId: string,
  id: string,
  participantIds: readonly string[]
): Insight {
  return {
    id,
    discussionId,
    kind: 'consensus',
    content: '先按真实任务验证协作方式。',
    status: 'active',
    stances: participantIds.map((participantId) => ({
      participantId,
      position: '认可先用实际任务验证'
    })),
    evidenceSeqs: [1],
    updatedAtSeq: 1,
    createdAt: at,
    updatedAt: at
  };
}

function makeStatusEvent(discussionId: string): StreamEvent {
  return {
    type: 'discussion.status',
    discussionId,
    at,
    status: 'live',
    turnCount: 0,
    maxTurns: 16
  };
}

describe('discussion repository', () => {
  it('creates, reads, patches, increments, and summarizes a discussion', () => {
    const created = createDiscussion(database, {
      topic: 'AI 辅助编程的岗位变化',
      expertCount: 3,
      maxTurns: 12
    });

    expect(created.status).toBe('draft');
    expect(created.expertCount).toBe(3);
    expect(created.maxTurns).toBe(12);
    expect(created.source).toBe('user');
    expect(getById(database, created.id)).toEqual(created);

    const failed = updateStatus(database, created.id, 'failed', {
      startedAt: at,
      errorMessage: '阵容暂时无法生成'
    });
    expect(failed?.status).toBe('failed');
    expect(failed?.startedAt).toBe(at);
    expect(failed?.errorMessage).toBe('阵容暂时无法生成');

    const resumed = updateStatus(database, created.id, 'live', {
      errorMessage: null
    });
    expect(resumed?.status).toBe('live');
    expect(resumed?.errorMessage).toBeNull();
    expect(incrementTurnCount(database, created.id)).toBe(1);
    expect(setSummary(database, created.id, '讨论总结文本')?.summary).toBe(
      '讨论总结文本'
    );
    expect(getById(database, '00000000-0000-4000-8000-000000000999')).toBeNull();
  });

  it('sorts by status and updatedAt, filters statuses, and maps list aggregates', () => {
    const live = createDiscussion(database, {
      topic: '直播中讨论',
      expertCount: 2,
      maxTurns: 16
    });
    const summarizing = createDiscussion(database, {
      topic: '总结中讨论',
      expertCount: 2,
      maxTurns: 16
    });
    const paused = createDiscussion(database, {
      topic: '暂停讨论',
      expertCount: 2,
      maxTurns: 16
    });
    const draftOlder = createDiscussion(database, {
      topic: '较早草稿',
      expertCount: 2,
      maxTurns: 16
    });
    const draftNewer = createDiscussion(database, {
      topic: '较新草稿',
      expertCount: 2,
      maxTurns: 16
    });
    const failed = createDiscussion(database, {
      topic: '失败讨论',
      expertCount: 2,
      maxTurns: 16
    });
    updateStatus(database, live.id, 'live');
    updateStatus(database, summarizing.id, 'summarizing');
    updateStatus(database, paused.id, 'paused');
    updateStatus(database, failed.id, 'failed');
    database
      .prepare('UPDATE discussions SET updated_at = ? WHERE id = ?')
      .run('2026-04-15T11:00:00.000Z', draftOlder.id);
    database
      .prepare('UPDATE discussions SET updated_at = ? WHERE id = ?')
      .run('2026-04-15T12:00:00.000Z', draftNewer.id);

    const list = listDiscussions(database, {
      viewerCountOf: (id) => (id === replayId ? 7 : 0)
    });

    expect(list.slice(0, 3).map(({ id }) => id)).toEqual([
      live.id,
      summarizing.id,
      paused.id
    ]);
    expect(list.slice(3, 8).map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000105',
      '00000000-0000-4000-8000-000000000104',
      '00000000-0000-4000-8000-000000000103',
      secondSeedId,
      firstSeedId
    ]);
    expect(list.slice(8, 10).map(({ id }) => id)).toEqual([
      draftNewer.id,
      draftOlder.id
    ]);
    expect(list[10]?.id).toBe(failed.id);
    expect(list.at(-1)?.id).toBe(replayId);

    const replayItem = list.find(({ id }) => id === replayId);
    expect(replayItem?.participants).toHaveLength(5);
    expect(replayItem?.utteranceCount).toBe(16);
    expect(replayItem?.viewerCount).toBe(7);
    expect(replayItem?.latestUtterance?.speakerName).toBe('沈知遥');
    expect(
      listDiscussions(database, { statuses: ['live', 'ended'] }).map(
        ({ id }) => id
      )
    ).toEqual([live.id, replayId]);
    expect(listDiscussions(database, { statuses: [] })).toEqual([]);
  });

  it('marks only live and summarizing discussions paused on recovery', () => {
    const live = createDiscussion(database, {
      topic: '运行中的讨论',
      expertCount: 2,
      maxTurns: 16
    });
    const summarizing = createDiscussion(database, {
      topic: '等待总结的讨论',
      expertCount: 2,
      maxTurns: 16
    });
    const paused = createDiscussion(database, {
      topic: '已经暂停的讨论',
      expertCount: 2,
      maxTurns: 16
    });
    updateStatus(database, live.id, 'live');
    updateStatus(database, summarizing.id, 'summarizing');
    updateStatus(database, paused.id, 'paused');

    expect(markInterruptedAsPaused(database)).toEqual(
      [live.id, summarizing.id].sort()
    );
    expect(getById(database, live.id)?.status).toBe('paused');
    expect(getById(database, summarizing.id)?.status).toBe('paused');
    expect(getById(database, paused.id)?.status).toBe('paused');
    expect(markInterruptedAsPaused(database)).toEqual([]);
  });

  it('deletes a discussion and cascades through all child tables', () => {
    const insightIds = database
      .prepare('SELECT id FROM insights WHERE discussion_id = ?')
      .all(replayId) as unknown as Array<{ id: string }>;
    expect(insightIds).toHaveLength(6);
    expect(remove(database, replayId)).toBe(true);
    expect(remove(database, replayId)).toBe(false);

    for (const table of ['participants', 'utterances', 'insights', 'events']) {
      const row = database
        .prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE discussion_id = ?`
        )
        .get(replayId) as { count: number } | undefined;
      expect(row?.count).toBe(0);
    }
    const stanceRow = database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM insight_stances
          WHERE insight_id IN (${insightIds.map(() => '?').join(', ')})`
      )
      .get(...insightIds.map(({ id }) => id)) as
      | { count: number }
      | undefined;
    expect(stanceRow?.count).toBe(0);
    expect(getById(database, replayId)).toBeNull();
  });
});

describe('participant repository', () => {
  it('replaces lineups transactionally and scopes state updates by discussion', () => {
    const drafts = [
      makeDraft(
        '00000000-0000-4000-8000-000000000901',
        'host',
        0,
        '新主持',
        '#E8C872'
      ),
      makeDraft(
        '00000000-0000-4000-8000-000000000902',
        'expert',
        1,
        '新专家',
        '#5B9DFF'
      )
    ];
    const replaced = replaceLineup(database, firstSeedId, drafts);
    expect(replaced.map(({ id }) => id)).toEqual(
      drafts.map(({ id }) => id)
    );
    expect(replaced.every(({ agentState }) => agentState === 'idle')).toBe(true);

    expect(() =>
      replaceLineup(database, firstSeedId, [
        ...drafts,
        makeDraft(
          '00000000-0000-4000-8000-000000000903',
          'expert',
          1,
          '重复座位',
          '#FF6B9A'
        )
      ])
    ).toThrow();
    expect(
      listParticipantsByDiscussion(database, firstSeedId).map(({ id }) => id)
    ).toEqual(drafts.map(({ id }) => id));

    const state = updateAgentState(database, firstSeedId, drafts[1]!.id!, {
      agentState: 'preparing',
      agentIntent: 'rebut',
      focus: '回应成本观点'
    });
    expect(state?.agentState).toBe('preparing');
    expect(state?.agentIntent).toBe('rebut');
    expect(incrementSpeakCount(database, firstSeedId, drafts[1]!.id!)).toBe(1);
    expect(
      updateAgentState(database, secondSeedId, drafts[1]!.id!, {
        agentState: 'speaking',
        agentIntent: null,
        focus: null
      })
    ).toBeNull();
    expect(resetAgentStates(database, firstSeedId)).toBe(2);
    expect(
      listParticipantsByDiscussion(database, firstSeedId).every(
        ({ agentState, agentIntent, focus }) =>
          agentState === 'idle' && agentIntent === null && focus === null
      )
    ).toBe(true);
    expect(incrementSpeakCount(database, secondSeedId, firstExpertId)).toBeNull();
  });
});

describe('utterance repository', () => {
  it('inserts, lists, counts, sequences, and isolates utterances', () => {
    const first = insertUtterance(database, firstSeedId, {
      participantId: firstExpertId,
      seq: 1,
      act: 'statement',
      replyToParticipantId: null,
      content: '先明确不同任务的协作要求。'
    });
    const second = insertUtterance(database, firstSeedId, {
      participantId: secondExpertId,
      seq: 2,
      act: 'rebut',
      replyToParticipantId: firstExpertId,
      content: '任务边界也要配合团队支持。'
    });

    expect(listUtterancesByDiscussion(database, firstSeedId)).toEqual([
      first,
      second
    ]);
    expect(countUtterances(database, firstSeedId)).toBe(2);
    expect(nextSeq(database, firstSeedId)).toBe(3);
    expect(latest(database, firstSeedId)).toEqual(second);
    expect(countUtterances(database, secondSeedId)).toBe(0);
    expect(nextSeq(database, secondSeedId)).toBe(1);
    expect(listUtterancesByDiscussion(database, secondSeedId)).toEqual([]);

    expect(() =>
      insertUtterance(database, firstSeedId, {
        participantId: otherDiscussionExpertId,
        seq: 3,
        act: 'statement',
        replyToParticipantId: null,
        content: '不应跨讨论写入。'
      })
    ).toThrow();
    expect(() =>
      insertUtterance(database, firstSeedId, {
        participantId: firstExpertId,
        seq: 3,
        act: 'supplement',
        replyToParticipantId: otherDiscussionExpertId,
        content: '回应对象也必须属于本讨论。'
      })
    ).toThrow();
    expect(countUtterances(database, firstSeedId)).toBe(2);
  });
});

describe('insight repository', () => {
  it('replaces insights with scoped stances and rolls back invalid replacements', () => {
    insertUtterance(database, firstSeedId, {
      participantId: firstExpertId,
      seq: 1,
      act: 'statement',
      replyToParticipantId: null,
      content: '先用实际任务验证协作方式。'
    });
    const insight = makeInsight(firstSeedId, '00000000-0000-4000-8000-000000000901', [
      firstExpertId,
      secondExpertId
    ]);
    expect(replaceAll(database, firstSeedId, [insight])).toEqual([insight]);
    expect(listInsightsByDiscussion(database, replayId)).toHaveLength(6);
    expect(() =>
      replaceAll(database, firstSeedId, [
        { ...insight, discussionId: secondSeedId }
      ])
    ).toThrow('Insight discussionId does not match replacement scope');
    expect(listInsightsByDiscussion(database, firstSeedId)).toEqual([insight]);

    const invalidStance = makeInsight(
      firstSeedId,
      '00000000-0000-4000-8000-000000000902',
      [otherDiscussionExpertId]
    );
    expect(() => replaceAll(database, firstSeedId, [invalidStance])).toThrow(
      'Insight stance participant is outside the discussion'
    );
    expect(listInsightsByDiscussion(database, firstSeedId)).toEqual([insight]);
  });
});

describe('event repository', () => {
  it('appends durable events with per-discussion sequences and parses payloads', () => {
    const firstEvent = makeStatusEvent(firstSeedId);
    const secondEvent: StreamEvent = {
      type: 'summary.completed',
      discussionId: firstSeedId,
      at,
      summary: '本场讨论总结。'
    };
    const otherEvent = makeStatusEvent(secondSeedId);

    expect(append(database, firstSeedId, firstEvent)).toBe(1);
    expect(append(database, firstSeedId, secondEvent)).toBe(2);
    expect(append(database, secondSeedId, otherEvent)).toBe(1);
    expect(lastSeq(database, firstSeedId)).toBe(2);
    expect(lastSeq(database, secondSeedId)).toBe(1);
    expect(listSince(database, firstSeedId, 1)).toEqual([
      {
        discussionId: firstSeedId,
        seq: 2,
        type: 'summary.completed',
        payload: secondEvent,
        createdAt: at
      }
    ]);
    expect(listSince(database, firstSeedId, 2)).toEqual([]);

    expect(() =>
      append(database, firstSeedId, {
        type: 'viewers.updated',
        discussionId: firstSeedId,
        at,
        viewerCount: 1
      })
    ).toThrow('Only durable events can be appended');
    expect(() => append(database, firstSeedId, otherEvent)).toThrow(
      'Event discussionId does not match append scope'
    );
    expect(lastSeq(database, firstSeedId)).toBe(2);
  });
});
