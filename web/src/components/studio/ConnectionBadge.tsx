import type { ConnectionStatus } from '../../state/eventSource';

const LABELS: Record<ConnectionStatus, string> = {
  connecting: '正在连接',
  open: '连接正常',
  reconnecting: '正在重连',
  closed: '连接已关闭'
};

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

export function ConnectionBadge({ status }: ConnectionBadgeProps) {
  return (
    <span className={`connection-badge connection-badge--${status}`}>
      <span className="connection-badge__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
