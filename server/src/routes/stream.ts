import type { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { DiscussionEventBus } from '../engine/eventBus';

export interface StreamRouteDeps {
  db: DatabaseSync;
  bus: DiscussionEventBus;
}

export function createStreamRouter(_deps: StreamRouteDeps): Router {
  throw new Error('NOT_IMPLEMENTED');
}
