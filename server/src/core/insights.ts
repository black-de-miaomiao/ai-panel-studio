import type { Insight } from '@aps/shared';

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

export function similarity(_a: string, _b: string): number {
  throw new Error('NOT_IMPLEMENTED');
}

export function mergeInsights(
  _current: Insight[],
  _patch: unknown,
  _ctx: MergeContext
): MergeInsightsResult {
  throw new Error('NOT_IMPLEMENTED');
}
