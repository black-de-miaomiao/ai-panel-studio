import type { BidIntent, HostAct, SpeechAct } from '@aps/shared';
import type { NormalizedBid } from './bid';

export type InterruptBlockReason =
  | 'quota_exhausted'
  | 'previous_interrupt';

export interface InterruptAvailability {
  usedCount: number;
  limit: number;
  allowed: boolean;
  blockReason: InterruptBlockReason | null;
}

export interface InterruptAvailabilityInput {
  maxTurns: number;
  usedCount: number;
  lastBodyAct: SpeechAct | HostAct | null;
}

export function resolveInterruptAvailability(
  input: InterruptAvailabilityInput
): InterruptAvailability {
  const limit = Math.max(1, Math.floor(input.maxTurns / 6));
  const blockReason: InterruptBlockReason | null =
    input.usedCount >= limit
      ? 'quota_exhausted'
      : input.lastBodyAct === 'interrupt'
        ? 'previous_interrupt'
        : null;

  return {
    usedCount: input.usedCount,
    limit,
    allowed: blockReason === null,
    blockReason
  };
}

export function enforceInterruptAvailability(
  bid: NormalizedBid,
  availability: InterruptAvailability
): NormalizedBid {
  if (!bid.wantToSpeak || bid.intent !== 'interrupt' || availability.allowed) {
    return bid;
  }
  return { ...bid, intent: 'rebut' satisfies BidIntent };
}
