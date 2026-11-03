import { useMemo } from 'react';
import { Check, Minus, Plus, Sparkles } from 'lucide-react';
import type { Insight, Participant } from '@aps/shared';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { InsightItem } from './InsightItem';

interface InsightsPanelProps {
  insights: Insight[];
  participants: Participant[];
  version: number;
  compact?: boolean;
}

export function InsightsPanel({
  insights,
  participants,
  version,
  compact = false
}: InsightsPanelProps) {
  const consensus = useMemo(
    () =>
      [...insights]
        .filter((insight) => insight.kind === 'consensus')
        .sort((left, right) => right.updatedAtSeq - left.updatedAtSeq),
    [insights]
  );
  const divergences = useMemo(
    () =>
      [...insights]
        .filter((insight) => insight.kind === 'divergence')
        .sort((left, right) => right.updatedAtSeq - left.updatedAtSeq),
    [insights]
  );

  const content = (
    <div className="insights-panel__columns">
      <section className="insight-group insight-group--consensus">
        <header className="insight-group__header">
          <span className="insight-group__icon">
            <Plus size={14} />
          </span>
          <div>
            <h3>正在形成的共识</h3>
            <span>CONSENSUS</span>
          </div>
          <strong>{consensus.length}</strong>
        </header>
        <div className="insight-group__items">
          {consensus.length ? (
            consensus.map((insight) => (
              <InsightItem
                insight={insight}
                key={insight.id}
                participants={participants}
                version={version}
              />
            ))
          ) : (
            <EmptyState
              title="共识正在浮现"
              description="专家观点出现交集后会整理在这里。"
              icon={<Check size={18} />}
            />
          )}
        </div>
      </section>
      <section className="insight-group insight-group--divergence">
        <header className="insight-group__header">
          <span className="insight-group__icon">
            <Minus size={14} />
          </span>
          <div>
            <h3>仍待讨论的分歧</h3>
            <span>OPEN QUESTIONS</span>
          </div>
          <strong>{divergences.length}</strong>
        </header>
        <div className="insight-group__items">
          {divergences.length ? (
            divergences.map((insight) => (
              <InsightItem
                insight={insight}
                key={insight.id}
                participants={participants}
                version={version}
              />
            ))
          ) : (
            <EmptyState
              title="暂时没有分歧"
              description="观点的不同侧面会在讨论中继续展开。"
              icon={<Sparkles size={18} />}
            />
          )}
        </div>
      </section>
    </div>
  );

  if (compact) {
    return (
      <section className="insights-panel insights-panel--compact">
        <div className="insights-panel__compact-heading">
          <span>洞察更新</span>
          <span>{consensus.length + divergences.length} 条</span>
        </div>
        {content}
      </section>
    );
  }

  return (
    <Panel
      title="观点交锋"
      eyebrow="LIVE INSIGHTS / 02"
      headingId="insights-title"
      className="insights-panel"
      bodyClassName="insights-panel__body"
    >
      {content}
    </Panel>
  );
}
