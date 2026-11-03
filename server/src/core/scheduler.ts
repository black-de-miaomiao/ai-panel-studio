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

export function selectNextSpeaker(
  _input: SchedulerInput
): SpeakerPick | null {
  throw new Error('NOT_IMPLEMENTED');
}
