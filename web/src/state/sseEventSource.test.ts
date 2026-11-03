import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@aps/shared';
import {
  SseDiscussionEventSource,
  type EventSourceConstructor
} from './sseEventSource';

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closeCount = 0;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.(new Event('open'));
  }

  fail(state = FakeEventSource.CONNECTING): void {
    this.readyState = state;
    this.onerror?.(new Event('error'));
  }

  emit(data: string, lastEventId = ''): void {
    this.onmessage?.(
      new MessageEvent<string>('message', { data, lastEventId })
    );
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = FakeEventSource.CLOSED;
  }
}

const constructor = FakeEventSource as EventSourceConstructor;
const discussionId = '00000000-0000-4000-8000-000000000100';
const at = '2026-04-15T09:00:00.000Z';

function durableEvent(): StreamEvent {
  return {
    type: 'discussion.status',
    discussionId,
    at,
    status: 'live',
    turnCount: 2,
    maxTurns: 16
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SSE discussion event source', () => {
  it('forwards valid events and discards invalid JSON and schemas', () => {
    const onEvent = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new SseDiscussionEventSource(discussionId, 4, constructor).subscribe(
      onEvent
    );
    const source = FakeEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) return;

    source.emit(JSON.stringify(durableEvent()), '7');
    source.emit('{broken JSON');
    source.emit(JSON.stringify({ type: 'unknown', discussionId, at }), '8');

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(durableEvent(), 7);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('takes durable sequence numbers from lastEventId only', () => {
    const events: Array<{ event: StreamEvent; seq?: number }> = [];
    new SseDiscussionEventSource(discussionId, 0, constructor).subscribe(
      (event, seq) => events.push({ event, seq })
    );
    const source = FakeEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) return;

    source.emit(JSON.stringify(durableEvent()), '41');
    source.emit(
      JSON.stringify({
        type: 'viewers.updated',
        discussionId,
        at,
        viewerCount: 5
      }),
      '41'
    );

    expect(events.map(({ seq }) => seq)).toEqual([41, undefined]);
  });

  it('reports connecting, open, automatic reconnect, and open states', () => {
    const statuses: string[] = [];
    new SseDiscussionEventSource(discussionId, 0, constructor).subscribe(
      () => {},
      (status) => statuses.push(status)
    );
    const source = FakeEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) return;

    source.open();
    source.fail(FakeEventSource.CONNECTING);
    source.open();

    expect(statuses).toEqual([
      'connecting',
      'open',
      'reconnecting',
      'open'
    ]);
  });

  it('closes and cancels pending retries when unsubscribed', () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const unsubscribe = new SseDiscussionEventSource(
      discussionId,
      0,
      constructor
    ).subscribe(() => {}, (status) => statuses.push(status));
    const source = FakeEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) return;

    source.fail(FakeEventSource.CLOSED);
    unsubscribe();
    vi.advanceTimersByTime(5_000);

    expect(source.closeCount).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');

    const activeUnsubscribe = new SseDiscussionEventSource(
      discussionId,
      0,
      constructor
    ).subscribe(() => {});
    const activeSource = FakeEventSource.instances[1];
    expect(activeSource).toBeDefined();
    activeUnsubscribe();
    expect(activeSource?.closeCount).toBe(1);
  });

  it('reconnects after CLOSED with the latest durable cursor and backoff', async () => {
    vi.useFakeTimers();
    const unsubscribe = new SseDiscussionEventSource(
      discussionId,
      3,
      constructor
    ).subscribe(() => {});
    const first = FakeEventSource.instances[0];
    expect(first).toBeDefined();
    if (!first) return;

    first.emit(JSON.stringify(durableEvent()), '17');
    first.fail(FakeEventSource.CLOSED);
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    const second = FakeEventSource.instances[1];
    expect(second?.url).toContain('since=17');
    second?.fail(FakeEventSource.CLOSED);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(FakeEventSource.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);

    const third = FakeEventSource.instances[2];
    expect(third?.url).toContain('since=17');
    third?.fail(FakeEventSource.CLOSED);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(FakeEventSource.instances).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(4);

    unsubscribe();
  });
});
