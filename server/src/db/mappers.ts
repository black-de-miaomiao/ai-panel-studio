import type {
  Discussion,
  DiscussionStatus,
  Insight,
  InsightKind,
  InsightStance,
  InsightStatus,
  Participant,
  ParticipantBrief,
  ParticipantRole,
  SpeechAct,
  DiscussionSource,
  AgentState,
  BidIntent,
  Utterance
} from '@aps/shared';

export interface DiscussionRow {
  id: string;
  topic: string;
  expert_count: number;
  status: DiscussionStatus;
  max_turns: number;
  turn_count: number;
  summary: string | null;
  error_message: string | null;
  source: DiscussionSource;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface ParticipantRow {
  id: string;
  discussion_id: string;
  role: ParticipantRole;
  seat: number;
  name: string;
  profession: string;
  title: string;
  stance: string;
  stance_tag: string;
  persona: string;
  color: string;
  avatar: string;
  agent_state: AgentState;
  agent_intent: BidIntent | null;
  focus: string | null;
  speak_count: number;
}

export interface UtteranceRow {
  id: string;
  discussion_id: string;
  participant_id: string;
  seq: number;
  act: SpeechAct;
  reply_to_participant_id: string | null;
  content: string;
  created_at: string;
}

export interface InsightRow {
  id: string;
  discussion_id: string;
  kind: InsightKind;
  content: string;
  status: InsightStatus;
  evidence_seqs: string;
  updated_at_seq: number;
  created_at: string;
  updated_at: string;
}

export function mapDiscussionRow(row: DiscussionRow): Discussion {
  return {
    id: row.id,
    topic: row.topic,
    expertCount: row.expert_count,
    status: row.status,
    maxTurns: row.max_turns,
    turnCount: row.turn_count,
    summary: row.summary,
    errorMessage: row.error_message,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    endedAt: row.ended_at
  };
}

export function mapParticipantRow(row: ParticipantRow): Participant {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    role: row.role,
    seat: row.seat,
    name: row.name,
    profession: row.profession,
    title: row.title,
    stance: row.stance,
    stanceTag: row.stance_tag,
    persona: row.persona,
    color: row.color,
    avatar: row.avatar,
    agentState: row.agent_state,
    agentIntent: row.agent_intent,
    focus: row.focus,
    speakCount: row.speak_count
  };
}

export function mapParticipantBriefRow(
  row: Pick<
    ParticipantRow,
    'id' | 'role' | 'name' | 'title' | 'color' | 'avatar'
  >
): ParticipantBrief {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    title: row.title,
    color: row.color,
    avatar: row.avatar
  };
}

export function mapUtteranceRow(row: UtteranceRow): Utterance {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    participantId: row.participant_id,
    seq: row.seq,
    act: row.act,
    replyToParticipantId: row.reply_to_participant_id,
    content: row.content,
    createdAt: row.created_at
  };
}

export function mapInsightRow(
  row: InsightRow,
  stances: InsightStance[]
): Insight {
  const parsedEvidence: unknown = JSON.parse(row.evidence_seqs);

  if (
    !Array.isArray(parsedEvidence) ||
    !parsedEvidence.every(
      (value): value is number => Number.isInteger(value) && value > 0
    )
  ) {
    throw new TypeError(`Invalid evidence_seqs JSON for insight ${row.id}`);
  }

  return {
    id: row.id,
    discussionId: row.discussion_id,
    kind: row.kind,
    content: row.content,
    status: row.status,
    stances,
    evidenceSeqs: parsedEvidence,
    updatedAtSeq: row.updated_at_seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
