import type {
  HostAct,
  Insight,
  Participant,
  SpeechAct
} from '@aps/shared';
import type { AliasMap } from '../core/context';

export interface PromptParts {
  system: string;
  user: string;
  context: unknown;
}

export type PromptRoleCard = Pick<
  Participant,
  | 'name'
  | 'profession'
  | 'title'
  | 'stance'
  | 'stanceTag'
  | 'persona'
>;

export interface DiscussionPromptInput {
  topic: string;
  transcriptWindow: string;
  insights: readonly Insight[];
}

export interface InsightPromptUtterance {
  seq: number;
  speakerAlias: string;
  act: SpeechAct;
  replyToAlias: string | null;
  content: string;
}

export function buildLineupPrompt(_input: {
  topic: string;
  expertCount: number;
}): PromptParts {
  throw new Error('NOT_IMPLEMENTED');
}

export function buildBidPrompt(
  _input: DiscussionPromptInput & {
    speakerAlias: string;
    speaker: PromptRoleCard;
    aliasMap: AliasMap;
  }
): PromptParts {
  throw new Error('NOT_IMPLEMENTED');
}

export function buildUtterancePrompt(
  _input: DiscussionPromptInput & {
    speakerAlias: string;
    speaker: PromptRoleCard;
    act: SpeechAct;
    replyToAlias: string | null;
  }
): PromptParts {
  throw new Error('NOT_IMPLEMENTED');
}

export function buildHostPrompt(
  _input: DiscussionPromptInput & {
    hostRoleCard: PromptRoleCard;
    action: HostAct;
    targetAlias: string | null;
  }
): PromptParts {
  throw new Error('NOT_IMPLEMENTED');
}

export function buildInsightsPrompt(_input: {
  topic: string;
  aliasMap: AliasMap;
  existingInsights: readonly Insight[];
  newUtterances: readonly InsightPromptUtterance[];
}): PromptParts {
  throw new Error('NOT_IMPLEMENTED');
}

export function buildSummaryPrompt(
  _input: DiscussionPromptInput
): PromptParts {
  throw new Error('NOT_IMPLEMENTED');
}
