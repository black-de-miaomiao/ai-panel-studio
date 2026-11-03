import {
  isDurableEvent,
  type DiscussionSnapshot,
  type Insight,
  type Participant,
  type StreamEvent
} from '@aps/shared';

export interface DiscussionState extends DiscussionSnapshot {
  insightsVersion: number;
  lastError: string | null;
}

export function initState(snapshot: DiscussionSnapshot): DiscussionState {
  return {
    ...snapshot,
    discussion: { ...snapshot.discussion },
    participants: snapshot.participants.map((participant) => ({
      ...participant
    })),
    utterances: snapshot.utterances.map((utterance) => ({ ...utterance })),
    insights: snapshot.insights.map((insight) => ({
      ...insight,
      evidenceSeqs: [...insight.evidenceSeqs],
      stances: insight.stances.map((stance) => ({ ...stance }))
    })),
    liveUtterance: snapshot.liveUtterance
      ? { ...snapshot.liveUtterance }
      : null,
    insightsVersion: 0,
    lastError: null
  };
}

function updateParticipant(
  participants: Participant[],
  participantId: string,
  update: (participant: Participant) => Participant
): Participant[] {
  if (!participants.some((participant) => participant.id === participantId)) {
    return participants;
  }
  return participants.map((participant) =>
    participant.id === participantId ? update(participant) : participant
  );
}

function replaceInsights(insights: Insight[]): Insight[] {
  return insights.map((insight) => ({
    ...insight,
    evidenceSeqs: [...insight.evidenceSeqs],
    stances: insight.stances.map((stance) => ({ ...stance }))
  }));
}

export function reduce(
  state: DiscussionState,
  event: StreamEvent,
  eventSeq?: number
): DiscussionState {
  if (event.discussionId !== state.discussion.id) return state;

  const durable = isDurableEvent(event);
  if (durable && eventSeq !== undefined && eventSeq <= state.lastEventSeq) {
    return state;
  }
  const lastEventSeq = durable
    ? (eventSeq ?? state.lastEventSeq + 1)
    : state.lastEventSeq;
  const eventMeta = durable ? { lastEventSeq } : {};

  switch (event.type) {
    case 'discussion.status':
      return {
        ...state,
        ...eventMeta,
        discussion: {
          ...state.discussion,
          status: event.status,
          turnCount: event.turnCount,
          maxTurns: event.maxTurns
        }
      };
    case 'lineup.updated':
      return {
        ...state,
        ...eventMeta,
        participants: event.participants.map((participant) => ({
          ...participant
        }))
      };
    case 'participant.state':
      return {
        ...state,
        participants: updateParticipant(
          state.participants,
          event.participantId,
          (participant) => ({
            ...participant,
            agentState: event.agentState,
            agentIntent: event.agentIntent,
            focus: event.focus
          })
        )
      };
    case 'utterance.started':
      return {
        ...state,
        liveUtterance: {
          utteranceId: event.utteranceId,
          participantId: event.participantId,
          act: event.act,
          replyToParticipantId: event.replyToParticipantId,
          seq: event.seq,
          text: ''
        }
      };
    case 'utterance.delta':
      if (state.liveUtterance?.utteranceId !== event.utteranceId) return state;
      return {
        ...state,
        liveUtterance: {
          ...state.liveUtterance,
          text: state.liveUtterance.text + event.delta
        }
      };
    case 'utterance.completed': {
      const { utterance } = event;
      const duplicate = state.utterances.some(
        (existing) => existing.seq === utterance.seq
      );
      const utterances = duplicate
        ? state.utterances
        : [...state.utterances, { ...utterance }].sort(
            (left, right) => left.seq - right.seq
          );
      const participants = duplicate
        ? state.participants
        : updateParticipant(state.participants, utterance.participantId, (p) => ({
            ...p,
            speakCount: p.speakCount + 1
          }));
      return {
        ...state,
        ...eventMeta,
        utterances,
        participants,
        liveUtterance:
          state.liveUtterance?.utteranceId === utterance.id
            ? null
            : state.liveUtterance
      };
    }
    case 'insights.updated':
      return {
        ...state,
        ...eventMeta,
        insights: replaceInsights(event.insights),
        insightsVersion: state.insightsVersion + 1
      };
    case 'summary.completed':
      return {
        ...state,
        ...eventMeta,
        discussion: {
          ...state.discussion,
          summary: event.summary
        }
      };
    case 'viewers.updated':
      return { ...state, viewerCount: event.viewerCount };
    case 'error':
      return { ...state, lastError: event.message };
  }
}
