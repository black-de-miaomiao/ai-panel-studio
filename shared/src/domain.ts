import { z } from 'zod';
import {
  AGENT_STATES,
  BID_INTENTS,
  DISCUSSION_SOURCES,
  DISCUSSION_STATUSES,
  FIELD_LIMITS,
  INSIGHT_KINDS,
  INSIGHT_STATUSES,
  PARTICIPANT_ROLES,
  SPEECH_ACTS,
  TOPIC_LENGTH
} from './constants';

const idSchema = z.uuid();
const dateTimeSchema = z.iso.datetime();

export const DiscussionSchema = z
  .object({
    id: idSchema,
    topic: z.string().min(TOPIC_LENGTH.min).max(TOPIC_LENGTH.max),
    expertCount: z.number().int().min(2).max(6),
    status: z.enum(DISCUSSION_STATUSES),
    maxTurns: z.number().int().positive(),
    turnCount: z.number().int().nonnegative(),
    summary: z.string().nullable(),
    errorMessage: z.string().nullable(),
    source: z.enum(DISCUSSION_SOURCES),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    startedAt: dateTimeSchema.nullable(),
    endedAt: dateTimeSchema.nullable()
  })
  .strict();

export const ParticipantSchema = z
  .object({
    id: idSchema,
    discussionId: idSchema,
    role: z.enum(PARTICIPANT_ROLES),
    seat: z.number().int().nonnegative(),
    name: z.string().min(1).max(FIELD_LIMITS.name),
    profession: z.string().min(1).max(FIELD_LIMITS.profession),
    title: z.string().min(1).max(FIELD_LIMITS.title),
    stance: z.string().min(1).max(FIELD_LIMITS.stance),
    stanceTag: z.string().min(1).max(FIELD_LIMITS.stanceTag),
    persona: z.string().max(FIELD_LIMITS.persona),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    avatar: z.string().min(1),
    agentState: z.enum(AGENT_STATES),
    agentIntent: z.enum(BID_INTENTS).nullable(),
    focus: z.string().max(FIELD_LIMITS.focus).nullable(),
    speakCount: z.number().int().nonnegative()
  })
  .strict()
  .refine(
    ({ role, seat }) => (role === 'host' ? seat === 0 : seat > 0),
    { error: '主持人座位必须为 0，专家座位必须大于 0' }
  )
  .refine(
    ({ agentState, agentIntent }) =>
      agentState === 'preparing' || agentIntent === null,
    { error: '非准备发言状态不能携带出价意图' }
  );

export const UtteranceSchema = z
  .object({
    id: idSchema,
    discussionId: idSchema,
    participantId: idSchema,
    seq: z.number().int().positive(),
    act: z.enum(SPEECH_ACTS),
    replyToParticipantId: idSchema.nullable(),
    content: z.string().min(1),
    createdAt: dateTimeSchema
  })
  .strict();

export const InsightStanceSchema = z
  .object({
    participantId: idSchema,
    position: z.string().min(1).max(FIELD_LIMITS.position)
  })
  .strict();

export const InsightSchema = z
  .object({
    id: idSchema,
    discussionId: idSchema,
    kind: z.enum(INSIGHT_KINDS),
    content: z.string().min(1).max(FIELD_LIMITS.insightContent),
    status: z.enum(INSIGHT_STATUSES),
    stances: z
      .array(InsightStanceSchema)
      .min(2, { error: '洞察必须包含至少两位专家的立场' })
      .refine(
        (stances) =>
          new Set(stances.map((stance) => stance.participantId)).size ===
          stances.length,
        { error: '同一条洞察中的专家立场不能重复' }
      ),
    evidenceSeqs: z.array(z.number().int().positive()).min(1),
    updatedAtSeq: z.number().int().positive(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict();

export const LiveUtteranceSchema = z
  .object({
    utteranceId: idSchema,
    participantId: idSchema,
    act: z.enum(SPEECH_ACTS),
    replyToParticipantId: idSchema.nullable(),
    seq: z.number().int().positive(),
    text: z.string()
  })
  .strict();

export const DiscussionSnapshotSchema = z
  .object({
    discussion: DiscussionSchema,
    participants: z.array(ParticipantSchema),
    utterances: z.array(UtteranceSchema),
    insights: z.array(InsightSchema),
    liveUtterance: LiveUtteranceSchema.nullable(),
    lastEventSeq: z.number().int().nonnegative(),
    viewerCount: z.number().int().nonnegative()
  })
  .strict();

export const ParticipantBriefSchema = z
  .object({
    id: idSchema,
    role: z.enum(PARTICIPANT_ROLES),
    name: z.string().min(1).max(FIELD_LIMITS.name),
    title: z.string().min(1).max(FIELD_LIMITS.title),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    avatar: z.string().min(1)
  })
  .strict();

export const DiscussionListItemSchema = z
  .object({
    id: idSchema,
    topic: z.string().min(TOPIC_LENGTH.min).max(TOPIC_LENGTH.max),
    status: z.enum(DISCUSSION_STATUSES),
    expertCount: z.number().int().min(2).max(6),
    maxTurns: z.number().int().positive(),
    turnCount: z.number().int().nonnegative(),
    source: z.enum(DISCUSSION_SOURCES),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    participants: z.array(ParticipantBriefSchema),
    utteranceCount: z.number().int().nonnegative(),
    viewerCount: z.number().int().nonnegative(),
    latestUtterance: z
      .object({
        speakerName: z.string(),
        content: z.string()
      })
      .strict()
      .nullable()
  })
  .strict();

export type Discussion = z.infer<typeof DiscussionSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type Utterance = z.infer<typeof UtteranceSchema>;
export type InsightStance = z.infer<typeof InsightStanceSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type LiveUtterance = z.infer<typeof LiveUtteranceSchema>;
export type DiscussionSnapshot = z.infer<typeof DiscussionSnapshotSchema>;
export type ParticipantBrief = z.infer<typeof ParticipantBriefSchema>;
export type DiscussionListItem = z.infer<typeof DiscussionListItemSchema>;
