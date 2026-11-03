import { useEffect, useState } from 'react';
import type { DiscussionSnapshot, DiscussionStatus } from '@aps/shared';
import { InsightsPanel } from './InsightsPanel';
import { SummaryPanel, SummaryPanelFooter } from './SummaryPanel';
import { Tabs } from '../ui/Tabs';

type ReviewTab = 'summary' | 'insights';

interface StudioDesktopPanelProps {
  snapshot: DiscussionSnapshot;
  liveSummary?: string;
  insightsVersion: number;
  onBack: () => void;
}

export function StudioDesktopPanel({
  snapshot,
  liveSummary,
  insightsVersion,
  onBack
}: StudioDesktopPanelProps) {
  const status = snapshot.discussion.status;
  const [selection, setSelection] = useState<{
    status: DiscussionStatus;
    tab: ReviewTab;
  }>({ status, tab: 'summary' });
  const activeTab = selection.status === status ? selection.tab : 'summary';
  const isReviewStatus = status === 'summarizing' || status === 'ended';

  useEffect(() => {
    if (selection.status !== status) {
      setSelection({ status, tab: 'summary' });
    }
  }, [selection.status, status]);

  const selectTab = (key: string) => {
    if (key === 'summary' || key === 'insights') {
      setSelection({ status, tab: key });
    }
  };

  return (
    <aside aria-label="演播厅总结与洞察" className="studio-insights-desktop">
      {isReviewStatus ? (
        <section className="studio-desktop-review-panel">
          <Tabs
            ariaLabel="演播厅回放内容"
            className="studio-desktop-review-panel__tabs"
            compact
            items={[
              {
                key: 'summary',
                label: '主持人总结',
                count: status === 'ended' ? 1 : 0
              },
              {
                key: 'insights',
                label: '共识与分歧',
                count: snapshot.insights.length
              }
            ]}
            activeKey={activeTab}
            onChange={selectTab}
            panelId="studio-desktop-review-panel-content"
            testIdPrefix="studio-desktop-review-tab"
          />
          <div
            aria-labelledby={`studio-desktop-review-tab-${activeTab}`}
            className="studio-desktop-review-panel__tabpanel"
            id="studio-desktop-review-panel-content"
            role="tabpanel"
            tabIndex={0}
          >
            {activeTab === 'summary' ? (
              <SummaryPanel
                hideFooter
                liveSummary={liveSummary}
                snapshot={snapshot}
              />
            ) : (
              <InsightsPanel
                insights={snapshot.insights}
                participants={snapshot.participants}
                version={insightsVersion}
              />
            )}
          </div>
          <div className="studio-desktop-review-panel__footer">
            <SummaryPanelFooter
              onBack={onBack}
              onShowInsights={() => selectTab('insights')}
              snapshot={snapshot}
            />
          </div>
        </section>
      ) : (
        <InsightsPanel
          insights={snapshot.insights}
          participants={snapshot.participants}
          version={insightsVersion}
        />
      )}
    </aside>
  );
}
