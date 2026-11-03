import { ArrowLeft, Check, RefreshCw, UsersRound } from 'lucide-react';
import type { DiscussionSnapshot } from '@aps/shared';
import { HostCard } from './HostCard';
import { GuestCard } from './GuestCard';
import { Button } from '../ui/Button';

interface LineupReviewProps {
  snapshot: DiscussionSnapshot;
  busy?: boolean;
  error?: string | null;
  onRegenerate: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function LineupReview({
  snapshot,
  busy = false,
  error,
  onRegenerate,
  onRetry,
  retryLabel = '重试生成',
  onConfirm,
  onBack
}: LineupReviewProps) {
  const host = snapshot.participants.find(
    (participant) => participant.role === 'host'
  );
  const guests = snapshot.participants
    .filter((participant) => participant.role === 'expert')
    .sort((left, right) => left.seat - right.seat);

  return (
    <section className="lineup-review">
      <div className="lineup-review__heading">
        <div>
          <button className="back-link" onClick={onBack} type="button">
            <ArrowLeft size={16} />
            返回修改话题
          </button>
          <span className="section-kicker">
            <UsersRound size={14} />
            阵容确认 · {guests.length} 位专家
          </span>
          <h2>今晚的圆桌嘉宾</h2>
          <p className="lineup-review__topic">「{snapshot.discussion.topic}」</p>
        </div>
        <div className="lineup-review__actions">
          <Button
            disabled={busy}
            icon={<RefreshCw size={15} />}
            onClick={onRegenerate}
            type="button"
            variant="secondary"
          >
            换一批
          </Button>
          <Button
            icon={<Check size={16} />}
            onClick={onConfirm}
            type="button"
            variant="primary"
            disabled={
              busy ||
              snapshot.discussion.status !== 'lineup_ready' ||
              !host ||
              guests.length !== snapshot.discussion.expertCount
            }
          >
            确认阵容，进入演播厅
          </Button>
        </div>
      </div>

      {error ? (
        <div className="lineup-review__error" role="alert">
          <p>{error}</p>
          <Button
            disabled={busy}
            icon={<RefreshCw size={14} />}
            onClick={onRetry ?? onRegenerate}
            size="sm"
            type="button"
          >
            {retryLabel}
          </Button>
        </div>
      ) : null}

      {host ? <HostCard participant={host} /> : null}
      <div className="lineup-review__guest-grid">
        {guests.map((guest, index) => (
          <GuestCard index={index} key={guest.id} participant={guest} />
        ))}
      </div>
      <p className="lineup-review__footnote">
        嘉宾阵容由系统生成 · 专属颜色会贯穿字幕、实录与演播厅席位
      </p>
    </section>
  );
}
