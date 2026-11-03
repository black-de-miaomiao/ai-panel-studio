import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DiscussionSnapshotSchema,
  StreamEventSchema
} from '@aps/shared';
import { DatabaseSync } from 'node:sqlite';
import { initSchema, openDatabase, seedIfEmpty } from './connection';
import { getById, list as listDiscussions } from './repositories/discussions';
import { listSince } from './repositories/events';
import { listByDiscussion as listInsightsByDiscussion } from './repositories/insights';
import { listByDiscussion as listParticipantsByDiscussion } from './repositories/participants';
import { buildSnapshot } from './repositories/snapshot';
import { listByDiscussion as listUtterancesByDiscussion } from './repositories/utterances';

const replayId = '00000000-0000-4000-8000-000000000106';

let database: DatabaseSync;

beforeEach(() => {
  database = openDatabase(':memory:');
  initSchema(database);
  seedIfEmpty(database);
});

afterEach(() => {
  database.close();
});

describe('seed data', () => {
  it('contains six discussions with one host and four idle experts each', () => {
    const discussions = listDiscussions(database);

    expect(discussions).toHaveLength(6);
    expect(
      discussions.filter((discussion) => discussion.status === 'lineup_ready')
    ).toHaveLength(5);
    expect(
      discussions.filter((discussion) => discussion.status === 'ended')
    ).toHaveLength(1);

    for (const discussion of discussions) {
      const participants = listParticipantsByDiscussion(
        database,
        discussion.id
      );
      expect(participants).toHaveLength(5);
      expect(participants.filter(({ role }) => role === 'host')).toHaveLength(
        1
      );
      expect(
        participants.filter(({ role }) => role === 'expert')
      ).toHaveLength(4);
      expect(participants.every(({ agentState }) => agentState === 'idle')).toBe(
        true
      );
      expect(participants.map(({ seat }) => seat)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('uses concise, varied stance tags for every lineup', () => {
    for (const discussion of listDiscussions(database)) {
      const participants = listParticipantsByDiscussion(
        database,
        discussion.id
      );
      const host = participants.find(({ role }) => role === 'host');
      const experts = participants.filter(({ role }) => role === 'expert');
      const stanceTags = experts.map(({ stanceTag }) => stanceTag);

      expect(host?.stanceTag).toBe('引导');
      expect(stanceTags.every((stanceTag) => stanceTag.length <= 6)).toBe(true);
      expect(new Set(stanceTags).size).toBeGreaterThanOrEqual(3);
      expect(stanceTags.some((stanceTag) => stanceTag.includes('支持'))).toBe(
        true
      );
      expect(stanceTags.some((stanceTag) => stanceTag.includes('反对'))).toBe(
        true
      );
    }
  });

  it('has a balanced 16-line ended transcript with valid replies', () => {
    const discussion = getById(database, replayId);
    const utterances = listUtterancesByDiscussion(database, replayId);
    const participants = listParticipantsByDiscussion(database, replayId);
    const participantById = new Map(
      participants.map((participant) => [participant.id, participant])
    );
    const acts = new Set(utterances.map(({ act }) => act));

    expect(discussion?.status).toBe('ended');
    expect(discussion?.turnCount).toBe(14);
    expect(discussion?.maxTurns).toBe(16);
    expect(utterances).toHaveLength(16);
    expect(utterances.map(({ seq }) => seq)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1)
    );
    expect(utterances[0]?.act).toBe('opening');
    expect(utterances.at(-1)?.act).toBe('closing');
    expect(utterances.at(-1)?.content).toBe(discussion?.summary);
    expect(discussion?.summary?.split('\n\n')).toHaveLength(4);
    expect(acts).toEqual(
      new Set([
        'opening',
        'follow_up',
        'bridge',
        'invite',
        'closing',
        'statement',
        'interrupt',
        'supplement',
        'rebut'
      ])
    );

    const bodyUtterances = utterances.slice(1, -1);
    const bodySentenceCounts = bodyUtterances.map(
      ({ content }) => (content.match(/[。！？!?]/gu) ?? []).length
    );
    expect(bodySentenceCounts.every((count) => count >= 1 && count <= 2)).toBe(
      true
    );
    expect(
      bodyUtterances.filter(
        ({ participantId }) =>
          participantById.get(participantId)?.role === 'host'
      )
    ).toHaveLength(3);

    for (let index = 1; index < utterances.length; index += 1) {
      const previous = utterances[index - 1];
      const current = utterances[index];
      const previousParticipant = participantById.get(
        previous?.participantId ?? ''
      );
      const currentParticipant = participantById.get(current?.participantId ?? '');

      if (
        previousParticipant?.role === 'expert' &&
        currentParticipant?.role === 'expert'
      ) {
        expect(currentParticipant.id).not.toBe(previousParticipant.id);
      }
    }

    const expertCounts = participants
      .filter(({ role }) => role === 'expert')
      .map(
        ({ id }) =>
          bodyUtterances.filter(({ participantId }) => participantId === id)
            .length
      );
    expect(Math.max(...expertCounts) - Math.min(...expertCounts)).toBeGreaterThanOrEqual(
      2
    );

    for (const utterance of utterances) {
      if (
        utterance.act === 'supplement' ||
        utterance.act === 'rebut' ||
        utterance.act === 'interrupt'
      ) {
        expect(utterance.replyToParticipantId).not.toBeNull();
        expect(
          participantById.get(utterance.replyToParticipantId ?? '')?.role
        ).toBe('expert');
      }
      if (utterance.act === 'interrupt') {
        const previous = utterances[utterance.seq - 2];
        expect(utterance.replyToParticipantId).toBe(previous?.participantId);
      }
    }

    const quickRebuttalResponses = bodyUtterances.filter(
      (utterance, index) =>
        utterance.act === 'rebut' &&
        bodyUtterances
          .slice(index + 1, index + 3)
          .some(
            ({ participantId }) =>
              participantId === utterance.replyToParticipantId
          )
    );
    expect(quickRebuttalResponses.length).toBeGreaterThanOrEqual(2);

    for (const [index, utterance] of utterances.entries()) {
      if (utterance.act !== 'follow_up' && utterance.act !== 'bridge') {
        continue;
      }

      const previous = utterances[index - 1];
      const next = utterances[index + 1];
      expect(utterance.replyToParticipantId).not.toBeNull();
      expect(
        participantById.get(utterance.replyToParticipantId ?? '')?.role
      ).toBe('expert');
      expect(next?.participantId).toBe(utterance.replyToParticipantId);

      if (utterance.act === 'follow_up') {
        expect(previous?.participantId).toBe(utterance.replyToParticipantId);
      } else {
        expect(utterance.replyToParticipantId).not.toBe(previous?.participantId);
        expect(utterance.content).toContain('程砚秋');
        expect(utterance.content).toContain('梁映南');
      }
    }

    const inviteIndex = utterances.findIndex(({ act }) => act === 'invite');
    const invite = utterances[inviteIndex];
    const invitedExpertCounts = participants
      .filter(({ role }) => role === 'expert')
      .map(({ id }) => ({
        id,
        count: utterances
          .slice(1, inviteIndex)
          .filter(({ participantId }) => participantId === id).length
      }));
    const minimumCount = Math.min(
      ...invitedExpertCounts.map(({ count }) => count)
    );
    expect(
      invitedExpertCounts
        .filter(({ count }) => count === minimumCount)
        .map(({ id }) => id)
    ).toContain(invite?.replyToParticipantId);
    expect(utterances[inviteIndex + 1]?.participantId).toBe(
      invite?.replyToParticipantId
    );
    expect(utterances[inviteIndex + 1]?.act).toBe('statement');

    for (const participant of participants) {
      expect(participant.speakCount).toBe(
        utterances.filter(
          ({ participantId }) => participantId === participant.id
        ).length
      );
    }

    const utteranceTimes = utterances.map(({ createdAt }) =>
      Date.parse(createdAt)
    );
    for (let index = 1; index < utteranceTimes.length; index += 1) {
      expect(utteranceTimes[index]).toBeGreaterThan(
        utteranceTimes[index - 1] ?? Number.NEGATIVE_INFINITY
      );
    }
  });

  it('has supported consensus and divergence positions with valid evidence', () => {
    const utterances = listUtterancesByDiscussion(database, replayId);
    const participants = listParticipantsByDiscussion(database, replayId);
    const participantById = new Map(
      participants.map((participant) => [participant.id, participant])
    );
    const insights = listInsightsByDiscussion(database, replayId);
    const utteranceBySeq = new Map(
      utterances.map((utterance) => [utterance.seq, utterance])
    );
    const validSeqs = new Set(utterances.map(({ seq }) => seq));
    const consensus = insights.filter(({ kind }) => kind === 'consensus');
    const divergences = insights.filter(({ kind }) => kind === 'divergence');
    const supportingPhrases: Record<string, string[]> = {
      '个人任务按成果远程完成': ['个人任务', '远程做', '按成果'],
      '独立任务可远程，带教须另设机制': ['独立任务可以远程', '新人带教'],
      '敏感资料需分级授权、托管设备': [
        '资料分级',
        '公司托管设备',
        '临时授权'
      ],
      '敏感项目预约受控会议室，不必日常坐班': [
        '敏感项目预约受控会议室',
        '每天坐班'
      ],
      '受控会议室按项目预约': ['敏感项目预约受控会议室'],
      '按安全需要预约受控空间': ['按项目预约受控会议室'],
      '轮值导师与记录能承接多数协作': [
        '轮值导师',
        '每周一对一',
        '求助入口'
      ],
      '新人入职仍需当面结对': ['新人刚入职时还需当面结对'],
      '临时决策在碰面时容易发现依赖': [
        '临时决策是在大家碰面时才发现依赖'
      ],
      '负责人和决策记录能支持远程协作': [
        '明确负责人并写下决策记录',
        '远程团队也能接住'
      ],
      '记录不能替代面对面带教': [
        '记录解决不了新人不知道该问谁',
        '明确导师责任'
      ],
      '敏感项目预约受控会议室，不必全员坐班': [
        '敏感项目预约受控会议室',
        '每天坐班'
      ],
      '托管设备、临时授权可支持分级远程处理': [
        '资料分级',
        '公司托管设备',
        '临时授权',
        '普通任务也能远程处理'
      ]
    };

    expect(consensus).toHaveLength(3);
    expect(divergences).toHaveLength(3);
    expect(divergences.some(({ status }) => status === 'resolved')).toBe(true);
    for (const insight of insights) {
      expect(insight.stances.length).toBeGreaterThanOrEqual(2);
      expect(insight.evidenceSeqs.length).toBeGreaterThan(0);
      expect(
        insight.evidenceSeqs.every((seq) => validSeqs.has(seq))
      ).toBe(true);

      for (const stance of insight.stances) {
        const authoredEvidence = insight.evidenceSeqs
          .map((seq) => utteranceBySeq.get(seq))
          .filter(
            (utterance) =>
              utterance?.participantId === stance.participantId
          );
        const phrases = supportingPhrases[stance.position];

        expect(participantById.get(stance.participantId)?.role).toBe('expert');
        expect(authoredEvidence.length).toBeGreaterThan(0);
        expect(phrases).toBeDefined();
        if (phrases !== undefined) {
          expect(
            authoredEvidence.some((utterance) =>
              phrases.every((phrase) => utterance?.content.includes(phrase))
            )
          ).toBe(true);
        }
      }

      if (insight.kind === 'consensus') {
        const evidenceTexts = insight.evidenceSeqs.map(
          (seq) => utteranceBySeq.get(seq)?.content ?? ''
        );
        expect(
          evidenceTexts.some((content) =>
            ['我也认为', '我同意', '都认可'].some((phrase) =>
              content.includes(phrase)
            )
          )
        ).toBe(true);
      }
    }
  });

  it('builds a schema-valid snapshot for every seed discussion', () => {
    for (const discussion of listDiscussions(database)) {
      const snapshot = buildSnapshot(database, discussion.id, {
        viewerCount: 0,
        liveUtterance: null
      });

      expect(snapshot).not.toBeNull();
      expect(DiscussionSnapshotSchema.parse(snapshot).participants).toHaveLength(
        5
      );
    }

    expect(
      buildSnapshot(database, '00000000-0000-4000-8000-000000000999', {
        viewerCount: 0,
        liveUtterance: null
      })
    ).toBeNull();
  });

  it('stores a continuous durable event log with payloads matching StreamEvent', () => {
    const persistedEvents = listSince(database, replayId, 0);

    expect(persistedEvents).toHaveLength(38);
    expect(persistedEvents.map(({ seq }) => seq)).toEqual(
      Array.from({ length: 38 }, (_, index) => index + 1)
    );
    expect(
      persistedEvents.map(({ payload }) => StreamEventSchema.parse(payload).type)
    ).toContain('summary.completed');
    expect(
      persistedEvents.filter(({ type }) => type === 'utterance.completed')
    ).toHaveLength(16);
    expect(
      persistedEvents.filter(({ type }) => type === 'insights.updated')
    ).toHaveLength(4);

    const completedUtterances = persistedEvents
      .filter(({ payload }) => payload.type === 'utterance.completed')
      .map(({ payload }) => {
        if (payload.type !== 'utterance.completed') {
          throw new Error('Expected a completed utterance event');
        }
        return payload.utterance;
      });
    expect(completedUtterances).toEqual(
      listUtterancesByDiscussion(database, replayId)
    );
    const utteranceBySeq = new Map(
      completedUtterances.map((utterance) => [utterance.seq, utterance])
    );
    for (const { payload } of persistedEvents) {
      if (payload.type !== 'insights.updated') {
        continue;
      }

      for (const insight of payload.insights) {
        for (const stance of insight.stances) {
          expect(
            insight.evidenceSeqs.some(
              (seq) =>
                utteranceBySeq.get(seq)?.participantId === stance.participantId
            )
          ).toBe(true);
        }
      }
    }

    expect(persistedEvents[0]?.payload.type).toBe('discussion.status');
    if (persistedEvents[0]?.payload.type === 'discussion.status') {
      expect(persistedEvents[0].payload.status).toBe('live');
      expect(persistedEvents[0].payload.turnCount).toBe(0);
    }
    expect(persistedEvents[1]?.payload.type).toBe('utterance.completed');
    if (persistedEvents[1]?.payload.type === 'utterance.completed') {
      expect(persistedEvents[1].payload.utterance.act).toBe('opening');
    }

    const eventTimes = persistedEvents.map(({ payload }) =>
      Date.parse(payload.at)
    );
    for (let index = 1; index < eventTimes.length; index += 1) {
      expect(eventTimes[index]).toBeGreaterThan(
        eventTimes[index - 1] ?? Number.NEGATIVE_INFINITY
      );
    }

    const bodyUtterances = listUtterancesByDiscussion(database, replayId).slice(
      1,
      -1
    );
    for (const utterance of bodyUtterances) {
      const completedEventIndex = persistedEvents.findIndex(
        ({ payload }) =>
          payload.type === 'utterance.completed' &&
          payload.utterance.seq === utterance.seq
      );
      const statusPayload = persistedEvents[completedEventIndex + 1]?.payload;

      expect(statusPayload?.type).toBe('discussion.status');
      if (statusPayload?.type === 'discussion.status') {
        expect(statusPayload.status).toBe('live');
        expect(statusPayload.turnCount).toBe(utterance.seq - 1);
      }
    }

    const statuses = persistedEvents
      .filter(({ type }) => type === 'discussion.status')
      .map(({ payload }) => {
        if (payload.type !== 'discussion.status') {
          throw new Error('Expected a status event');
        }
        return payload;
      });
    expect(statuses.map(({ status }) => status)).toEqual([
      'live',
      ...Array.from({ length: 14 }, () => 'live' as const),
      'summarizing',
      'ended'
    ]);
    expect(statuses.map(({ turnCount }) => turnCount)).toEqual([
      0,
      ...Array.from({ length: 14 }, (_, index) => index + 1),
      14,
      14
    ]);

    const summaryEvent = persistedEvents.find(
      ({ type }) => type === 'summary.completed'
    );
    const summary = getById(database, replayId)?.summary;
    expect(summaryEvent?.payload.type).toBe('summary.completed');
    if (summaryEvent?.payload.type === 'summary.completed') {
      expect(summaryEvent.payload.summary).toBe(summary);
    }

    const finalInsightsEvent = persistedEvents
      .filter(({ payload }) => payload.type === 'insights.updated')
      .at(-1);
    if (finalInsightsEvent?.payload.type === 'insights.updated') {
      expect(finalInsightsEvent.payload.insights).toEqual(
        listInsightsByDiscussion(database, replayId)
      );
    }

    expect(
      persistedEvents.slice(-5).map(({ payload }) => payload.type)
    ).toEqual([
      'insights.updated',
      'discussion.status',
      'utterance.completed',
      'summary.completed',
      'discussion.status'
    ]);
    const summarizingPayload = persistedEvents.at(-4)?.payload;
    expect(summarizingPayload?.type).toBe('discussion.status');
    if (summarizingPayload?.type === 'discussion.status') {
      expect(summarizingPayload.status).toBe('summarizing');
    }

    const lastPayload = persistedEvents.at(-1)?.payload;
    expect(lastPayload?.type).toBe('discussion.status');
    if (lastPayload?.type === 'discussion.status') {
      expect(lastPayload.status).toBe('ended');
    }
  });
});
