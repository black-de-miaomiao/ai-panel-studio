import type { Participant } from '@aps/shared';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';

interface HostCardProps {
  participant: Participant;
}

export function HostCard({ participant }: HostCardProps) {
  return (
    <article className="host-lineup-card">
      <div className="host-lineup-card__mark">
        <span className="host-lineup-card__signal" aria-hidden="true" />
        HOST / 00
      </div>
      <div className="host-lineup-card__identity">
        <Avatar participant={participant} size="lg" />
        <div>
          <h3>{participant.name}</h3>
          <p>{participant.profession} · {participant.title}</p>
        </div>
        <Badge tone="gold">{participant.stanceTag}</Badge>
      </div>
      <p className="host-lineup-card__stance">{participant.stance}</p>
      <span className="host-lineup-card__note">负责串联观点与收束讨论</span>
    </article>
  );
}
