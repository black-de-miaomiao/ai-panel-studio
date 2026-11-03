import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { ArrowDown, FileText } from 'lucide-react';
import type { Participant, Utterance } from '@aps/shared';
import { EmptyState } from '../ui/EmptyState';
import { TranscriptItem } from './TranscriptItem';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';

interface TranscriptPanelProps {
  utterances: Utterance[];
  participants: Participant[];
  compact?: boolean;
}

export function TranscriptPanel({
  utterances,
  participants,
  compact = false
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeqRef = useRef(0);
  const [hasNew, setHasNew] = useState(false);
  const [newSeqs, setNewSeqs] = useState<number[]>([]);
  const ordered = useMemo(
    () => [...utterances].sort((left, right) => left.seq - right.seq),
    [utterances]
  );
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || ordered.length === 0) return;
    const latestSeq = ordered[ordered.length - 1]?.seq ?? 0;
    if (latestSeq <= lastSeqRef.current) return;

    const isFirstPaint = lastSeqRef.current === 0;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 96;
    const appended = ordered
      .filter((utterance) => utterance.seq > lastSeqRef.current)
      .map((utterance) => utterance.seq);
    lastSeqRef.current = latestSeq;

    if (isFirstPaint || nearBottom) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
      setHasNew(false);
    } else {
      setHasNew(true);
    }
    setNewSeqs((current) => [...new Set([...current, ...appended])]);
    const timer = window.setTimeout(() => {
      setNewSeqs((current) => current.filter((seq) => !appended.includes(seq)));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [ordered]);

  const body = (
    <div className="transcript-panel__content-wrap">
      <div
        className="transcript-panel__content"
        ref={containerRef}
        onScroll={() => {
          const container = containerRef.current;
          if (!container) return;
          const nearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 80;
          if (nearBottom) setHasNew(false);
        }}
        role="log"
        aria-label="已完成的现场发言"
        aria-relevant="additions"
      >
        {ordered.length > 0 ? (
          ordered.map((utterance) => (
            <TranscriptItem
              isNew={newSeqs.includes(utterance.seq)}
              key={utterance.id}
              participant={participantById.get(utterance.participantId)}
              utterance={utterance}
            />
          ))
        ) : (
          <EmptyState
            title="舞台正在暖场"
            description="已完成的发言会按顺序出现在这里。"
            icon={<FileText size={20} />}
          />
        )}
      </div>
      {hasNew ? (
        <button
          className="transcript-new-pill"
          onClick={() => {
            const container = containerRef.current;
            if (container) {
              container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
              });
            }
            setHasNew(false);
          }}
          type="button"
        >
          有新发言
          <ArrowDown size={14} />
        </button>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <section className="transcript-panel transcript-panel--compact">
        <div className="transcript-panel__compact-heading">
          <span>按时间排序</span>
          <span>{ordered.length} 条</span>
        </div>
        {body}
      </section>
    );
  }

  return (
    <Panel
      title="现场实录"
      eyebrow="TRANSCRIPT / 01"
      headingId="transcript-title"
      className="transcript-panel"
      bodyClassName="transcript-panel__body"
      actions={
        <IconButton label="现场实录按序排列" disabled>
          <FileText size={15} />
        </IconButton>
      }
    >
      <div className="transcript-panel__count">
        <span className="metric-dot metric-dot--round" aria-hidden="true" />
        {ordered.length.toLocaleString('zh-CN')} 条发言
      </div>
      {body}
    </Panel>
  );
}
