export function formatRound(turnCount: number, maxTurns: number): string {
  const current = Math.min(Math.max(turnCount, 0), maxTurns);
  return `第 ${String(current).padStart(2, '0')} / ${String(maxTurns).padStart(2, '0')} 轮`;
}

export function formatTimeAgo(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '刚刚';

  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}

export function formatClockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}
