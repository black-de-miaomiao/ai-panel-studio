import {
  isDurableEvent,
  StreamEventSchema
} from '@aps/shared';
import type { StreamEvent } from '@aps/shared';
import type {
  ConnectionStatus,
  DiscussionEventSource
} from './eventSource';

interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  readonly readyState: number;
  close(): void;
}

export interface EventSourceConstructor {
  new (url: string): EventSourceLike;
  readonly CONNECTING?: number;
  readonly OPEN?: number;
  readonly CLOSED?: number;
}

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000] as const;

function warnInvalidEvent(message: string): void {
  if (import.meta.env.DEV) {
    console.warn(message);
  }
}

function parseEventSeq(lastEventId: string): number | undefined {
  if (!/^\d+$/.test(lastEventId)) return undefined;
  const seq = Number(lastEventId);
  return Number.isSafeInteger(seq) && seq > 0 ? seq : undefined;
}

export class SseDiscussionEventSource implements DiscussionEventSource {
  constructor(
    private readonly discussionId: string,
    private readonly since: number,
    private readonly EventSourceCtor?: EventSourceConstructor
  ) {}

  subscribe(
    onEvent: (event: StreamEvent, eventSeq?: number) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void {
    const eventSourceCtor = this.EventSourceCtor ?? globalThis.EventSource;
    const closedState = eventSourceCtor.CLOSED ?? 2;
    let latestSeq = this.since;
    let retryIndex = 0;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let currentSource: EventSourceLike | null = null;

    const scheduleRetry = () => {
      if (!active || retryTimer !== undefined) return;
      const delay =
        RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)] ??
        RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      retryIndex += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!active) return;
      onStatus?.('connecting');
      const query = new URLSearchParams({ since: String(latestSeq) });
      const url =
        `/api/discussions/${encodeURIComponent(this.discussionId)}/stream?` +
        query.toString();

      let source: EventSourceLike;
      try {
        source = new eventSourceCtor(url);
      } catch {
        onStatus?.('closed');
        scheduleRetry();
        return;
      }
      currentSource = source;

      source.onopen = () => {
        if (!active || currentSource !== source) return;
        retryIndex = 0;
        onStatus?.('open');
      };

      source.onerror = () => {
        if (!active || currentSource !== source) return;
        if (source.readyState === closedState) {
          currentSource = null;
          onStatus?.('closed');
          scheduleRetry();
        } else {
          // EventSource reconnects itself and retains its Last-Event-ID here.
          onStatus?.('reconnecting');
        }
      };

      source.onmessage = (message) => {
        if (!active || currentSource !== source) return;
        let value: unknown;
        try {
          value = JSON.parse(message.data);
        } catch {
          warnInvalidEvent('已忽略无法解析的 SSE 消息。');
          return;
        }

        const parsed = StreamEventSchema.safeParse(value);
        if (!parsed.success) {
          warnInvalidEvent('已忽略不符合事件契约的 SSE 消息。');
          return;
        }

        const eventSeq = isDurableEvent(parsed.data)
          ? parseEventSeq(message.lastEventId)
          : undefined;
        if (isDurableEvent(parsed.data) && eventSeq === undefined) {
          warnInvalidEvent('已忽略缺少有效事件序号的持久 SSE 消息。');
          return;
        }
        if (eventSeq !== undefined) {
          latestSeq = Math.max(latestSeq, eventSeq);
        }
        onEvent(parsed.data, eventSeq);
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      currentSource?.close();
      currentSource = null;
      onStatus?.('closed');
    };
  }
}
