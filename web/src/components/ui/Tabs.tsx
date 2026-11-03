import clsx from 'clsx';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
  ariaLabel: string;
  testIdPrefix?: string;
  compact?: boolean;
}

export function Tabs({
  items,
  activeKey,
  onChange,
  className,
  ariaLabel,
  testIdPrefix,
  compact = false
}: TabsProps) {
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey)
  );

  return (
    <div
      aria-label={ariaLabel}
      className={clsx('tabs', compact && 'tabs--compact', className)}
      role="tablist"
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          return;
        }
        event.preventDefault();
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + items.length) %
                items.length;
        const nextItem = items[nextIndex];
        if (nextItem) {
          onChange(nextItem.key);
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(`[data-tab-key="${nextItem.key}"]`)
              ?.focus();
          });
        }
      }}
    >
      {items.map((item) => (
        <button
          aria-selected={item.key === activeKey}
          className={clsx(
            'tabs__item',
            item.key === activeKey && 'is-active'
          )}
          data-tab-key={item.key}
          data-testid={testIdPrefix ? `${testIdPrefix}-${item.key}` : item.key}
          id={testIdPrefix ? `${testIdPrefix}-${item.key}` : undefined}
          key={item.key}
          onClick={() => onChange(item.key)}
          role="tab"
          tabIndex={item.key === activeKey ? 0 : -1}
          type="button"
        >
          <span>{item.label}</span>
          {item.count !== undefined ? (
            <span className="tabs__count">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
