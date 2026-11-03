import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@aps/shared';
import { TranscriptPanel } from '../components/studio/TranscriptPanel';
import { createShowcaseSnapshot } from '../mocks/fixtures';
import type { DiscussionEventSource } from './eventSource';
import { useDiscussion } from './useDiscussion';

describe('useDiscussion snapshot and SSE integration', () => {
  it('does not duplicate a transcript item replayed with the snapshot', async () => {
    const snapshot = createShowcaseSnapshot(91, 'live');
    const existing = snapshot.utterances[0];
    expect(existing).toBeDefined();
    if (!existing) return;

    const replayedEvent: StreamEvent = {
      type: 'utterance.completed',
      discussionId: snapshot.discussion.id,
      at: existing.createdAt,
      utterance: existing
    };
    const eventSource: DiscussionEventSource = {
      subscribe(onEvent) {
        onEvent(replayedEvent, snapshot.lastEventSeq);
        return () => {};
      }
    };

    function Harness() {
      const { state } = useDiscussion(snapshot, eventSource, true);
      return (
        <TranscriptPanel
          participants={state.participants}
          utterances={state.utterances}
        />
      );
    }

    render(<Harness />);

    expect(await screen.findByText(existing.content)).toBeInTheDocument();
    expect(screen.getAllByText(existing.content)).toHaveLength(1);
    expect(document.querySelectorAll(`[data-seq="${existing.seq}"]`)).toHaveLength(
      1
    );
  });
});
