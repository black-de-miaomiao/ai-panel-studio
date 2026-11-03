import { describe, expect, it } from 'vitest';
import {
  initSchema,
  openDatabase,
  seedIfEmpty,
  withTransaction
} from './connection';

function insertDiscussion(database: ReturnType<typeof openDatabase>, id: string) {
  database
    .prepare(
      `INSERT INTO discussions (
        id, topic, expert_count, status, max_turns, turn_count, source,
        created_at, updated_at
      ) VALUES (?, '测试话题', 4, 'draft', 16, 0, 'user', ?, ?)`
    )
    .run(id, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
}

describe('openDatabase', () => {
  it('opens an in-memory SQLite database', () => {
    const database = openDatabase(':memory:');

    try {
      const result = database
        .prepare('select sqlite_version() as v')
        .get() as { v?: string } | undefined;

      expect(result?.v).toBeTruthy();
    } finally {
      database.close();
    }
  });

  it('enables foreign key constraints', () => {
    const database = openDatabase(':memory:');

    try {
      const result = database
        .prepare('PRAGMA foreign_keys')
        .get() as { foreign_keys?: number } | undefined;

      expect(result?.foreign_keys).toBe(1);
    } finally {
      database.close();
    }
  });
});

describe('database initialization helpers', () => {
  it('executes the schema repeatedly without duplicating or dropping tables', () => {
    const database = openDatabase(':memory:');

    try {
      initSchema(database);
      initSchema(database);
      const row = database
        .prepare(
          `SELECT COUNT(*) AS count
             FROM sqlite_master
            WHERE type = 'table'
              AND name IN (
                'discussions', 'participants', 'utterances', 'insights',
                'insight_stances', 'events'
              )`
        )
        .get() as { count: number } | undefined;

      expect(row?.count).toBe(6);
    } finally {
      database.close();
    }
  });

  it('seeds an empty database once and leaves non-empty data untouched', () => {
    const database = openDatabase(':memory:');

    try {
      initSchema(database);
      expect(seedIfEmpty(database)).toBe(true);
      expect(seedIfEmpty(database)).toBe(false);
      const row = database
        .prepare('SELECT COUNT(*) AS count FROM discussions')
        .get() as { count: number } | undefined;
      expect(row?.count).toBe(6);
    } finally {
      database.close();
    }
  });

  it('commits a successful synchronous transaction', () => {
    const database = openDatabase(':memory:');

    try {
      initSchema(database);
      withTransaction(database, () => {
        insertDiscussion(
          database,
          '00000000-0000-4000-8000-000000000901'
        );
      });
      const row = database
        .prepare('SELECT COUNT(*) AS count FROM discussions')
        .get() as { count: number } | undefined;
      expect(row?.count).toBe(1);
    } finally {
      database.close();
    }
  });

  it('rolls back and rethrows the original transaction failure', () => {
    const database = openDatabase(':memory:');

    try {
      initSchema(database);
      expect(() =>
        withTransaction(database, () => {
          insertDiscussion(
            database,
            '00000000-0000-4000-8000-000000000902'
          );
          throw new Error('expected rollback');
        })
      ).toThrow('expected rollback');

      const row = database
        .prepare('SELECT COUNT(*) AS count FROM discussions')
        .get() as { count: number } | undefined;
      expect(row?.count).toBe(0);
    } finally {
      database.close();
    }
  });
});
