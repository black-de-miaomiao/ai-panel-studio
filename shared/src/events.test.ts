import { describe, expect, it } from 'vitest';
import {
  DISCUSSION_STATUSES,
  DURABLE_EVENT_TYPES,
  EPHEMERAL_EVENT_TYPES,
  StreamEvent,
  StreamEventSchema,
  isDurableEvent
} from './index';

const discussionId = '00000000-0000-4000-8000-000000000101';
const participantId = '00000000-0000-4000-8000-000000000201';
const at = '2026-04-15T09:00:00.000Z';
const events: StreamEvent[] = [
  {
    type: 'discussion.status',
    discussionId,
    at,
    status: 'live',
    turnCount: 0,
    maxTurns: 16
  },
  {
    type: 'lineup.updated',
    discussionId,
    at,
    participants: []
  },
  {
    type: 'participant.state',
    discussionId,
    at,
    participantId,
    agentState: 'preparing',
    agentIntent: 'raise_hand',
    focus: '讨论协作方式'
  },
  {
    type: 'utterance.started',
    discussionId,
    at,
    utteranceId: '00000000-0000-4000-8000-000000000301',
    participantId,
    act: 'statement',
    replyToParticipantId: null,
    seq: 1
  },
  {
    type: 'utterance.delta',
    discussionId,
    at,
    utteranceId: '00000000-0000-4000-8000-000000000301',
    delta: '远程办公'
  },
  {
    type: 'utterance.completed',
    discussionId,
    at,
    utterance: {
      id: '00000000-0000-4000-8000-000000000301',
      discussionId,
      participantId,
      seq: 1,
      act: 'statement',
      replyToParticipantId: null,
      content: '远程协作按成果管理。',
      createdAt: at
    }
  },
  {
    type: 'insights.updated',
    discussionId,
    at,
    insights: []
  },
  {
    type: 'summary.completed',
    discussionId,
    at,
    summary: '讨论形成了明确的协作结论。'
  },
  {
    type: 'viewers.updated',
    discussionId,
    at,
    viewerCount: 2
  },
  {
    type: 'error',
    discussionId,
    at,
    code: 'LLM_ERROR',
    message: '嘉宾暂时无法发言'
  }
];

describe('SSE event schemas', () => {
  it('discriminates and parses all ten documented event variants', () => {
    expect(events).toHaveLength(10);
    expect(events.map((event) => StreamEventSchema.parse(event).type)).toEqual(
      events.map((event) => event.type)
    );
    expect(
      StreamEventSchema.safeParse({
        ...events[0],
        status: 'unknown' satisfies string
      }).success
    ).toBe(false);
    expect(DISCUSSION_STATUSES).toContain('live');
  });

  it('classifies durable and ephemeral events as documented', () => {
    const durableTypes = events
      .filter(isDurableEvent)
      .map((event) => event.type);
    expect(durableTypes).toEqual(DURABLE_EVENT_TYPES);
    expect(EPHEMERAL_EVENT_TYPES).toEqual([
      'participant.state',
      'utterance.started',
      'utterance.delta',
      'viewers.updated',
      'error'
    ]);
    expect(events.filter((event) => !isDurableEvent(event))).toHaveLength(5);
  });
});
