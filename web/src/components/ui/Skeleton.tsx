import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'line' | 'circle' | 'card';
}

export function Skeleton({
  className,
  variant = 'line'
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx('skeleton', `skeleton--${variant}`, className)}
    />
  );
}
