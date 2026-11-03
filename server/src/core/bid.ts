import type { BidIntent } from '@aps/shared';
import { FIELD_LIMITS } from '@aps/shared';

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

const BID_INTENTS = new Set<BidIntent>([
  'raise_hand',
  'interrupt',
  'supplement',
  'rebut'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUrgency(value: unknown): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.trim().length > 0) {
    parsed = Number(value.trim());
  } else {
    return 0.5;
  }

  if (Number.isNaN(parsed)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, parsed));
}

function normalizeFocus(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= FIELD_LIMITS.focus) {
    return trimmed;
  }
  return `${trimmed.slice(0, FIELD_LIMITS.focus - 1)}…`;
}

export function normalizeBid(
  raw: unknown,
  ctx: NormalizeBidContext
): NormalizedBid {
  if (!isRecord(raw)) {
    return {
      wantToSpeak: false,
      intent: 'raise_hand',
      urgency: 0,
      replyToParticipantId: null,
      focus: null
    };
  }

  const intent =
    typeof raw.intent === 'string' && BID_INTENTS.has(raw.intent as BidIntent)
      ? (raw.intent as BidIntent)
      : 'raise_hand';
  const alias =
    typeof raw.replyTo === 'string' ? raw.replyTo.trim() : '';
  const mappedReply = alias ? ctx.aliasToParticipantId[alias] : undefined;

  return {
    participantId: ctx.selfId,
    wantToSpeak: typeof raw.wantToSpeak === 'boolean' ? raw.wantToSpeak : false,
    intent,
    urgency: normalizeUrgency(raw.urgency),
    replyToParticipantId:
      mappedReply && mappedReply !== ctx.selfId ? mappedReply : null,
    focus: normalizeFocus(raw.focus)
  };
}
