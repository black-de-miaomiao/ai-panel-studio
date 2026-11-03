import { mkdirSync } from 'node:fs';
import { isAbsolute, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../../', import.meta.url));

function resolveDatabasePath(path: string): string {
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
