import { existsSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnv } from '../src/config';
import { openDatabase } from '../src/db/connection';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
const seedPath = fileURLToPath(new URL('../db/seed.sql', import.meta.url));

function resolveDatabasePath(path: string): string {
  if (path === ':memory:' || isAbsolute(path)) {
    return path;
  }
  return resolve(serverRoot, path);
}

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
  if (existsSync(schemaPath)) {
    database.exec(readFileSync(schemaPath, 'utf8'));
  }
  if (existsSync(seedPath)) {
    database.exec(readFileSync(seedPath, 'utf8'));
  }
} finally {
  database.close();
}

console.info('db init done');
