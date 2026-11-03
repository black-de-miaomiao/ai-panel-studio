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

export function decideHostAction(_ctx: HostPolicyContext): HostDecision {
  throw new Error('NOT_IMPLEMENTED');
}
