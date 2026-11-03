import { z } from 'zod';
import { AGENT_STATES, BID_INTENTS, DISCUSSION_STATUSES, SPEECH_ACTS } from './constants';
import { ERROR_CODES } from './api';
import {
  InsightSchema,
  ParticipantSchema,
  UtteranceSchema
} from './domain';

const eventBase = {
  discussionId: z.uuid(),
  at: z.iso.datetime()
};

const discussionStatusEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('discussion.status'),
    status: z.enum(DISCUSSION_STATUSES),
    turnCount: z.number().int().nonnegative(),
    maxTurns: z.number().int().positive()
  })
  .strict();

const lineupUpdatedEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('lineup.updated'),
    participants: z.array(ParticipantSchema)
  })
  .strict();

const participantStateEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('participant.state'),
    participantId: z.uuid(),
    agentState: z.enum(AGENT_STATES),
    agentIntent: z.enum(BID_INTENTS).nullable(),
    focus: z.string().max(40).nullable()
  })
  .strict()
  .refine(
    ({ agentState, agentIntent }) =>
      agentState === 'preparing' || agentIntent === null,
    { error: '非准备发言状态不能携带出价意图' }
  );

const utteranceStartedEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('utterance.started'),
    utteranceId: z.uuid(),
    participantId: z.uuid(),
    act: z.enum(SPEECH_ACTS),
    replyToParticipantId: z.uuid().nullable(),
    seq: z.number().int().positive()
  })
  .strict();

const utteranceDeltaEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('utterance.delta'),
    utteranceId: z.uuid(),
    delta: z.string()
  })
  .strict();

const utteranceCompletedEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('utterance.completed'),
    utterance: UtteranceSchema
  })
  .strict();

const insightsUpdatedEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('insights.updated'),
    insights: z.array(InsightSchema)
  })
  .strict();

const summaryCompletedEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('summary.completed'),
    summary: z.string().min(1)
  })
  .strict();

const viewersUpdatedEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('viewers.updated'),
    viewerCount: z.number().int().nonnegative()
  })
  .strict();

const errorEventSchema = z
  .object({
    ...eventBase,
    type: z.literal('error'),
    code: z.enum(ERROR_CODES),
    message: z.string().min(1)
  })
  .strict();

export const StreamEventSchema = z.discriminatedUnion('type', [
  discussionStatusEventSchema,
  lineupUpdatedEventSchema,
  participantStateEventSchema,
  utteranceStartedEventSchema,
  utteranceDeltaEventSchema,
  utteranceCompletedEventSchema,
  insightsUpdatedEventSchema,
  summaryCompletedEventSchema,
  viewersUpdatedEventSchema,
  errorEventSchema
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const DURABLE_EVENT_TYPES = [
  'discussion.status',
  'lineup.updated',
  'utterance.completed',
  'insights.updated',
  'summary.completed'
] as const;

export const EPHEMERAL_EVENT_TYPES = [
  'participant.state',
  'utterance.started',
  'utterance.delta',
  'viewers.updated',
  'error'
] as const;

export type DurableStreamEvent = Extract<
  StreamEvent,
  { type: (typeof DURABLE_EVENT_TYPES)[number] }
>;

export function isDurableEvent(
  event: StreamEvent
): event is DurableStreamEvent {
  return (DURABLE_EVENT_TYPES as readonly string[]).includes(event.type);
}
