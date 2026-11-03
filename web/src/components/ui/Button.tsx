import type {
  ButtonHTMLAttributes,
  ReactNode
} from 'react';
import clsx from 'clsx';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx('button', `button--${variant}`, `button--${size}`, className)}
      {...props}
    >
      {icon ? <span className="button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
