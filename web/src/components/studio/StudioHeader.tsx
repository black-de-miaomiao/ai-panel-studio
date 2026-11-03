import { useState } from 'react';
import {
  ArrowLeft,
  CircleStop,
  Pause,
  Play,
  RotateCcw
} from 'lucide-react';
import {
  STATUS_LABELS,
  type DiscussionStatus
} from '@aps/shared';
import type { DiscussionState } from '../../state/discussionReducer';
import type { ConnectionStatus } from '../../state/eventSource';
import { formatRound } from '../../lib/format';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ConnectionBadge } from './ConnectionBadge';

interface StudioHeaderProps {
  state: DiscussionState;
  connection: ConnectionStatus;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => Promise<void>;
}

function statusTone(status: DiscussionStatus) {
  if (status === 'live') return 'live';
  if (status === 'paused' || status === 'failed') return 'orange';
  if (status === 'summarizing') return 'gold';
  if (status === 'ended') return 'muted';
  return 'neutral';
}

export function StudioHeader({
  state,
  connection,
  onBack,
  onStart,
  onPause,
  onResume,
  onEnd
}: StudioHeaderProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const { discussion } = state;

  const endDiscussion = async () => {
    setEnding(true);
    try {
      await onEnd();
      setConfirmOpen(false);
    } finally {
      setEnding(false);
    }
  };

  return (
    <>
      <header className="studio-header">
        <div className="studio-header__identity">
          <button
            aria-label="返回大厅"
            className="studio-back-button"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={17} />
            <span>大厅</span>
          </button>
          <span className="studio-header__divider" aria-hidden="true" />
          <Badge
            pulse={discussion.status === 'live'}
            tone={statusTone(discussion.status)}
            className="studio-header__status"
          >
            {discussion.status === 'live' ? 'LIVE' : STATUS_LABELS[discussion.status]}
          </Badge>
          <h1 className="studio-header__topic" title={discussion.topic}>
            {discussion.topic}
          </h1>
        </div>

        <div className="studio-header__telemetry">
          <div className="studio-round">
            <span className="studio-round__value">
              {formatRound(discussion.turnCount, discussion.maxTurns)}
            </span>
            <span
              aria-label={`已完成 ${discussion.turnCount} / ${discussion.maxTurns} 轮`}
              className="studio-round__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={discussion.maxTurns}
              aria-valuenow={Math.min(discussion.turnCount, discussion.maxTurns)}
            >
              <span
                style={{
                  width: `${Math.min(100, (discussion.turnCount / discussion.maxTurns) * 100)}%`
                }}
              />
            </span>
          </div>
          <span className="studio-viewers">
            <span className="studio-viewers__dot" aria-hidden="true" />
            {state.viewerCount.toLocaleString('zh-CN')} 位观众
          </span>
          <ConnectionBadge status={connection} />
        </div>

        <div className="studio-header__controls">
          {discussion.status === 'lineup_ready' ? (
            <Button
              icon={<Play size={15} />}
              onClick={onStart}
              size="sm"
              variant="primary"
            >
              开始直播
            </Button>
          ) : null}
          {discussion.status === 'live' ? (
            <>
              <Button
                icon={<Pause size={15} />}
                onClick={onPause}
                size="sm"
                variant="secondary"
              >
                暂停
              </Button>
              <Button
                icon={<CircleStop size={15} />}
                onClick={() => setConfirmOpen(true)}
                size="sm"
                variant="danger"
              >
                结束讨论
              </Button>
            </>
          ) : null}
          {discussion.status === 'paused' ? (
            <>
              <Button
                icon={<RotateCcw size={15} />}
                onClick={onResume}
                size="sm"
                variant="primary"
              >
                继续
              </Button>
              <Button
                icon={<CircleStop size={15} />}
                onClick={() => setConfirmOpen(true)}
                size="sm"
                variant="danger"
              >
                结束讨论
              </Button>
            </>
          ) : null}
          {discussion.status === 'summarizing' ? (
            <span className="studio-header__processing">
              <span className="processing-dot" aria-hidden="true" />
              主持人正在收束观点
            </span>
          ) : null}
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        busy={ending}
        title="结束这场讨论？"
        description="当前发言结束后，演播厅将进入主持人总结。结束后仍可回看并导出实录。"
        confirmLabel="结束并生成总结"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void endDiscussion()}
      />
    </>
  );
}
