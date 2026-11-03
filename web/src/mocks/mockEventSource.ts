import type { StreamEvent } from '@aps/shared';
import type {
  ConnectionStatus,
  DiscussionEventSource
} from '../state/eventSource';
import type { MockFrame } from './mockScript';

export class MockEventSource implements DiscussionEventSource {
  private cursor: number;
  private activeCleanup: (() => void) | null = null;

  constructor(
    private readonly frames: MockFrame[],
    private readonly speed = 1,
    startAt = 0
  ) {
    this.cursor = Math.max(0, Math.min(frames.length, Math.floor(startAt)));
  }

  subscribe(
    onEvent: (event: StreamEvent, eventSeq?: number) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void {
    this.activeCleanup?.();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    onStatus?.('connecting');
    onStatus?.('open');

    const scheduleNext = () => {
      const frame = this.frames[this.cursor];
      if (!active || !frame) return;
      timer = setTimeout(() => {
        if (!active) return;
        this.cursor += 1;
        onEvent(frame.event, frame.eventSeq);
        scheduleNext();
      }, Math.max(0, frame.delayMs / Math.max(0.1, this.speed)));
    };
    scheduleNext();

    const cleanup = () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      if (this.activeCleanup === cleanup) this.activeCleanup = null;
    };
    this.activeCleanup = cleanup;
    return cleanup;
  }
}
