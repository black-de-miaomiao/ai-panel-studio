export type LLMTask =
  | 'lineup'
  | 'bid'
  | 'utterance'
  | 'host'
  | 'insights'
  | 'summary';

export type LLMTier = 'quality' | 'fast';

export type LLMThinking = 'disabled' | 'low' | 'high';

export interface LLMRequest {
  task: LLMTask;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  thinking?: LLMThinking;
  context?: unknown;
  signal?: AbortSignal;
  discussionId?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMProvider {
  name: 'deepseek' | 'mock';
  complete(
    request: LLMRequest & { model: string }
  ): Promise<{ text: string; usage?: LLMUsage }>;
  stream(request: LLMRequest & { model: string }): AsyncIterable<string>;
}

export interface TaskRouting {
  tier: LLMTier;
  thinking: LLMThinking;
  temperature: number;
  maxTokens: number;
}

export const TASK_ROUTING = {
  lineup: {
    tier: 'quality',
    thinking: 'disabled',
    temperature: 0.9,
    maxTokens: 3000
  },
  summary: {
    tier: 'quality',
    thinking: 'disabled',
    temperature: 0.5,
    maxTokens: 1500
  },
  bid: {
    tier: 'fast',
    thinking: 'disabled',
    temperature: 0.7,
    maxTokens: 300
  },
  utterance: {
    tier: 'fast',
    thinking: 'disabled',
    temperature: 0.8,
    maxTokens: 300
  },
  host: {
    tier: 'fast',
    thinking: 'disabled',
    temperature: 0.7,
    maxTokens: 300
  },
  insights: {
    tier: 'fast',
    thinking: 'disabled',
    temperature: 0.2,
    maxTokens: 1500
  }
} as const satisfies Record<LLMTask, TaskRouting>;
