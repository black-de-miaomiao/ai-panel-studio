import type { BidIntent } from '@aps/shared';

export interface NormalizedBid {
  participantId?: string;
  wantToSpeak: boolean;
  intent: BidIntent;
  urgency: number;
  replyToParticipantId: string | null;
  focus: string | null;
}

export interface NormalizeBidContext {
  selfId: string;
  aliasToParticipantId: Record<string, string>;
}

export function normalizeBid(
  _raw: unknown,
  _ctx: NormalizeBidContext
): NormalizedBid {
  throw new Error('NOT_IMPLEMENTED');
}
