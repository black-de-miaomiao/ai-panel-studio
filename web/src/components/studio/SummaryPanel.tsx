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
  compact?: boolean;
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

export function SummaryPanel({
  snapshot,
  liveSummary = '',
  onBack,
  compact = false
}: SummaryPanelProps) {
  const [revealed, setRevealed] = useState(false);
  const { discussion, participants, insights, utterances } = snapshot;
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

  const consensusCount = insights.filter(
    (insight) => insight.kind === 'consensus'
  ).length;
  const divergenceCount = insights.filter(
    (insight) => insight.kind === 'divergence'
  ).length;

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
          <div className="summary-panel__stats">
            <div className="summary-stat summary-stat--consensus">
              <span>共识</span>
              <strong>{consensusCount}</strong>
              <small>条</small>
            </div>
            <div className="summary-stat summary-stat--divergence">
              <span>分歧</span>
              <strong>{divergenceCount}</strong>
              <small>条</small>
            </div>
            <div className="summary-stat">
              <span>实录</span>
              <strong>{utterances.length}</strong>
              <small>条</small>
            </div>
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
