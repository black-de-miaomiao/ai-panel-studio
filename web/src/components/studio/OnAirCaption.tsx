import type {
  DiscussionStatus,
  LiveUtterance,
  Participant
} from '@aps/shared';
import { Mic2, Radio } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

interface OnAirCaptionProps {
  liveUtterance: LiveUtterance | null;
  participants: Participant[];
  status: DiscussionStatus;
}

export function OnAirCaption({
  liveUtterance,
  participants,
  status
}: OnAirCaptionProps) {
  const isStopped = status === 'paused' || status === 'ended';
  const visibleUtterance = isStopped ? null : liveUtterance;
  const speaker = visibleUtterance
    ? participants.find(
        (participant) => participant.id === visibleUtterance.participantId
      )
    : undefined;
  const captionText =
    status === 'ended'
      ? '讨论已结束'
      : status === 'paused'
        ? '讨论已暂停'
        : visibleUtterance?.text || '等待下一位发言…';

  return (
    <section
      aria-label="直播字幕"
      aria-live="polite"
      className="on-air-caption"
      aria-atomic="false"
    >
      <div className="on-air-caption__label">
        <span className="on-air-caption__icon">
          {visibleUtterance ? <Mic2 size={15} /> : <Radio size={15} />}
        </span>
        <span>
          {visibleUtterance?.act === 'closing' ? '主持人总结' : '现场字幕'}
        </span>
      </div>
      {speaker ? (
        <div className="on-air-caption__speaker">
          <Avatar participant={speaker} size="sm" />
          <div>
            <strong style={{ color: speaker.color }}>{speaker.name}</strong>
            <span>{speaker.profession} · {speaker.title}</span>
          </div>
        </div>
      ) : null}
      <p
        className={
          visibleUtterance ? 'on-air-caption__text is-live' : 'on-air-caption__text'
        }
      >
        {captionText}
        {visibleUtterance ? (
          <span className="caption-cursor" aria-hidden="true" />
        ) : null}
      </p>
      <span className="on-air-caption__live-dot" aria-hidden="true" />
    </section>
  );
}
