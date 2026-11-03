import type { CSSProperties } from 'react';
import {
  type Participant,
  type Utterance
} from '@aps/shared';
import { Avatar } from '../ui/Avatar';

interface TranscriptItemProps {
  utterance: Utterance;
  participant?: Participant;
  isNew?: boolean;
}

export function TranscriptItem({
  utterance,
  participant,
  isNew = false
}: TranscriptItemProps) {
  const speaker = participant;
  const displayColor = speaker?.color ?? '#9AA3B2';

  return (
    <article
      className={`transcript-item${isNew ? ' is-new' : ''}`}
      style={{ '--speaker-color': displayColor } as CSSProperties}
      data-seq={utterance.seq}
    >
      <div className="transcript-item__meta">
        {speaker ? <Avatar participant={speaker} size="xs" /> : null}
        <strong>{speaker?.name ?? '未知嘉宾'}</strong>
        <span className="transcript-item__title">
          {speaker ? `${speaker.profession} · ${speaker.title}` : ''}
        </span>
        <span className="transcript-item__seq">#{utterance.seq}</span>
      </div>
      <p>{utterance.content}</p>
    </article>
  );
}
