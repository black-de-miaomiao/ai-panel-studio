import { FIELD_LIMITS, type Insight } from '@aps/shared';

export interface ConsensusInsightPatch {
  ref?: string | null;
  content: string;
  participants: string[];
  evidence: number[];
}

export interface DivergenceInsightPatch {
  ref?: string | null;
  content: string;
  stances: Array<{ who: string; position: string }>;
  evidence: number[];
  resolved?: boolean;
}

export interface InsightPatch {
  consensus?: ConsensusInsightPatch[];
  divergences?: DivergenceInsightPatch[];
}

export interface MergeContext {
  discussionId: string;
  aliasToParticipantId: Record<string, string>;
  refToInsightId: Record<string, string>;
  validSeqs: ReadonlySet<number>;
  currentSeq: number;
  now: string;
  newId: () => string;
  maxPerKind: number;
  similarityThreshold: number;
}

export interface MergeInsightsResult {
  insights: Insight[];
  changed: boolean;
}

function normalizeForSimilarity(value: string): string[] {
  return Array.from(value.replace(/[\p{P}\p{Z}\s]/gu, ''));
}

export function similarity(a: string, b: string): number {
  const left = normalizeForSimilarity(a);
  const right = normalizeForSimilarity(b);
  const bigrams = (characters: readonly string[]): Set<string> => {
    const result = new Set<string>();
    for (let index = 0; index < characters.length - 1; index += 1) {
      result.add(`${characters[index]}${characters[index + 1]}`);
    }
    return result;
  };
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  const union = new Set([...leftPairs, ...rightPairs]);
  if (union.size === 0) {
    return left.join('') === right.join('') ? 1 : 0;
  }
  let intersectionSize = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) {
      intersectionSize += 1;
    }
  }
  return intersectionSize / union.size;
}

interface NormalizedPatch {
  content: string;
  stances: Insight['stances'];
  evidenceSeqs: number[];
  resolved: boolean;
  ref: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeEvidence(value: unknown, ctx: MergeContext): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value.filter(
      (seq): seq is number =>
        typeof seq === 'number' &&
        Number.isInteger(seq) &&
        seq > 0 &&
        ctx.validSeqs.has(seq)
    )
  )].sort((left, right) => left - right);
}

function mapExpertAlias(alias: unknown, ctx: MergeContext): string | null {
  if (typeof alias !== 'string') {
    return null;
  }
  const normalized = alias.trim();
  if (!normalized || normalized === 'H') {
    return null;
  }
  return ctx.aliasToParticipantId[normalized] ?? null;
}

function normalizeConsensusPatch(
  raw: unknown,
  ctx: MergeContext
): NormalizedPatch | null {
  if (!isRecord(raw) || typeof raw.content !== 'string') {
    return null;
  }
  const content = truncate(raw.content.trim(), FIELD_LIMITS.insightContent);
  if (!content) {
    return null;
  }

  const stances = new Map<string, Insight['stances'][number]>();
  if (Array.isArray(raw.participants)) {
    for (const alias of raw.participants) {
      const participantId = mapExpertAlias(alias, ctx);
      if (participantId) {
        stances.set(participantId, { participantId, position: '认同' });
      }
    }
  }
  const evidenceSeqs = normalizeEvidence(raw.evidence, ctx);
  if (stances.size < 2 || evidenceSeqs.length === 0) {
    return null;
  }

  return {
    content,
    stances: [...stances.values()],
    evidenceSeqs,
    resolved: false,
    ref: typeof raw.ref === 'string' ? raw.ref.trim() || null : null
  };
}

function normalizeDivergencePatch(
  raw: unknown,
  ctx: MergeContext
): NormalizedPatch | null {
  if (!isRecord(raw) || typeof raw.content !== 'string') {
    return null;
  }
  const content = truncate(raw.content.trim(), FIELD_LIMITS.insightContent);
  if (!content) {
    return null;
  }

  const stances = new Map<string, Insight['stances'][number]>();
  if (Array.isArray(raw.stances)) {
    for (const value of raw.stances) {
      if (!isRecord(value) || typeof value.position !== 'string') {
        continue;
      }
      const participantId = mapExpertAlias(value.who, ctx);
      const position = truncate(value.position.trim(), FIELD_LIMITS.position);
      if (participantId && position) {
        stances.set(participantId, { participantId, position });
      }
    }
  }
  const evidenceSeqs = normalizeEvidence(raw.evidence, ctx);
  if (stances.size < 2 || evidenceSeqs.length === 0) {
    return null;
  }

  return {
    content,
    stances: [...stances.values()],
    evidenceSeqs,
    resolved: raw.resolved === true,
    ref: typeof raw.ref === 'string' ? raw.ref.trim() || null : null
  };
}

function mergeStances(
  current: Insight['stances'],
  patch: Insight['stances']
): Insight['stances'] {
  const merged = new Map(
    current.map((stance) => [stance.participantId, stance])
  );
  for (const stance of patch) {
    merged.set(stance.participantId, stance);
  }
  return [...merged.values()];
}

