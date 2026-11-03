import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiscussionStatus, Participant } from '@aps/shared';
import { createShowcaseSnapshot } from '../../mocks/fixtures';
import { ExpertStatusWindow } from './ExpertStatusWindow';

afterEach(cleanup);

function makeExpert(overrides: Partial<Participant> = {}): Participant {
  const expert = createShowcaseSnapshot(43, 'live').participants.find(
    (participant) => participant.role === 'expert'
  );
  if (!expert) throw new Error('Expected an expert in the showcase snapshot.');

  return {
    ...expert,
    agentState: 'idle',
    agentIntent: null,
    focus: null,
    ...overrides
  };
}

function renderExpertWindow({
  discussionStatus = 'live',
  isSpeaking = false,
  participant = makeExpert()
}: {
  discussionStatus?: DiscussionStatus;
  isSpeaking?: boolean;
  participant?: Participant;
} = {}) {
  render(
    <ExpertStatusWindow
      discussionStatus={discussionStatus}
      isSpeaking={isSpeaking}
      participant={participant}
    />
  );
}

describe('ExpertStatusWindow', () => {
  it('shows the listening placeholder only for an idle expert in a live discussion', () => {
    renderExpertWindow();
    expect(screen.getByText('关注点：')).toBeInTheDocument();
    expect(screen.getByText('正在聆听')).toBeInTheDocument();
  });

  it('shows the speaking status when a live speaker has no public focus', () => {
    renderExpertWindow({ isSpeaking: true });
    expect(screen.getByText('关注点：')).toBeInTheDocument();
    expect(screen.getByText('正在发言')).toBeInTheDocument();
    expect(screen.queryByText('正在聆听')).not.toBeInTheDocument();
  });

  it('does not show a listening placeholder for a preparing expert', () => {
    renderExpertWindow({
      participant: makeExpert({ agentState: 'preparing', agentIntent: 'raise_hand' })
    });
    expect(screen.queryByText('关注点：')).not.toBeInTheDocument();
    expect(screen.queryByText('正在聆听')).not.toBeInTheDocument();
  });

  it.each(['paused', 'ended', 'summarizing'] as const)(
    'hides an empty focus row while the discussion is %s',
    (discussionStatus) => {
      renderExpertWindow({ discussionStatus });
      expect(screen.queryByText('关注点：')).not.toBeInTheDocument();
      expect(screen.queryByText('正在聆听')).not.toBeInTheDocument();
      expect(screen.queryByText('正在发言')).not.toBeInTheDocument();
    }
  );

  it('keeps the last public focus visible after the discussion ends', () => {
    renderExpertWindow({
      discussionStatus: 'ended',
      participant: makeExpert({ focus: '核对自动化边界与人工责任' })
    });
    expect(screen.getByText('关注点：')).toBeInTheDocument();
    expect(screen.getByText('核对自动化边界与人工责任')).toBeInTheDocument();
  });

  it('prefers a public focus over the speaking placeholder', () => {
    renderExpertWindow({
      isSpeaking: true,
      participant: makeExpert({ focus: '确认下一步交接条件' })
    });
    expect(screen.getByText('确认下一步交接条件')).toBeInTheDocument();
    expect(screen.queryByText('正在发言')).not.toBeInTheDocument();
  });
});
