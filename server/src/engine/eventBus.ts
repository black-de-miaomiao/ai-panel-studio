import {
  isDurableEvent,
  StreamEventSchema,
  type StreamEvent
} from '@aps/shared';
import type { DatabaseSync } from 'node:sqlite';
import { append } from '../db/repositories/events';

export interface EventEnvelope {
  event: StreamEvent;
  seq: number | null;
}

export type EventListener = (envelope: EventEnvelope) => void;
export type DiscussionCloseListener = () => void;

export interface DiscussionEventBus {
  publish(event: StreamEvent): EventEnvelope;
  broadcastPersisted?(envelope: EventEnvelope): void;
  subscribe(
    discussionId: string,
    listener: EventListener,
    onClose?: DiscussionCloseListener
  ): () => void;
  viewerCount(discussionId: string): number;
  closeDiscussion(discussionId: string): void;
  closeAll(): void;
}

interface Subscription {
  listener: EventListener;
  onClose?: DiscussionCloseListener;
}

interface Channel {
  subscriptions: Set<Subscription>;
  pending: EventEnvelope[];
  dispatching: boolean;
  closed: boolean;
}

function createChannel(): Channel {
  return {
    subscriptions: new Set(),
    pending: [],
    dispatching: false,
    closed: false
  };
}

export function createEventBus(database: DatabaseSync): DiscussionEventBus {
  const channels = new Map<string, Channel>();

  const dispatch = (envelope: EventEnvelope): void => {
    const channel = channels.get(envelope.event.discussionId);
    if (!channel || channel.closed || channel.subscriptions.size === 0) {
      return;
    }
    channel.pending.push(envelope);
    if (channel.dispatching) {
      return;
    }

    channel.dispatching = true;
    try {
      while (channel.pending.length > 0 && !channel.closed) {
        const next = channel.pending.shift();
        if (!next) {
          continue;
        }
        for (const subscription of [...channel.subscriptions]) {
          try {
            subscription.listener(next);
          } catch {
            // One observer must not interrupt delivery to other observers.
          }
        }
      }
    } finally {
      channel.dispatching = false;
    }
  };

  const closeDiscussion = (discussionId: string): void => {
    const channel = channels.get(discussionId);
    if (!channel) {
      return;
    }
    channel.closed = true;
    for (const subscription of [...channel.subscriptions]) {
      try {
        subscription.onClose?.();
      } catch {
        // A disconnected observer must not block channel cleanup.
      }
    }
    channel.pending = [];
    channel.subscriptions.clear();
    if (channels.get(discussionId) === channel) {
      channels.delete(discussionId);
    }
  };

  return {
    publish(rawEvent) {
      const event = StreamEventSchema.parse(rawEvent);
      const seq = isDurableEvent(event)
        ? append(database, event.discussionId, event)
        : null;
      const envelope = { event, seq };
      dispatch(envelope);
      return envelope;
    },
    broadcastPersisted(envelope) {
      const event = StreamEventSchema.parse(envelope.event);
      if (!isDurableEvent(event) || !Number.isInteger(envelope.seq) || envelope.seq === null) {
        throw new TypeError('Persisted event envelope is invalid');
      }
      dispatch({ event, seq: envelope.seq });
    },
    subscribe(discussionId, listener, onClose) {
      let channel = channels.get(discussionId);
      if (!channel || channel.closed) {
        channel = createChannel();
        channels.set(discussionId, channel);
      }
      const subscription: Subscription = { listener, onClose };
      channel.subscriptions.add(subscription);
      let active = true;

      return () => {
        if (!active) {
          return;
        }
        active = false;
        channel?.subscriptions.delete(subscription);
        if (
          channel &&
          !channel.closed &&
          channel.subscriptions.size === 0 &&
          channels.get(discussionId) === channel
        ) {
          channels.delete(discussionId);
        }
      };
    },
    viewerCount(discussionId) {
      return channels.get(discussionId)?.subscriptions.size ?? 0;
    },
    closeDiscussion,
    closeAll() {
      for (const discussionId of [...channels.keys()]) {
        closeDiscussion(discussionId);
      }
    }
  };
}
