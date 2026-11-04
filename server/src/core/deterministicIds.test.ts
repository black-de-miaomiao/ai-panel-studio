import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createDiscussionIdFactory,
  deterministicUuid
} from './deterministicIds';

const uuidSchema = z.uuid();

describe('deterministicUuid', () => {
  it('produces valid v4 UUIDs that are stable across calls', () => {
    const first = deterministicUuid('e2e', '话题一', 0);
    const second = deterministicUuid('e2e', '话题一', 0);

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(uuidSchema.safeParse(first).success).toBe(true);
    expect(second).toBe(first);
  });

  it('separates seeds, namespaces, and occurrence indices', () => {
    const base = deterministicUuid('seed-a', 'topic', 0);

    expect(deterministicUuid('seed-b', 'topic', 0)).not.toBe(base);
    expect(deterministicUuid('seed-a', 'other-topic', 0)).not.toBe(base);
    expect(deterministicUuid('seed-a', 'topic', 1)).not.toBe(base);
  });
});

describe('createDiscussionIdFactory', () => {
  it('replays the same ids for a fresh factory with the same seed', () => {
    const first = createDiscussionIdFactory('e2e');
    const second = createDiscussionIdFactory('e2e');

    const firstIds = ['话题甲', '话题甲', '话题乙'].map((topic) => first(topic));
    const secondIds = ['话题甲', '话题甲', '话题乙'].map((topic) => second(topic));

    expect(secondIds).toEqual(firstIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it('advances the occurrence index when the same namespace repeats', () => {
    const factory = createDiscussionIdFactory('e2e');

    expect(factory('同一话题')).not.toBe(factory('同一话题'));
  });
});
