import { createApp } from './app';
import { describeConfig, loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db/connection';
import { createEventBus } from './engine/eventBus';
import { DiscussionManager } from './engine/manager';
import { createLLMGateway } from './llm/gateway';
import { createMockProvider } from './llm/mock';
import { createOpenAICompatibleProvider } from './llm/openaiCompatible';

loadDotEnv();
const config = loadConfig();
const database = openDatabase(config.databasePath);
const provider =
  config.llm.provider === 'mock'
    ? createMockProvider({
        latencyMs: config.mockLatencyMs,
        streamDelayMs: config.mockStreamDelayMs
      })
    : createOpenAICompatibleProvider({
        baseUrl: config.llm.baseUrl,
        apiKey: config.llm.apiKey
      });
const llm = createLLMGateway({
  provider,
  models: {
    quality: config.llm.qualityModel,
    fast: config.llm.fastModel
  },
  maxConcurrency: config.llm.maxConcurrency,
  logger: (line) => console.info(line)
});
const bus = createEventBus(database);
const manager = new DiscussionManager(
  database,
  bus,
  llm,
  { maxTurns: config.maxTurns, pacingMs: config.pacingMs }
);
manager.recoverOnBoot();
const app = createApp({ config, db: database, llm, bus, manager });
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
