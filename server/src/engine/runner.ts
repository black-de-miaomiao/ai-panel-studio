import type { LiveUtterance } from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';
import type { DiscussionEventBus } from './eventBus';
import type { LLMGateway } from '../llm/gateway';

export interface DiscussionRunnerConfig {
  maxTurns: number;
  pacingMs: number;
}

export class DiscussionRunner {
  readonly done!: Promise<void>;

  constructor(
    _db: DatabaseSync,
    _bus: DiscussionEventBus,
    _llm: LLMGateway,
    _config: DiscussionRunnerConfig,
    _discussionId: string,
    _rng?: () => number
  ) {
    throw new Error('NOT_IMPLEMENTED');
  }

  start(): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  pause(): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  resume(): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  requestEnd(): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  stop(): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  getLiveUtterance(): LiveUtterance | null {
    throw new Error('NOT_IMPLEMENTED');
  }
}
