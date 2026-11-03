import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import type { NormalizedBid } from './bid';
import {
  SCHEDULER_WEIGHTS,
  selectNextSpeaker,
  type SchedulerInput
} from './scheduler';

const participantIds = ['e1', 'e2', 'e3', 'e4'] as const;
const seatByParticipantId = {
  e1: 1,
  e2: 2,
  e3: 3,
  e4: 4
};

function bid(
  participantId: string,
  overrides: Partial<NormalizedBid> = {}
): NormalizedBid {
  return {
    participantId,
    wantToSpeak: true,
    intent: 'raise_hand',
    urgency: 0.5,
    replyToParticipantId: null,
    focus: null,
    ...overrides
  };
}

function input(
  bids: readonly NormalizedBid[],
  overrides: Partial<SchedulerInput> = {}
): SchedulerInput {
  return {
    bids,
    lastSpeakerId: 'host',
    recentExpertSpeakerIds: [],
    lastSpokeTurn: {},
    turnIndex: 1,
    addressedParticipantId: null,
    seatByParticipantId,
    rng: () => 0,
    ...overrides
  };
}

describe('selectNextSpeaker', () => {
  it('无人愿意发言且没有被点名专家时返回空', () => {
    expect(
      selectNextSpeaker(
        input([
          bid('e1', { wantToSpeak: false }),
          bid('e2', { wantToSpeak: false })
        ])
      )
    ).toBeNull();
  });

  it('上一位专家即使出价最高也不能连续发言', () => {
    const result = selectNextSpeaker(
      input(
        [
          bid('e1', { intent: 'interrupt', urgency: 1 }),
          bid('e2', { urgency: 0.4 })
        ],
        { lastSpeakerId: 'e1' }
      )
    );

    expect(result?.participantId).toBe('e2');
  });

  it('上一条发言来自主持人时不排除任何专家', () => {
    const result = selectNextSpeaker(
      input([bid('e1', { urgency: 1 }), bid('e2', { urgency: 0.2 })], {
        lastSpeakerId: 'host'
      })
    );

    expect(result?.participantId).toBe('e1');
  });

  it('紧急度相同时直接反驳上一位发言人的出价胜过普通举手', () => {
    const result = selectNextSpeaker(
      input(
        [
          bid('e2', {
            intent: 'rebut',
            urgency: 0.5,
            replyToParticipantId: 'e1'
          }),
          bid('e3', { intent: 'raise_hand', urgency: 0.5 })
        ],
        {
          lastSpeakerId: 'e1',
          lastSpokeTurn: { e2: 4, e3: 4 },
          turnIndex: 5
        }
      )
    );

    expect(result?.participantId).toBe('e2');
  });

  it('高紧急度抢答胜过紧急度较低的直接反驳', () => {
    const result = selectNextSpeaker(
      input(
        [
          bid('e2', { intent: 'interrupt', urgency: 0.8 }),
          bid('e3', {
            intent: 'rebut',
            urgency: 0.7,
            replyToParticipantId: 'e1'
          })
        ],
        {
          lastSpeakerId: 'e1',
          lastSpokeTurn: { e2: 4, e3: 4 },
          turnIndex: 5
        }
      )
    );

    expect(result?.participantId).toBe('e2');
  });

  it('同等出价时最近发言过的专家受到惩罚', () => {
    const result = selectNextSpeaker(
      input([bid('e1'), bid('e2')], {
        recentExpertSpeakerIds: ['e1'],
        lastSpokeTurn: { e1: 4, e2: 4 },
        turnIndex: 5
      })
    );

    expect(result?.participantId).toBe('e2');
  });

  it('同等出价时从未发言的专家获得公平加成', () => {
    const result = selectNextSpeaker(
      input([bid('e1'), bid('e2')], {
        lastSpokeTurn: { e2: 8 },
        turnIndex: 10
      })
    );

    expect(result?.participantId).toBe('e1');
  });

  it('被点名但没有出价的专家按普通举手并获得点名加成', () => {
    const result = selectNextSpeaker(
      input([bid('e1')], {
        addressedParticipantId: 'e2',
        lastSpokeTurn: { e1: 4, e2: 4 },
        turnIndex: 5
      })
    );

    expect(result?.participantId).toBe('e2');
    expect(result?.intent).toBe('raise_hand');
  });

  it('紧急度零点九的抢答可以胜过公平加成相同的被点名者', () => {
    const result = selectNextSpeaker(
      input(
        [bid('e1', { intent: 'interrupt', urgency: 0.9 }), bid('e2', { wantToSpeak: false })],
        {
          addressedParticipantId: 'e2',
          lastSpokeTurn: { e1: 4, e2: 4 },
          turnIndex: 8
        }
      )
    );

    expect(result?.participantId).toBe('e1');
  });

  it('完全相同的出价由随机扰动决定且相同随机序列结果稳定', () => {
    const selectWithSameRandomSequence = () => {
      const values = [0, 0.9];
      let index = 0;
      return selectNextSpeaker(
        input([bid('e1'), bid('e2')], {
          lastSpokeTurn: { e1: 3, e2: 3 },
          turnIndex: 4,
          rng: () => values[index++] ?? 0
        })
      );
    };

    const first = selectWithSameRandomSequence();
    const second = selectWithSameRandomSequence();
    const seatTie = selectNextSpeaker(
      input([bid('e1'), bid('e2')], {
        lastSpokeTurn: { e1: 3, e2: 3 },
        turnIndex: 4,
        rng: () => 0
      })
    );

    expect(first?.participantId).toBe('e2');
    expect(second).toEqual(first);
    expect(seatTie?.participantId).toBe('e1');
  });

  it('返回完整发言人信息并按权重公式计算得分', () => {
    const result = selectNextSpeaker(
      input(
        [
          bid('e2', {
            intent: 'rebut',
            urgency: 0.7,
            replyToParticipantId: 'e1'
          })
        ],
        {
          lastSpeakerId: 'e1',
          recentExpertSpeakerIds: ['e2'],
          lastSpokeTurn: { e2: 0 },
          turnIndex: 4,
          addressedParticipantId: 'e2',
          rng: () => 0.4
        }
      )
    );
    const expectedScore =
      0.7 +
      SCHEDULER_WEIGHTS.intent.rebut +
      SCHEDULER_WEIGHTS.directReply +
      -SCHEDULER_WEIGHTS.recentExpertSpeakerPenalty +
      SCHEDULER_WEIGHTS.fairnessBonus +
      SCHEDULER_WEIGHTS.addressedBonus +
      0.4 * SCHEDULER_WEIGHTS.randomJitter;

    expect(result).toMatchObject({
      participantId: 'e2',
      intent: 'rebut',
      replyToParticipantId: 'e1'
    });
    expect(result?.score).toBeCloseTo(expectedScore);
  });

  it('三十轮中按出价形成非机械且无固定座位周期的发言序列', () => {
    const rng = createRng(42);
    const sequence: string[] = [];
    const intents: NormalizedBid['intent'][] = [
      'raise_hand',
      'interrupt',
      'supplement',
      'rebut'
    ];
    let lastSpeakerId: string | null = 'host';
    let recentExpertSpeakerIds: string[] = [];
    const lastSpokeTurn: Record<string, number> = {};

    for (let turn = 1; turn <= 30; turn += 1) {
      const bids = participantIds.map((participantId) => {
        const intent = intents[Math.floor(rng() * intents.length)] ?? 'raise_hand';
        const replyToParticipantId =
          participantIds[Math.floor(rng() * participantIds.length)] ?? null;
        return bid(participantId, {
          intent,
          urgency: rng(),
          replyToParticipantId
        });
      });
      const pick = selectNextSpeaker(
        input(bids, {
          lastSpeakerId,
          recentExpertSpeakerIds,
          lastSpokeTurn: { ...lastSpokeTurn },
          turnIndex: turn,
          rng
        })
      );

      expect(pick).not.toBeNull();
      if (!pick) {
        throw new Error('Expected a speaker in every simulated turn');
      }
      sequence.push(pick.participantId);
      lastSpeakerId = pick.participantId;
      recentExpertSpeakerIds = [...recentExpertSpeakerIds, pick.participantId].slice(
        -2
      );
      lastSpokeTurn[pick.participantId] = turn;
    }

    expect(sequence.every((speaker, index) => speaker !== sequence[index - 1])).toBe(
      true
    );
    expect(sequence).not.toEqual(
      Array.from({ length: sequence.length }, (_, index) => participantIds[index % 4])
    );
    const repeatsSeatCycle = sequence.every(
      (speaker, index) => index < participantIds.length || speaker === sequence[index % 4]
    );
    expect(repeatsSeatCycle).toBe(false);
  });
});
