import { createApp } from './app';
import { describeConfig, loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db/connection';

loadDotEnv();
const config = loadConfig();
const database = openDatabase(config.databasePath);
const app = createApp({ config, db: database });
const server = app.listen(config.port, '127.0.0.1', () => {
  console.info(`AI Panel Studio server listening at http://127.0.0.1:${config.port}`);
  console.info(describeConfig(config));
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.info(`${signal} received; closing server`);

  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server', error);
      process.exitCode = 1;
    }
    database.close();
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
