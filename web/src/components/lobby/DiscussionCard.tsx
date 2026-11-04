import { ArrowUpRight, Clock3, Eye, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router';
import {
  STATUS_LABELS,
  type DiscussionListItem
} from '@aps/shared';
import { formatRound, formatTimeAgo } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

interface DiscussionCardProps {
  discussion: DiscussionListItem;
}

function statusTone(status: DiscussionListItem['status']) {
  if (status === 'live') return 'live';
  if (status === 'paused') return 'orange';
  if (status === 'ended') return 'muted';
  if (status === 'failed') return 'orange';
  if (status === 'summarizing') return 'gold';
  return 'neutral';
}

export function DiscussionCard({ discussion }: DiscussionCardProps) {
  const isReplay = discussion.status === 'ended';
  const action = isReplay ? '观看回放' : '进入演播厅';
  return (
    <article className="discussion-card" data-testid="discussion-card">
      <div className="discussion-card__topline">
        <Badge
          pulse={discussion.status === 'live'}
          tone={statusTone(discussion.status)}
        >
          {discussion.status === 'live' ? 'LIVE' : STATUS_LABELS[discussion.status]}
        </Badge>
        <span className="discussion-card__updated">
          <Clock3 size={13} aria-hidden="true" />
          {formatTimeAgo(discussion.updatedAt)}
        </span>
      </div>

      <h3 className="discussion-card__topic" title={discussion.topic}>
        {discussion.topic}
      </h3>

      <div className="discussion-card__participants">
        <div className="avatar-stack" aria-label={`${discussion.expertCount} 位专家与主持人`}>
          {discussion.participants.slice(0, 5).map((participant) => (
            <Avatar
              key={participant.id}
              participant={participant}
              size="sm"
              className="avatar-stack__item"
            />
          ))}
          {discussion.participants.length > 5 ? (
            <span className="avatar-stack__more">
              +{discussion.participants.length - 5}
            </span>
          ) : null}
        </div>
        <span className="discussion-card__guest-count">
          {discussion.expertCount} 位专家
        </span>
      </div>

      <div className="discussion-card__metrics">
        <span>
          <span className="metric-dot metric-dot--round" aria-hidden="true" />
          {formatRound(discussion.turnCount, discussion.maxTurns)}
        </span>
        <span>
          <Eye size={14} aria-hidden="true" />
          {discussion.viewerCount.toLocaleString('zh-CN')}
        </span>
        <span>
          <MessageSquareText size={14} aria-hidden="true" />
          {discussion.utteranceCount}
        </span>
      </div>

      <div className="discussion-card__latest">
        {discussion.latestUtterance ? (
          <>
            <span className="discussion-card__latest-speaker">
              {discussion.latestUtterance.speakerName}
            </span>
            <p>{discussion.latestUtterance.content}</p>
          </>
        ) : (
          <p className="discussion-card__latest-empty">主持人与专家正在候场</p>
        )}
      </div>

      <Link
        aria-label={`${action}：${discussion.topic}`}
        className="discussion-card__action"
        to={`/studio/${discussion.id}`}
      >
        <span>{action}</span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </article>
  );
}
