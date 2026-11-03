import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection';

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
