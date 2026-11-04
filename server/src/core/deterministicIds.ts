import { createRng } from './rng';

/**
 * 仅供测试：由固定种子派生稳定的 UUID（v4 格式、跨进程可复现）。
 *
 * 讨论 ID 是 mock 输出与 Runner RNG 的唯一种子来源，固定它即可让
 * 整场讨论（阵容、出价、发言顺序、洞察、总结）完全可复现。
 */
export function deterministicUuid(...parts: readonly (string | number)[]): string {
  const rng = createRng(parts.join(':'));
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

/**
 * 生成讨论 ID 工厂：同一 (种子, 命名空间) 的第 N 次创建总是得到同一个 ID。
 * 命名空间用话题区分，重试创建同一话题会递增序号，避免主键冲突。
 */
export function createDiscussionIdFactory(
  seed: string
): (namespace: string) => string {
  const occurrences = new Map<string, number>();
  return (namespace: string) => {
    const index = occurrences.get(namespace) ?? 0;
    occurrences.set(namespace, index + 1);
    return deterministicUuid(seed, namespace, index);
  };
}
