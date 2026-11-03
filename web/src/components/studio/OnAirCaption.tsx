import type { Participant, LiveUtterance } from '@aps/shared';
import { Mic2, Radio } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

interface OnAirCaptionProps {
  liveUtterance: LiveUtterance | null;
  participants: Participant[];
}

export function OnAirCaption({
  liveUtterance,
  participants
}: OnAirCaptionProps) {
  const speaker = liveUtterance
    ? participants.find(
        (participant) => participant.id === liveUtterance.participantId
      )
    : undefined;

  return (
    <section
      aria-label="直播字幕"
      aria-live="polite"
      className="on-air-caption"
      aria-atomic="false"
    >
      <div className="on-air-caption__label">
        <span className="on-air-caption__icon">
          {liveUtterance ? <Mic2 size={15} /> : <Radio size={15} />}
        </span>
        <span>{liveUtterance?.act === 'closing' ? '主持人总结' : '现场字幕'}</span>
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
      <p className={liveUtterance ? 'on-air-caption__text is-live' : 'on-air-caption__text'}>
        {liveUtterance?.text || '等待下一位发言…'}
        {liveUtterance ? (
          <span className="caption-cursor" aria-hidden="true" />
        ) : null}
      </p>
      <span className="on-air-caption__live-dot" aria-hidden="true" />
    </section>
  );
}
