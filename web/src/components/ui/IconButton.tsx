import type {
  ButtonHTMLAttributes,
  ReactNode
} from 'react';
import clsx from 'clsx';

interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  children: ReactNode;
  tone?: 'neutral' | 'danger';
}

export function IconButton({
  label,
  children,
  tone = 'neutral',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={clsx('icon-button', `icon-button--${tone}`, className)}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
