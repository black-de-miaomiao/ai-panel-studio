import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Insight, Participant } from '@aps/shared';

interface InsightItemProps {
  insight: Insight;
  participants: Participant[];
  version: number;
}

export function InsightItem({
  insight,
  participants,
  version
}: InsightItemProps) {
  const [highlight, setHighlight] = useState(false);
  const isConsensus = insight.kind === 'consensus';

  useEffect(() => {
    if (version === 0) return;
    setHighlight(true);
    const timer = window.setTimeout(() => setHighlight(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [version]);

  const participantById = new Map(
    participants.map((participant) => [participant.id, participant])
  );

  return (
    <article
      className={[
        'insight-item',
        isConsensus ? 'insight-item--consensus' : 'insight-item--divergence',
        insight.status === 'resolved' && 'is-resolved',
        highlight && 'is-highlighted'
      ]
        .filter(Boolean)
        .join(' ')}
      data-insight-id={insight.id}
    >
      <div className="insight-item__top">
        <span className="insight-item__indicator" aria-hidden="true" />
        {insight.status === 'resolved' ? (
          <span className="insight-item__resolved">已化解</span>
        ) : null}
      </div>
      <p className="insight-item__content">{insight.content}</p>
      <div className="insight-item__stances">
        {insight.stances.map((stance) => {
          const participant = participantById.get(stance.participantId);
          return (
            <span
              className="insight-stance"
              key={stance.participantId}
              style={
                {
                  '--stance-color': participant?.color ?? '#9AA3B2'
                } as CSSProperties
              }
            >
              <span className="insight-stance__name">
                <i aria-hidden="true" />
                {participant?.name ?? '嘉宾'}
              </span>
              <span>{stance.position}</span>
            </span>
          );
        })}
      </div>
      <span className="insight-item__evidence">
        依据发言 {insight.evidenceSeqs.map((seq) => `#${seq}`).join(' · ')}
      </span>
    </article>
  );
}
