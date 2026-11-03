import { describe, expect, it } from 'vitest';
import {
  isDurableEvent,
  StreamEventSchema
} from '@aps/shared';
import {
  createMockScript,
  snapshotAtFrame
} from './mockScript';
import { createDemoSnapshot } from './fixtures';

describe('mock discussion script', () => {
  it('contains a schema-valid full show with ordered durable events', () => {
    const snapshot = createDemoSnapshot();
    const frames = createMockScript(snapshot);
    const durableFrames = frames.filter((frame) =>
      isDurableEvent(frame.event)
    );
    const completed = frames.filter(
      (frame) => frame.event.type === 'utterance.completed'
    );
    const insightUpdates = frames.filter(
      (frame) => frame.event.type === 'insights.updated'
    );

    expect(completed.length).toBeGreaterThanOrEqual(12);
    expect(insightUpdates.length).toBeGreaterThanOrEqual(4);
    expect(durableFrames.map((frame) => frame.eventSeq)).toEqual(
      durableFrames.map((_, index) => index + 1)
    );
    for (const frame of frames) {
      expect(StreamEventSchema.safeParse(frame.event).success).toBe(true);
    }

    let latestUtteranceSeq = 0;
    for (const frame of frames) {
      if (frame.event.type === 'utterance.completed') {
        latestUtteranceSeq = frame.event.utterance.seq;
      } else if (frame.event.type === 'insights.updated') {
        for (const insight of frame.event.insights) {
          expect(insight.evidenceSeqs.every((seq) => seq <= latestUtteranceSeq))
            .toBe(true);
        }
      }
    }
  });

  it('reduces the complete show into the final replay snapshot', () => {
    const snapshot = createDemoSnapshot();
    const frames = createMockScript(snapshot);
    const ended = snapshotAtFrame(snapshot, frames, frames.length);

    expect(ended.discussion.status).toBe('ended');
    expect(ended.discussion.summary).toContain('感谢各位嘉宾');
    expect(ended.utterances.length).toBeGreaterThanOrEqual(12);
    expect(ended.liveUtterance).toBeNull();
    expect(
      ended.insights.find((insight) => insight.kind === 'divergence')?.status
    ).toBe('resolved');
  });
});
