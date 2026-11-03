import type { LLMProvider } from './types';

export function createOpenAICompatibleProvider(_opts: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutsMs?: { quality: number; fast: number };
}): LLMProvider {
  throw new Error('NOT_IMPLEMENTED');
}
