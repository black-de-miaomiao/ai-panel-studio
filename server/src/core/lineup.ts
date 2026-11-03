import type { Participant } from '@aps/shared';

export type LineupValidationCode =
  | 'INVALID_FORMAT'
  | 'INSUFFICIENT_EXPERTS'
  | 'DUPLICATE_NAMES'
  | 'LOW_DIVERSITY';

export class LineupValidationError extends Error {
  constructor(readonly code: LineupValidationCode) {
    super(code);
    this.name = 'LineupValidationError';
  }
}

export type ParticipantDraft = Pick<
  Participant,
  | 'role'
  | 'seat'
  | 'name'
  | 'profession'
  | 'title'
  | 'stance'
  | 'stanceTag'
  | 'persona'
  | 'color'
  | 'avatar'
>;

export interface NormalizedLineup {
  host: ParticipantDraft;
  experts: ParticipantDraft[];
}

export function normalizeLineup(
  _raw: unknown,
  _expertCount: number
): NormalizedLineup {
  throw new Error('NOT_IMPLEMENTED');
}
