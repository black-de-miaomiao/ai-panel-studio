import type { CSSProperties } from 'react';
import type { Participant } from '@aps/shared';
import { AGENT_STATE_LABELS } from '@aps/shared';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

interface HostSeatProps {
  host: Participant;
  isSpeaking: boolean;
}

export function HostSeat({ host, isSpeaking }: HostSeatProps) {
  return (
    <article
      className={`host-seat${isSpeaking ? ' is-speaking' : ''}`}
      data-state={isSpeaking ? 'speaking' : 'idle'}
      style={{ '--seat-color': host.color } as CSSProperties}
    >
      <span className="host-seat__overline">
        <span aria-hidden="true" />
        主持席 · 00
      </span>
      <Avatar participant={host} size="lg" />
      <h3>{host.name}</h3>
      <p className="host-seat__title">{host.profession} · {host.title}</p>
      <div className="host-seat__tags">
        <Badge tone="gold">{host.stanceTag}</Badge>
        <Badge tone={isSpeaking ? 'gold' : 'muted'}>
          {isSpeaking ? '正在串联' : AGENT_STATE_LABELS[host.agentState]}
        </Badge>
      </div>
      {isSpeaking ? (
        <span className="host-seat__waves" aria-label="主持人正在发言">
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </article>
  );
}
