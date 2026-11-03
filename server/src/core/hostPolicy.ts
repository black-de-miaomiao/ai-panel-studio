import type { Insight, Participant } from '@aps/shared';

export const HOST_INTERVAL = 3;

export type HostPolicyParticipant = Pick<
  Participant,
  'id' | 'role' | 'seat' | 'speakCount'
>;

export interface HostPolicyContext {
  participants: readonly HostPolicyParticipant[];
  lastSpeakerId: string | null;
  expertTurnsSinceHost: number;
  noBidders: boolean;
  turnCount: number;
  expertCount: number;
  insights: readonly Insight[];
}

export type HostDecision =
  | { action: 'experts' }
  | {
      action: 'follow_up' | 'bridge' | 'invite';
      targetParticipantId: string;
    };

function pickLeastSpoken(
  candidates: readonly HostPolicyParticipant[]
): HostPolicyParticipant | undefined {
  return [...candidates]
    .filter(({ role }) => role === 'expert')
    .sort(
      (left, right) =>
        left.speakCount - right.speakCount || left.seat - right.seat
    )[0];
}

export function decideHostAction(ctx: HostPolicyContext): HostDecision {
  const experts = ctx.participants.filter(({ role }) => role === 'expert');

  if (ctx.noBidders) {
    const target = pickLeastSpoken(experts);
    return target
      ? { action: 'invite', targetParticipantId: target.id }
      : { action: 'experts' };
  }

  const hostSpokeLast =
    ctx.lastSpeakerId !== null &&
    ctx.participants.some(
      ({ id, role }) => id === ctx.lastSpeakerId && role === 'host'
    );
  if (hostSpokeLast) {
    return { action: 'experts' };
  }

  if (ctx.expertTurnsSinceHost >= HOST_INTERVAL) {
    const latestActiveDivergence = ctx.insights
      .filter(
        (insight) =>
          insight.kind === 'divergence' &&
          insight.status === 'active' &&
          new Set(
            insight.stances
              .map(({ participantId }) => participantId)
              .filter((id) => experts.some((expert) => expert.id === id))
          ).size >= 2
      )
      .sort((left, right) => right.updatedAtSeq - left.updatedAtSeq)[0];

    if (latestActiveDivergence) {
      const participantsInDivergence = new Set(
        latestActiveDivergence.stances.map(({ participantId }) => participantId)
      );
      const eligible = experts.filter(
        ({ id }) =>
          id !== ctx.lastSpeakerId && participantsInDivergence.has(id)
      );
      const target = pickLeastSpoken(eligible);
      if (target) {
        return { action: 'bridge', targetParticipantId: target.id };
      }
    }

    if (ctx.lastSpeakerId && experts.some(({ id }) => id === ctx.lastSpeakerId)) {
      return { action: 'follow_up', targetParticipantId: ctx.lastSpeakerId };
    }
    return { action: 'experts' };
  }

  if (ctx.turnCount >= ctx.expertCount + 1) {
    const unheard = experts.filter(({ speakCount }) => speakCount === 0);
    const target = pickLeastSpoken(unheard);
    if (target) {
      return { action: 'invite', targetParticipantId: target.id };
    }
  }

  return { action: 'experts' };
}
