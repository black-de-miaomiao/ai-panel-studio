import { useEffect, useState } from 'react';
import { ArrowDownToLine, CheckCheck, FileText } from 'lucide-react';
import type { DiscussionSnapshot } from '@aps/shared';
import { exportMarkdown } from '../../lib/exportMarkdown';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface SummaryPanelProps {
  snapshot: DiscussionSnapshot;
  liveSummary?: string;
  onBack?: () => void;
  onShowInsights?: () => void;
  compact?: boolean;
  hideFooter?: boolean;
}

function downloadMarkdown(snapshot: DiscussionSnapshot) {
  const markdown = exportMarkdown(snapshot);
  const blob = new Blob([markdown], {
    type: 'text/markdown;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeTitle = snapshot.discussion.topic
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 40);
  anchor.href = url;
  anchor.download = `${safeTitle || '圆桌讨论'}-实录.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

interface SummaryStatProps {
  label: string;
  count: number;
  tone?: 'consensus' | 'divergence';
  onClick?: () => void;
  ariaLabel?: string;
}

function SummaryStat({
  label,
  count,
  tone,
  onClick,
  ariaLabel
}: SummaryStatProps) {
  const className = [
    'summary-stat',
    tone ? `summary-stat--${tone}` : '',
    onClick ? 'summary-stat--button' : ''
  ].filter(Boolean).join(' ');
  const content = (
    <>
      <span>{label}</span>
      <strong>{count}</strong>
      <small>条</small>
    </>
  );

  return onClick ? (
    <button
      aria-label={ariaLabel}
      className={className}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function SummaryPanelFooter({
  snapshot,
  onBack,
  onShowInsights
}: {
  snapshot: DiscussionSnapshot;
  onBack?: () => void;
  onShowInsights?: () => void;
}) {
  const consensusCount = snapshot.insights.filter(
    (insight) => insight.kind === 'consensus'
  ).length;
  const divergenceCount = snapshot.insights.filter(
    (insight) => insight.kind === 'divergence'
  ).length;

  return (
    <div className="summary-panel__footer">
      <div className="summary-panel__stats">
        <SummaryStat
          ariaLabel={`切换到共识与分歧：共识 ${consensusCount} 条`}
          count={consensusCount}
          label="共识"
          onClick={onShowInsights}
          tone="consensus"
        />
        <SummaryStat
          ariaLabel={`切换到共识与分歧：分歧 ${divergenceCount} 条`}
          count={divergenceCount}
          label="分歧"
          onClick={onShowInsights}
          tone="divergence"
        />
        <SummaryStat
          count={snapshot.utterances.length}
          label="实录"
        />
      </div>
      <div className="summary-panel__actions">
        <Button
          icon={<ArrowDownToLine size={15} />}
          onClick={() => downloadMarkdown(snapshot)}
          size="sm"
          variant="primary"
        >
          导出实录（Markdown）
        </Button>
        {onBack ? (
          <Button onClick={onBack} size="sm" variant="secondary">
            返回大厅
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SummaryPanel({
  snapshot,
  liveSummary = '',
  onBack,
  onShowInsights,
  compact = false,
  hideFooter = false
}: SummaryPanelProps) {
  const [revealed, setRevealed] = useState(false);
  const { discussion } = snapshot;
  const { status, summary } = discussion;
  const isEnded = status === 'ended';
  const currentSummary = summary?.trim() ?? '';
  const paragraphs = currentSummary
    ? currentSummary.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
    : [];
  const liveParagraphs = liveSummary
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  useEffect(() => {
    if (!isEnded || revealed || !currentSummary) return;
    const timer = window.setTimeout(() => setRevealed(true), 520);
    return () => window.clearTimeout(timer);
  }, [currentSummary, isEnded, revealed]);

  const content = (
    <div className="summary-panel__content">
      {isEnded ? (
        <>
          <div className="summary-panel__result-line">
            <span className="summary-panel__result-mark">
              <CheckCheck size={15} />
            </span>
            <span>本场圆桌已完成</span>
            <Badge tone="muted">主持人总结</Badge>
          </div>
          {paragraphs.length ? (
            <div
              className={`summary-panel__paragraphs${revealed ? ' is-revealed' : ''}`}
              aria-live="polite"
            >
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 14)}`}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="summary-panel__placeholder">
              总结已完成，主持人正在整理本场讨论的关键观点。
            </p>
          )}
          {!hideFooter ? (
            <SummaryPanelFooter
              onBack={onBack}
              onShowInsights={onShowInsights}
              snapshot={snapshot}
            />
          ) : null}
        </>
      ) : (
        <div className="summary-panel__live">
          <span className="summary-panel__live-kicker">
            <span className="processing-dot" aria-hidden="true" />
            主持人正在收束观点
          </span>
          <div className="summary-panel__stream" aria-live="polite">
            {liveParagraphs.length ? (
              liveParagraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 14)}`}>{paragraph}</p>
              ))
            ) : (
              <p>正在整理本场圆桌的共识、分歧与下一步……</p>
            )}
            <span className="caption-cursor" aria-hidden="true" />
          </div>
          <div className="summary-panel__live-meta">
            <FileText size={14} />
            以已完成发言和实时洞察为依据
          </div>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <section className="summary-panel summary-panel--compact">
        <div className="summary-panel__compact-heading">
          <span>主持人总结</span>
          <span>{isEnded ? '已完成' : '收束中'}</span>
        </div>
        {content}
      </section>
    );
  }

  return (
    <section className="summary-panel">
      <header className="summary-panel__heading">
        <div>
          <span className="panel__eyebrow">HOST RECAP / 03</span>
          <h2>{isEnded ? '本场收束' : '主持人总结'}</h2>
        </div>
        <span className="summary-panel__heading-mark" aria-hidden="true">
          <FileText size={17} />
        </span>
      </header>
      {content}
    </section>
  );
}
