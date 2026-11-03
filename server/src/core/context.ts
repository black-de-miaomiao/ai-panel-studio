import type { Insight, Participant, Utterance } from '@aps/shared';

export type AliasMap = Record<string, string>;

export function buildAliasMap(
  _participants: readonly Participant[]
): AliasMap {
  throw new Error('NOT_IMPLEMENTED');
}

export function buildTranscriptWindow(
  _utterances: readonly Utterance[],
  _participants: readonly Participant[],
  _k?: number
): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function formatInsightsForPrompt(
  _insights: readonly Insight[],
  _participants: readonly Participant[]
): string {
  throw new Error('NOT_IMPLEMENTED');
}
