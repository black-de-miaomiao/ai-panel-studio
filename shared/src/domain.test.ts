import { describe, expect, it } from 'vitest';
import {
  DiscussionSchema,
  DiscussionSnapshotSchema,
  InsightSchema,
  ParticipantSchema,
  UtteranceSchema
} from './domain';

const discussionId = '00000000-0000-4000-8000-000000000101';
const participantId = '00000000-0000-4000-8000-000000000201';
const secondParticipantId = '00000000-0000-4000-8000-000000000202';
const at = '2026-04-15T09:00:00.000Z';

const discussion = {
  id: discussionId,
  topic: '远程办公会全面取代坐班吗？',
  expertCount: 4,
  status: 'lineup_ready',
  maxTurns: 16,
  turnCount: 0,
  summary: null,
  errorMessage: null,
  source: 'seed',
  createdAt: at,
  updatedAt: at,
  startedAt: null,
  endedAt: null
} as const;

const participant = {
  id: participantId,
  discussionId,
  role: 'expert',
  seat: 1,
  name: '程砚秋',
  profession: '组织心理学研究者',
  title: '远程团队研究员',
  stance: '支持按成果管理知识工作。',
  stanceTag: '支持',
  persona: '研究团队协作，表达清晰。',
  color: '#5B9DFF',
  avatar: '程',
  agentState: 'idle',
  agentIntent: null,
  focus: null,
  speakCount: 0
} as const;

const utterance = {
  id: '00000000-0000-4000-8000-000000000301',
  discussionId,
  participantId,
  seq: 2,
  act: 'statement',
  replyToParticipantId: null,
  content: '远程协作应按成果管理。',
  createdAt: at
} as const;

const insight = {
  id: '00000000-0000-4000-8000-000000000401',
  discussionId,
  kind: 'consensus',
  content: '协作需要明确目标。',
  status: 'active',
  stances: [
    { participantId, position: '认可明确目标' },
    { participantId: secondParticipantId, position: '也认可明确目标' }
  ],
  evidenceSeqs: [2],
  updatedAtSeq: 2,
  createdAt: at,
  updatedAt: at
} as const;

describe('domain schemas', () => {
  it('parses valid discussion, participant, utterance, and insight values', () => {
    expect(DiscussionSchema.parse(discussion).status).toBe('lineup_ready');
    expect(ParticipantSchema.parse(participant).seat).toBe(1);
    expect(UtteranceSchema.parse(utterance).seq).toBe(2);
    expect(InsightSchema.parse(insight).evidenceSeqs).toEqual([2]);
  });

  it('rejects invalid enums, field limits, and malformed insight evidence', () => {
    expect(
      DiscussionSchema.safeParse({ ...discussion, status: 'running' }).success
    ).toBe(false);
    expect(
      ParticipantSchema.safeParse({
        ...participant,
        name: '这是一个超过十二个字的虚构姓名'
      }).success
    ).toBe(false);
    expect(
      ParticipantSchema.safeParse({
        ...participant,
        agentIntent: 'raise_hand'
      }).success
    ).toBe(false);
    expect(
      InsightSchema.safeParse({ ...insight, evidenceSeqs: [] }).success
    ).toBe(false);
    expect(
      InsightSchema.safeParse({
        ...insight,
        stances: [insight.stances[0], insight.stances[0]]
      }).success
    ).toBe(false);
  });

  it('validates complete discussion snapshots and rejects extra fields', () => {
    const snapshot = {
      discussion,
      participants: [participant],
      utterances: [utterance],
      insights: [insight],
      liveUtterance: null,
      lastEventSeq: 0,
      viewerCount: 0
    };

    expect(DiscussionSnapshotSchema.parse(snapshot).discussion.id).toBe(
      discussionId
    );
    expect(
      DiscussionSnapshotSchema.safeParse({
        ...snapshot,
        unexpected: true
      }).success
    ).toBe(false);
  });
});
