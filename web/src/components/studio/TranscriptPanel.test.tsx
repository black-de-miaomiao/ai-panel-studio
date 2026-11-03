import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createShowcaseSnapshot } from '../../mocks/fixtures';
import { TranscriptPanel } from './TranscriptPanel';

describe('TranscriptPanel', () => {
  it('renders completed utterances in seq order and not the live internal state', () => {
    const snapshot = createShowcaseSnapshot(42, 'live');
    const reversed = [...snapshot.utterances].reverse();
    render(
      <TranscriptPanel
        participants={snapshot.participants}
        utterances={reversed}
      />
    );

    const transcript = screen.getByRole('log', { name: '已完成的现场发言' });
    const entries = transcript.querySelectorAll('[data-seq]');
    expect([...entries].map((entry) => entry.getAttribute('data-seq'))).toEqual([
      '1',
      '2',
      '3'
    ]);
    expect(screen.queryByText('举手')).not.toBeInTheDocument();
    expect(screen.queryByText('我想把人工升级的触发条件也放进试点设计…')).not.toBeInTheDocument();
  });
});
