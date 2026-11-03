import {
  EXPERT_PALETTE,
  FIELD_LIMITS,
  HOST_COLOR,
  type Participant
} from '@aps/shared';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function readString(
  source: Record<string, unknown>,
  field: keyof typeof FIELD_LIMITS,
  required: boolean,
  defaultValue: string
): string {
  const value = source[field];
  if (value === undefined && !required) {
    return defaultValue;
  }
  if (typeof value !== 'string') {
    throw new LineupValidationError('INVALID_FORMAT');
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new LineupValidationError('INVALID_FORMAT');
  }
  return truncate(trimmed || defaultValue, FIELD_LIMITS[field]);
}

function normalizeParticipant(
  source: unknown,
  role: Participant['role'],
  seat: number
): ParticipantDraft {
  if (!isRecord(source)) {
    throw new LineupValidationError('INVALID_FORMAT');
  }

  const name = readString(source, 'name', true, '');
  const profession = readString(source, 'profession', true, '');
  const title = readString(source, 'title', true, '');
  const stance = readString(source, 'stance', true, '');
  const stanceTag = readString(source, 'stanceTag', false, '观点');
  const persona = readString(source, 'persona', false, '');

  if (
    name.length === 0 ||
    profession.length === 0 ||
    title.length === 0 ||
    stance.length === 0
  ) {
    throw new LineupValidationError('INVALID_FORMAT');
  }

  return {
    role,
    seat,
    name,
    profession,
    title,
    stance,
    stanceTag: stanceTag || '观点',
    persona,
    color: role === 'host' ? HOST_COLOR : EXPERT_PALETTE[seat - 1] ?? HOST_COLOR,
    avatar: name.slice(0, 1)
  };
}

export function normalizeLineup(
  raw: unknown,
  expertCount: number
): NormalizedLineup {
  if (
    !Number.isInteger(expertCount) ||
    expertCount < 2 ||
    expertCount > EXPERT_PALETTE.length ||
    !isRecord(raw) ||
    !Array.isArray(raw.experts)
  ) {
    throw new LineupValidationError('INVALID_FORMAT');
  }

  if (raw.experts.length < expertCount) {
    throw new LineupValidationError('INSUFFICIENT_EXPERTS');
  }

  const host = normalizeParticipant(raw.host, 'host', 0);
  const experts = raw.experts
    .slice(0, expertCount)
    .map((expert, index) => normalizeParticipant(expert, 'expert', index + 1));
  const names = [host.name, ...experts.map(({ name }) => name)];

  if (new Set(names).size !== names.length) {
    throw new LineupValidationError('DUPLICATE_NAMES');
  }

  if (
    expertCount >= 2 &&
    new Set(experts.map(({ stanceTag }) => stanceTag)).size === 1
  ) {
    throw new LineupValidationError('LOW_DIVERSITY');
  }

  return { host, experts };
}
