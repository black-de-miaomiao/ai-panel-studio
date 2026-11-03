import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import type { NormalizedBid } from './bid';
import {
  ACT_VARIETY_WINDOW,
  SCHEDULER_WEIGHTS,
  getRecentExpertActs,
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
  it('最近三条专家正文未出现的发言行为获得多样性加分', () => {
    const bids = [
      bid('e1', {
        intent: 'rebut',
        urgency: 0.6,
        replyToParticipantId: 'e4'
      }),
      bid('e2', {
        intent: 'supplement',
        urgency: 0.6,
        replyToParticipantId: 'e4'
      })
    ];
    const common = {
      lastSpeakerId: 'e4',
      recentExpertSpeakerIds: [],
      lastSpokeTurn: { e1: 5, e2: 5 },
      turnIndex: 5,
      rng: () => 0
    } satisfies Partial<SchedulerInput>;
    const supplementPick = selectNextSpeaker(
      input(bids, {
        ...common,
        recentExpertActs: ['rebut', 'rebut', 'statement']
      })
    );
    const rebutPick = selectNextSpeaker(
      input(bids, {
        ...common,
        recentExpertActs: ['supplement', 'rebut', 'statement']
      })
    );

    expect(ACT_VARIETY_WINDOW).toBe(3);
    expect(SCHEDULER_WEIGHTS.actVarietyBonus).toBe(0.25);
    expect(supplementPick?.participantId).toBe('e2');
    expect(supplementPick?.score).toBeCloseTo(1.2);
    expect(rebutPick?.participantId).toBe('e1');
    expect(rebutPick?.score).toBeCloseTo(1.1);
  });

  it('举手按 statement 判断且空窗口不加多样性分', () => {
    const bids = [bid('e1', { intent: 'raise_hand', urgency: 0.5 })];
    const common = {
      lastSpeakerId: 'host',
      lastSpokeTurn: { e1: 5 },
      turnIndex: 5,
      rng: () => 0
    };
    const statementMissing = selectNextSpeaker(
      input(bids, { ...common, recentExpertActs: ['rebut'] })
    );
    const statementSeen = selectNextSpeaker(
      input(bids, { ...common, recentExpertActs: ['statement'] })
    );
    const emptyWindow = selectNextSpeaker(
      input(bids, { ...common, recentExpertActs: [] })
    );

    expect(statementMissing?.participantId).toBe('e1');
    expect(statementMissing?.score).toBeCloseTo(0.85);
    expect(statementSeen?.score).toBeCloseTo(0.6);
    expect(emptyWindow?.score).toBeCloseTo(0.6);
  });

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

describe('getRecentExpertActs', () => {
  it('只取最近三条专家正文 act 并按时间正序返回', () => {
    const participants = [
      { id: 'host', role: 'host' },
      { id: 'e1', role: 'expert' }
    ] as const;
    const utterances = [
      { seq: 6, participantId: 'e1', act: 'interrupt' },
      { seq: 2, participantId: 'host', act: 'statement' },
      { seq: 9, participantId: 'host', act: 'closing' },
      { seq: 3, participantId: 'e1', act: 'supplement' },
      { seq: 4, participantId: 'host', act: 'opening' },
      { seq: 1, participantId: 'e1', act: 'statement' },
      { seq: 5, participantId: 'e1', act: 'rebut' },
      { seq: 7, participantId: 'e1', act: 'closing' },
      { seq: 8, participantId: 'e1', act: 'bridge' }
    ] as const;

    expect(getRecentExpertActs(utterances, participants)).toEqual([
      'supplement',
      'rebut',
      'interrupt'
    ]);
  });
});
