import type { ReactNode } from 'react';
import clsx from 'clsx';

interface PanelProps {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  headingId?: string;
}

export function Panel({
  children,
  title,
  eyebrow,
  actions,
  className,
  bodyClassName,
  headingId
}: PanelProps) {
  return (
    <section
      className={clsx('panel', className)}
      aria-labelledby={title ? headingId : undefined}
    >
      {title || eyebrow || actions ? (
        <header className="panel__header">
          <div className="panel__heading">
            {eyebrow ? <span className="panel__eyebrow">{eyebrow}</span> : null}
            {title ? (
              <h2 id={headingId} className="panel__title">
                {title}
              </h2>
            ) : null}
          </div>
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={clsx('panel__body', bodyClassName)}>{children}</div>
    </section>
  );
}
