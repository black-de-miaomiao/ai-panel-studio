import type { LLMProvider, LLMRequest } from './types';

export function createMockProvider(_opts: {
  latencyMs?: number;
  streamDelayMs?: number;
  failOn?: (request: LLMRequest) => boolean;
} = {}): LLMProvider {
  throw new Error('NOT_IMPLEMENTED');
}
