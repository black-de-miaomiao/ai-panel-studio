import type {
  Discussion,
  LiveUtterance
} from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';
import type { DiscussionEventBus } from './eventBus';
import type { LLMGateway } from '../llm/gateway';

export interface DiscussionManagerConfig {
  maxTurns: number;
  pacingMs: number;
}

export class DiscussionManager {
  constructor(
    _db: DatabaseSync,
    _bus: DiscussionEventBus,
    _llm: LLMGateway,
    _config: DiscussionManagerConfig
  ) {
    throw new Error('NOT_IMPLEMENTED');
  }

  start(_discussionId: string): Discussion | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  pause(_discussionId: string): Discussion | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  resume(_discussionId: string): Discussion | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  end(_discussionId: string): Discussion | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  remove(_discussionId: string): boolean {
    throw new Error('NOT_IMPLEMENTED');
  }

  recoverOnBoot(): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  getLiveUtterance(_discussionId: string): LiveUtterance | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  stopAll(): void {
    throw new Error('NOT_IMPLEMENTED');
  }
}
