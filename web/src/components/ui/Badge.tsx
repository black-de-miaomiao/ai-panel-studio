import type { ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone =
  | 'neutral'
  | 'live'
  | 'gold'
  | 'green'
  | 'orange'
  | 'muted'
  | 'blue';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  pulse?: boolean;
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  pulse = false
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'badge',
        `badge--${tone}`,
        pulse && 'badge--pulse',
        className
      )}
    >
      {pulse ? <span className="badge__pulse-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
