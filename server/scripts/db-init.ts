import { existsSync, rmSync } from 'node:fs';
import { loadConfig, loadDotEnv } from '../src/config';
import {
  initSchema,
  openDatabase,
  resolveDatabasePath,
  seedIfEmpty
} from '../src/db/connection';

loadDotEnv();
const config = loadConfig();
const databasePath = resolveDatabasePath(config.databasePath);

if (process.argv.includes('--reset') && databasePath !== ':memory:') {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = `${databasePath}${suffix}`;
    if (existsSync(filePath)) {
      rmSync(filePath);
    }
  }
}

const database = openDatabase(databasePath);

try {
  initSchema(database);
  seedIfEmpty(database);

  const tableNames = [
    'discussions',
    'participants',
    'utterances',
    'insights',
    'insight_stances',
    'events'
  ] as const;
  const rowCounts = tableNames.map((tableName) => {
    const row = database
      .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
      .get() as { count: number } | undefined;
    return `${tableName}=${row?.count ?? 0}`;
  });

  console.info(`Database initialized. Row counts: ${rowCounts.join(', ')}`);
} finally {
  database.close();
}
