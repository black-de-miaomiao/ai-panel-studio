import { mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../../', import.meta.url));
const schemaPath = fileURLToPath(new URL('../../db/schema.sql', import.meta.url));
const seedPath = fileURLToPath(new URL('../../db/seed.sql', import.meta.url));

export function resolveDatabasePath(path: string): string {
  if (path === ':memory:' || isAbsolute(path)) {
    return path;
  }
  return resolve(serverRoot, path);
}

export function openDatabase(path: string): DatabaseSync {
  const databasePath = resolveDatabasePath(path);
  const isMemoryDatabase = databasePath === ':memory:';

  if (!isMemoryDatabase) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  if (!isMemoryDatabase) {
    database.exec('PRAGMA journal_mode = WAL');
  }
  database.exec('PRAGMA busy_timeout = 5000');

  return database;
}

export function initSchema(database: DatabaseSync): void {
  database.exec(readFileSync(schemaPath, 'utf8'));
}

export function seedIfEmpty(database: DatabaseSync): boolean {
  return withTransaction(database, () => {
    const row = database
      .prepare('SELECT COUNT(*) AS count FROM discussions')
      .get() as { count: number } | undefined;

    if ((row?.count ?? 0) > 0) {
      return false;
    }

    database.exec(readFileSync(seedPath, 'utf8'));
    return true;
  });
}

export function withTransaction<T>(
  database: DatabaseSync,
  fn: () => T
): T {
  database.exec('BEGIN IMMEDIATE');

  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original failure if SQLite has already ended the transaction.
    }
    throw error;
  }
}