function mergeEvidence(
  current: readonly number[],
  patch: readonly number[]
): number[] {
  return [...new Set([...current, ...patch])].sort((left, right) => left - right);
}

function sameInsight(left: Insight, right: Insight): boolean {
  return (
    left.id === right.id &&
    left.discussionId === right.discussionId &&
    left.kind === right.kind &&
    left.content === right.content &&
    left.status === right.status &&
    left.updatedAtSeq === right.updatedAtSeq &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.evidenceSeqs.length === right.evidenceSeqs.length &&
    left.evidenceSeqs.every((seq, index) => seq === right.evidenceSeqs[index]) &&
    left.stances.length === right.stances.length &&
    left.stances.every(
      (stance, index) =>
        stance.participantId === right.stances[index]?.participantId &&
        stance.position === right.stances[index]?.position
    )
  );
}

function matchInsight(
  insights: readonly Insight[],
  kind: Insight['kind'],
  patch: NormalizedPatch,
  ctx: MergeContext
): number {
  if (patch.ref) {
    const referencedId = ctx.refToInsightId[patch.ref];
    const referencedIndex = insights.findIndex(
      (insight) => insight.id === referencedId && insight.kind === kind
    );
    if (referencedIndex >= 0) {
      return referencedIndex;
    }
  }

  let bestIndex = -1;
  let bestSimilarity = ctx.similarityThreshold;
  insights.forEach((insight, index) => {
    if (insight.kind !== kind) {
      return;
    }
    const score = similarity(insight.content, patch.content);
    if (score >= bestSimilarity) {
      if (score > bestSimilarity || bestIndex < 0) {
        bestSimilarity = score;
        bestIndex = index;
      }
    }
  });
  return bestIndex;
}

function applyPatch(
  insights: Insight[],
  kind: Insight['kind'],
  patch: NormalizedPatch,
  ctx: MergeContext
): void {
  const matchedIndex = matchInsight(insights, kind, patch, ctx);
  if (matchedIndex >= 0) {
    const current = insights[matchedIndex];
    if (!current) {
      return;
    }
    const updated: Insight = {
      ...current,
      content: patch.content,
      stances: mergeStances(current.stances, patch.stances),
      evidenceSeqs: mergeEvidence(current.evidenceSeqs, patch.evidenceSeqs),
      updatedAtSeq: ctx.currentSeq,
      updatedAt: ctx.now,
      status:
        kind === 'divergence' && patch.resolved ? 'resolved' : current.status
    };
    insights[matchedIndex] = updated;
    return;
  }

  insights.push({
    id: ctx.newId(),
    discussionId: ctx.discussionId,
    kind,
    content: patch.content,
    status: 'active',
    stances: patch.stances,
    evidenceSeqs: patch.evidenceSeqs,
    updatedAtSeq: ctx.currentSeq,
    createdAt: ctx.now,
    updatedAt: ctx.now
  });
}

function enforceKindLimit(
  insights: Insight[],
  kind: Insight['kind'],
  maxPerKind: number
): Insight[] {
  const kindInsights = insights
    .map((insight, index) => ({ insight, index }))
    .filter(({ insight }) => insight.kind === kind)
    .sort(
      (left, right) =>
        right.insight.updatedAtSeq - left.insight.updatedAtSeq ||
        left.index - right.index
    );
  const allowed = new Set(
    kindInsights
      .slice(0, maxPerKind)
      .map(({ insight }) => insight.id)
  );
  return insights.filter(
    (insight) => insight.kind !== kind || allowed.has(insight.id)
  );
}

export function mergeInsights(
  current: Insight[],
  patch: unknown,
  ctx: MergeContext
): MergeInsightsResult {
  if (!isRecord(patch)) {
    return { insights: current, changed: false };
  }

  let insights = [...current];
  const consensusPatches = Array.isArray(patch.consensus)
    ? patch.consensus
    : [];
  for (const raw of consensusPatches) {
    const normalized = normalizeConsensusPatch(raw, ctx);
    if (normalized) {
      applyPatch(insights, 'consensus', normalized, ctx);
    }
  }

  const divergencePatches = Array.isArray(patch.divergences)
    ? patch.divergences
    : [];
  for (const raw of divergencePatches) {
    const normalized = normalizeDivergencePatch(raw, ctx);
    if (normalized) {
      applyPatch(insights, 'divergence', normalized, ctx);
    }
  }

  const maxPerKind = Math.max(0, Math.floor(ctx.maxPerKind));
  insights = enforceKindLimit(insights, 'consensus', maxPerKind);
  insights = enforceKindLimit(insights, 'divergence', maxPerKind);

  const changed =
    insights.length !== current.length ||
    insights.some((insight, index) => {
      const previous = current[index];
      return !previous || !sameInsight(previous, insight);
    });
  return { insights, changed };
}
