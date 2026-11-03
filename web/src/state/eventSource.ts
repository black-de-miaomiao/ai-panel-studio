import type { StreamEvent } from '@aps/shared';

export type ConnectionStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export interface DiscussionEventSource {
  subscribe(
    onEvent: (event: StreamEvent, eventSeq?: number) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void;
}
