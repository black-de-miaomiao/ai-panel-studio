import type { StreamEvent } from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';

export interface EventEnvelope {
  event: StreamEvent;
  seq: number | null;
}

export type EventListener = (envelope: EventEnvelope) => void;

export interface DiscussionEventBus {
  publish(event: StreamEvent): EventEnvelope;
  subscribe(
    discussionId: string,
    listener: EventListener
  ): () => void;
  viewerCount(discussionId: string): number;
  closeDiscussion(discussionId: string): void;
}

export function createEventBus(_db: DatabaseSync): DiscussionEventBus {
  throw new Error('NOT_IMPLEMENTED');
}
