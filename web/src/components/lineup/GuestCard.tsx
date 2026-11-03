import type { CSSProperties } from 'react';
import type { Participant } from '@aps/shared';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

interface GuestCardProps {
  participant: Participant;
  index?: number;
}

export function GuestCard({
  participant,
  index
}: GuestCardProps) {
  return (
    <article
      className="lineup-person-card guest-card"
      style={{ '--seat-color': participant.color } as CSSProperties}
    >
      <div className="lineup-person-card__top">
        <span className="lineup-person-card__seat">
          {index !== undefined ? `席位 0${index + 1}` : `席位 0${participant.seat}`}
        </span>
        <Badge tone="neutral">{participant.stanceTag}</Badge>
      </div>
      <div className="lineup-person-card__identity">
        <Avatar participant={participant} size="lg" />
        <div>
          <h3>{participant.name}</h3>
          <p>{participant.profession} · {participant.title}</p>
        </div>
      </div>
      <blockquote>{participant.stance}</blockquote>
      <div className="lineup-person-card__color">
        <span aria-hidden="true" />
        专属席位色
      </div>
    </article>
  );
}
