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

  it('has a continuous ended transcript with the required acts and replies', () => {
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

    for (const utterance of utterances) {
      if (utterance.act === 'supplement' || utterance.act === 'rebut') {
        expect(utterance.replyToParticipantId).not.toBeNull();
        expect(
          participantById.get(utterance.replyToParticipantId ?? '')?.role
        ).toBe('expert');
      }
    }
  });

  it('has three consensus, three divergences, resolved status, valid evidence, and stances', () => {
    const utterances = listUtterancesByDiscussion(database, replayId);
    const insights = listInsightsByDiscussion(database, replayId);
    const validSeqs = new Set(utterances.map(({ seq }) => seq));
    const consensus = insights.filter(({ kind }) => kind === 'consensus');
    const divergences = insights.filter(({ kind }) => kind === 'divergence');

    expect(consensus.length).toBeGreaterThanOrEqual(3);
    expect(divergences.length).toBeGreaterThanOrEqual(3);
    expect(divergences.some(({ status }) => status === 'resolved')).toBe(true);
    for (const insight of insights) {
      expect(insight.stances.length).toBeGreaterThanOrEqual(2);
      expect(insight.evidenceSeqs.length).toBeGreaterThan(0);
      expect(
        insight.evidenceSeqs.every((seq) => validSeqs.has(seq))
      ).toBe(true);
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

    expect(persistedEvents).toHaveLength(22);
    expect(persistedEvents.map(({ seq }) => seq)).toEqual(
      Array.from({ length: 22 }, (_, index) => index + 1)
    );
    expect(
      persistedEvents.map(({ payload }) => StreamEventSchema.parse(payload).type)
    ).toContain('summary.completed');
    expect(
      persistedEvents.filter(({ type }) => type === 'utterance.completed')
    ).toHaveLength(16);
    expect(
      persistedEvents.filter(({ type }) => type === 'insights.updated')
    ).toHaveLength(3);

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

    const statuses = persistedEvents
      .filter(({ type }) => type === 'discussion.status')
      .map(({ payload }) => {
        if (payload.type !== 'discussion.status') {
          throw new Error('Expected a status event');
        }
        return payload.status;
      });
    expect(statuses).toEqual(['live', 'ended']);

    const summaryEvent = persistedEvents.find(
      ({ type }) => type === 'summary.completed'
    );
    const summary = getById(database, replayId)?.summary;
    expect(summaryEvent?.payload.type).toBe('summary.completed');
    if (summaryEvent?.payload.type === 'summary.completed') {
      expect(summaryEvent.payload.summary).toBe(summary);
    }

    const lastPayload = persistedEvents.at(-1)?.payload;
    expect(lastPayload?.type).toBe('discussion.status');
  });
});
