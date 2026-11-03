import type { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config';
import type { DiscussionEventBus } from '../engine/eventBus';
import type { DiscussionManager } from '../engine/manager';
import type { LLMGateway } from '../llm/gateway';

export interface DiscussionsRouteDeps {
  db: DatabaseSync;
  config: AppConfig;
  llm: LLMGateway;
  bus: DiscussionEventBus;
  manager: DiscussionManager;
}

export function createDiscussionsRouter(
  _deps: DiscussionsRouteDeps
): Router {
  throw new Error('NOT_IMPLEMENTED');
}
