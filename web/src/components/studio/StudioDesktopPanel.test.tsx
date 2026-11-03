import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createShowcaseSnapshot } from '../../mocks/fixtures';
import { StudioDesktopPanel } from './StudioDesktopPanel';

afterEach(cleanup);

function renderDesktopPanel(status: 'live' | 'paused' | 'ended') {
  render(
    <StudioDesktopPanel
      insightsVersion={1}
      onBack={() => undefined}
      snapshot={createShowcaseSnapshot(43, status)}
    />
  );
}

describe('StudioDesktopPanel', () => {
  it('defaults to the host summary after the discussion ends', () => {
    renderDesktopPanel('ended');

    const summaryTab = screen.getByRole('tab', { name: /主持人总结/ });
    const tabPanel = screen.getByRole('tabpanel');

    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(summaryTab).toHaveAttribute(
      'aria-controls',
      'studio-desktop-review-panel-content'
    );
    expect(tabPanel).toHaveAttribute('aria-labelledby', summaryTab.id);
    expect(tabPanel).toHaveTextContent('本场圆桌已完成');
    expect(
      screen.queryByText('先从规则清晰、风险较低的问题开始试点。')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出实录（Markdown）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回大厅' })).toBeInTheDocument();
    expect(screen.getByTestId('studio-desktop-review-tab-insights')).toHaveTextContent(
      '2'
    );
  });

  it('shows insight entries when the insight tab is selected and keeps actions visible', () => {
    renderDesktopPanel('ended');

    const insightsTab = screen.getByRole('tab', { name: /共识与分歧/ });
    fireEvent.click(insightsTab);

    expect(insightsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('正在形成的共识')).toBeInTheDocument();
    expect(screen.getByText('仍待讨论的分歧')).toBeInTheDocument();
    expect(
      screen.getByText('先从规则清晰、风险较低的问题开始试点。')
    ).toBeInTheDocument();
    expect(
      screen.getByText('自动化效率是否足以抵消复杂问题中的信任风险？')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出实录（Markdown）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回大厅' })).toBeInTheDocument();
  });

  it('opens insights when a consensus count is activated', () => {
    renderDesktopPanel('ended');

    fireEvent.click(
      screen.getByRole('button', {
        name: '切换到共识与分歧：共识 1 条'
      })
    );

    expect(screen.getByRole('tab', { name: /共识与分歧/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('正在形成的共识')).toBeInTheDocument();
    expect(
      screen.getByText('先从规则清晰、风险较低的问题开始试点。')
    ).toBeInTheDocument();
  });

  it('supports arrow-key navigation between review tabs', async () => {
    renderDesktopPanel('ended');

    const summaryTab = screen.getByRole('tab', { name: /主持人总结/ });
    const insightsTab = screen.getByRole('tab', { name: /共识与分歧/ });
    fireEvent.keyDown(summaryTab, { key: 'ArrowRight' });

    expect(insightsTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(document.activeElement).toBe(insightsTab));
  });

  it.each(['live', 'paused'] as const)(
    'shows only the insight panel while the discussion is %s',
    (status) => {
      renderDesktopPanel(status);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByText('正在形成的共识')).toBeInTheDocument();
      expect(screen.getByText('仍待讨论的分歧')).toBeInTheDocument();
    }
  );
});
