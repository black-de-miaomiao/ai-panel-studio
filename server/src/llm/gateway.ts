import type { LLMProvider, LLMRequest, LLMUsage } from './types';

export interface LLMGateway {
  providerName: LLMProvider['name'];
  models: { quality: string; fast: string };
  complete(
    request: LLMRequest
  ): Promise<{ text: string; usage?: LLMUsage }>;
  stream(request: LLMRequest): AsyncIterable<string>;
}

export function createLLMGateway(_opts: {
  provider: LLMProvider;
  models: { quality: string; fast: string };
  maxConcurrency: number;
  logger?: (line: string) => void;
}): LLMGateway {
  throw new Error('NOT_IMPLEMENTED');
}
