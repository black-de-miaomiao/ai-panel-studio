import type { Insight, Participant } from '@aps/shared';
import { describe, expect, it } from 'vitest';
import { makeTestInsight } from '../test/helpers';
import {
  HOST_INTERVAL,
  decideHostAction,
  type HostPolicyContext,
  type HostPolicyParticipant
} from './hostPolicy';

function person(
  id: string,
  role: Participant['role'],
  seat: number,
  speakCount: number
): HostPolicyParticipant {
  return { id, role, seat, speakCount };
}

function divergence(
  id: string,
  updatedAtSeq: number,
  participantIds: string[],
  status: Insight['status'] = 'active'
): Insight {
  return makeTestInsight({
    id,
    kind: 'divergence',
    content: `议题 ${updatedAtSeq} 仍有不同看法。`,
    status,
    stances: participantIds.map((participantId) => ({
      participantId,
      position: '需要进一步验证'
    })),
    evidenceSeqs: [1, 2],
    updatedAtSeq
  });
}

function context(
  overrides: Partial<HostPolicyContext> = {}
): HostPolicyContext {
  return {
    participants: [
      person('host', 'host', 0, 0),
      person('e1', 'expert', 1, 2),
      person('e2', 'expert', 2, 3),
      person('e3', 'expert', 3, 1),
      person('e4', 'expert', 4, 0)
    ],
    lastSpeakerId: 'e1',
    expertTurnsSinceHost: 0,
    noBidders: false,
    turnCount: 0,
    maxTurns: 8,
    expertCount: 4,
    insights: [],
    ...overrides
  };
}

describe('decideHostAction', () => {
  it('上一条发言来自主持人时交还专家发言', () => {
    expect(
      decideHostAction(
        context({
          lastSpeakerId: 'host',
          noBidders: false
        })
      )
    ).toEqual({ action: 'experts' });
  });

  it('上一轮无人出价时邀请发言最少且座位最小的专家', () => {
    expect(
      decideHostAction(
        context({
          noBidders: true,
          participants: [
            person('host', 'host', 0, 0),
            person('e1', 'expert', 1, 2),
            person('e2', 'expert', 2, 0),
            person('e3', 'expert', 3, 0)
          ]
        })
      )
    ).toEqual({ action: 'invite', targetParticipantId: 'e2' });
  });

  it('上一条发言来自主持人且上一轮无人出价时仍邀请最少发言专家', () => {
    expect(
      decideHostAction(
        context({
          lastSpeakerId: 'host',
          noBidders: true,
          participants: [
            person('host', 'host', 0, 0),
            person('e1', 'expert', 1, 3),
            person('e2', 'expert', 2, 0),
            person('e3', 'expert', 3, 0)
          ]
        })
      )
    ).toEqual({ action: 'invite', targetParticipantId: 'e2' });
  });

  it('主持人间隔达到阈值且存在活跃分歧时串联最新分歧中的合适专家', () => {
    const result = decideHostAction(
      context({
        expertTurnsSinceHost: HOST_INTERVAL,
        insights: [
          divergence('older', 8, ['e1', 'e4']),
          divergence('newer', 10, ['e2', 'e3'])
        ],
        participants: [
          person('host', 'host', 0, 0),
          person('e1', 'expert', 1, 3),
          person('e2', 'expert', 2, 4),
          person('e3', 'expert', 3, 1),
          person('e4', 'expert', 4, 0)
        ]
      })
    );

    expect(result).toEqual({ action: 'bridge', targetParticipantId: 'e3' });
  });

  it('达到主持人间隔但没有活跃分歧时追问上一位专家', () => {
    expect(
      decideHostAction(
        context({
          expertTurnsSinceHost: HOST_INTERVAL,
          insights: [
            divergence('resolved', 10, ['e1', 'e2'], 'resolved'),
            makeTestInsight({ kind: 'consensus', status: 'active' })
          ],
          lastSpeakerId: 'e3'
        })
      )
    ).toEqual({ action: 'follow_up', targetParticipantId: 'e3' });
  });

  it('达到专家人数加一轮后邀请座位最小的未发言专家', () => {
    expect(
      decideHostAction(
        context({
          expertCount: 3,
          turnCount: 4,
          participants: [
            person('host', 'host', 0, 0),
            person('e1', 'expert', 1, 1),
            person('e2', 'expert', 2, 0),
            person('e3', 'expert', 3, 0)
          ]
        })
      )
    ).toEqual({ action: 'invite', targetParticipantId: 'e2' });
  });

  it('未达到未发言邀请阈值时继续让专家出价', () => {
    expect(
      decideHostAction(
        context({
          expertCount: 4,
          turnCount: 4,
          participants: [
            person('host', 'host', 0, 0),
            person('e1', 'expert', 1, 2),
            person('e2', 'expert', 2, 0)
          ]
        })
      )
    ).toEqual({ action: 'experts' });
  });

  it('无人出价规则优先于主持人间隔与分歧串联规则', () => {
    expect(
      decideHostAction(
        context({
          noBidders: true,
          expertTurnsSinceHost: HOST_INTERVAL,
          insights: [divergence('active', 10, ['e2', 'e3'])],
          participants: [
            person('host', 'host', 0, 0),
            person('e1', 'expert', 1, 4),
            person('e2', 'expert', 2, 0),
            person('e3', 'expert', 3, 0)
          ]
        })
      )
    ).toEqual({ action: 'invite', targetParticipantId: 'e2' });
  });

  it('只剩最后一轮正文时无论是否无人出价都不安排主持人动作', () => {
    expect(
      decideHostAction(
        context({
          turnCount: 7,
          maxTurns: 8,
          noBidders: true,
          expertTurnsSinceHost: HOST_INTERVAL,
          insights: [divergence('active', 10, ['e2', 'e3'])]
        })
      )
    ).toEqual({ action: 'experts' });
  });
});
