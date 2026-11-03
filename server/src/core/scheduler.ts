import type { BidIntent } from '@aps/shared';
import type { NormalizedBid } from './bid';

export const SCHEDULER_WEIGHTS = {
  intent: {
    rebut: 0.3,
    interrupt: 0.25,
    supplement: 0.15,
    raise_hand: 0.1
  },
  directReply: 0.2,
  interruptBonus: 0.3,
  recentExpertSpeakerPenalty: 0.25,
  fairnessBonus: 0.15,
  addressedBonus: 0.6,
  randomJitter: 0.05
} as const;

export interface SchedulerInput {
  bids: readonly NormalizedBid[];
  lastSpeakerId: string | null;
  recentExpertSpeakerIds: readonly string[];
  lastSpokeTurn: Readonly<Record<string, number>>;
  turnIndex: number;
  addressedParticipantId: string | null;
  /**
   * Seat is not part of a normalized bid, but the specification uses it as
   * the final deterministic tie-breaker.
   */
  seatByParticipantId: Readonly<Record<string, number>>;
  rng: () => number;
}

export interface SpeakerPick {
  participantId: string;
  intent: BidIntent;
  replyToParticipantId: string | null;
  score: number;
}

interface Candidate {
  bid: NormalizedBid;
  score: number;
}

export function selectNextSpeaker(
  input: SchedulerInput
): SpeakerPick | null {
  const bidsByParticipant = new Map<string, NormalizedBid>();
  for (const bid of input.bids) {
    if (bid.participantId && !bidsByParticipant.has(bid.participantId)) {
      bidsByParticipant.set(bid.participantId, bid);
    }
  }

  const candidates: NormalizedBid[] = [...bidsByParticipant.values()].filter(
    (bid) =>
      bid.wantToSpeak &&
      (input.lastSpeakerId === null ||
        bid.participantId !== input.lastSpeakerId)
  );

  const addressedId = input.addressedParticipantId;
  if (addressedId) {
    const addressedBid = bidsByParticipant.get(addressedId);
    if (
      !addressedBid?.wantToSpeak &&
      (input.lastSpeakerId === null || addressedId !== input.lastSpeakerId)
    ) {
      candidates.push({
        participantId: addressedId,
        wantToSpeak: true,
        intent: 'raise_hand',
        urgency: 0.5,
        replyToParticipantId: null,
        focus: null
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const candidateScores: Candidate[] = candidates.map((bid) => {
    const participantId = bid.participantId;
    if (!participantId) {
      return { bid, score: Number.NEGATIVE_INFINITY };
    }

    const urgency = Math.min(1, Math.max(0, bid.urgency));
    let score = urgency + SCHEDULER_WEIGHTS.intent[bid.intent];
    if (
      input.lastSpeakerId !== null &&
      bid.replyToParticipantId === input.lastSpeakerId
    ) {
      score += SCHEDULER_WEIGHTS.directReply;
    }
    if (bid.intent === 'interrupt' && urgency >= 0.8) {
      score += SCHEDULER_WEIGHTS.interruptBonus;
    }
    if (input.recentExpertSpeakerIds.includes(participantId)) {
      score -= SCHEDULER_WEIGHTS.recentExpertSpeakerPenalty;
    }

    const previousTurn = input.lastSpokeTurn[participantId];
    if (
      previousTurn === undefined ||
      input.turnIndex - previousTurn >= 4
    ) {
      score += SCHEDULER_WEIGHTS.fairnessBonus;
    }
    if (participantId === addressedId) {
      score += SCHEDULER_WEIGHTS.addressedBonus;
    }
    score += input.rng() * SCHEDULER_WEIGHTS.randomJitter;
    return { bid, score };
  });

  candidateScores.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.bid.urgency !== left.bid.urgency) {
      return right.bid.urgency - left.bid.urgency;
    }
    const leftSeat =
      input.seatByParticipantId[left.bid.participantId ?? ''] ??
      Number.POSITIVE_INFINITY;
    const rightSeat =
      input.seatByParticipantId[right.bid.participantId ?? ''] ??
      Number.POSITIVE_INFINITY;
    return leftSeat - rightSeat;
  });

  const winner = candidateScores[0];
  const participantId = winner?.bid.participantId;
  if (!winner || !participantId) {
    return null;
  }
  return {
    participantId,
    intent: winner.bid.intent,
    replyToParticipantId: winner.bid.replyToParticipantId,
    score: winner.score
  };
}
