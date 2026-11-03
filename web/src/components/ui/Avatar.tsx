import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { ParticipantBrief } from '@aps/shared';

interface AvatarProps {
  participant: Pick<ParticipantBrief, 'avatar' | 'color' | 'name' | 'role'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({
  participant,
  size = 'md',
  className
}: AvatarProps) {
  return (
    <span
      aria-label={participant.name}
      className={clsx(
        'avatar',
        `avatar--${size}`,
        participant.role === 'host' && 'avatar--host',
        className
      )}
      role="img"
      style={{ '--avatar-color': participant.color } as CSSProperties}
    >
      <span>{participant.avatar || participant.name.slice(0, 1)}</span>
    </span>
  );
}
