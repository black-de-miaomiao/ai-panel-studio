import { StreamEventSchema } from '@aps/shared';
import type { StreamEvent } from '@aps/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

export interface DiscussionEventSource {
  subscribe(
    onEvent: (event: StreamEvent, eventSeq?: number) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void;
}

export class SseDiscussionEventSource implements DiscussionEventSource {
  constructor(
    private readonly discussionId: string,
    private readonly since: number
  ) {}

  subscribe(
    onEvent: (event: StreamEvent, eventSeq?: number) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void {
    const query = new URLSearchParams({ since: String(this.since) });
    const source = new EventSource(
      `/api/discussions/${encodeURIComponent(this.discussionId)}/stream?${query.toString()}`
    );

    onStatus?.('connecting');
    source.onopen = () => onStatus?.('open');
    source.onerror = () => onStatus?.('reconnecting');
    source.onmessage = (message: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        const result = StreamEventSchema.safeParse(parsed);
        if (!result.success) return;
        const seq = Number(message.lastEventId);
        onEvent(
          result.data,
          message.lastEventId && Number.isFinite(seq) ? seq : undefined
        );
      } catch {
        // Malformed messages are ignored; EventSource will continue the stream.
      }
    };

    return () => source.close();
  }
}
