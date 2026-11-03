import { describe, expect, it } from 'vitest';
import type { NormalizedBid } from './bid';
import {
  enforceInterruptAvailability,
  resolveInterruptAvailability
} from './interruptPolicy';

describe('interrupt quota policy', () => {
  it('uses a minimum quota of one and scales to two for 12 or 16 turns', () => {
    expect(
      resolveInterruptAvailability({
        maxTurns: 1,
        usedCount: 0,
        lastBodyAct: null
      }).limit
    ).toBe(1);
    expect(
      resolveInterruptAvailability({
        maxTurns: 12,
        usedCount: 0,
        lastBodyAct: null
      }).limit
    ).toBe(2);
    expect(
      resolveInterruptAvailability({
        maxTurns: 16,
        usedCount: 0,
        lastBodyAct: null
      }).limit
    ).toBe(2);
  });

  it('blocks an interrupt once the per-discussion quota is exhausted', () => {
    expect(
      resolveInterruptAvailability({
        maxTurns: 12,
        usedCount: 2,
        lastBodyAct: 'statement'
      })
    ).toEqual({
      usedCount: 2,
      limit: 2,
      allowed: false,
      blockReason: 'quota_exhausted'
    });
  });

  it('blocks an interrupt immediately after another interrupt body', () => {
    expect(
      resolveInterruptAvailability({
        maxTurns: 12,
        usedCount: 1,
        lastBodyAct: 'interrupt'
      })
    ).toEqual({
      usedCount: 1,
      limit: 2,
      allowed: false,
      blockReason: 'previous_interrupt'
    });
  });

  it('allows an interrupt again after a host body insertion', () => {
    expect(
      resolveInterruptAvailability({
        maxTurns: 12,
        usedCount: 1,
        lastBodyAct: 'follow_up'
      })
    ).toEqual({
      usedCount: 1,
      limit: 2,
      allowed: true,
      blockReason: null
    });
  });

  it('rewrites only a blocked speaking interrupt bid to rebut', () => {
    const bid: NormalizedBid = {
      participantId: 'expert-id',
      wantToSpeak: true,
      intent: 'interrupt',
      urgency: 0.91,
      replyToParticipantId: 'host-id',
      focus: '直接否定核心立场'
    };
    const availability = resolveInterruptAvailability({
      maxTurns: 8,
      usedCount: 1,
      lastBodyAct: 'statement'
    });

    expect(enforceInterruptAvailability(bid, availability)).toEqual({
      ...bid,
      intent: 'rebut'
    });
    expect(bid.intent).toBe('interrupt');
    const rebut: NormalizedBid = { ...bid, intent: 'rebut' };
    const nonSpeakingInterrupt: NormalizedBid = {
      ...bid,
      wantToSpeak: false
    };
    expect(enforceInterruptAvailability(rebut, availability)).toBe(rebut);
    expect(
      enforceInterruptAvailability(nonSpeakingInterrupt, availability)
    ).toBe(nonSpeakingInterrupt);
    expect(
      enforceInterruptAvailability(bid, {
        usedCount: 0,
        limit: 1,
        allowed: true,
        blockReason: null
      })
    ).toBe(bid);
  });
});
