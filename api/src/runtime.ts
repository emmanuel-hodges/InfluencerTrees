// Wires the real store and mailer from configuration. Shared by the Lambda
// entry point and the local server.
import { loadConfig, type Config } from './config.js';
import { LogMailer, SesMailer, type Mailer } from './email/index.js';
import { DynamoStore } from './store/dynamo.js';
import { MemoryStore } from './store/memory.js';
import type { Store } from './store/types.js';

export function makeStore(config: Config): Store {
  if (config.storeKind === 'memory') return new MemoryStore();
  return new DynamoStore({ tableName: config.tableName, endpoint: config.dynamoEndpoint });
}

export function makeMailer(config: Config): Mailer {
  if (config.emailMode === 'ses') return new SesMailer(config.sesFrom, config.sesConfigurationSet);
  return new LogMailer();
}

export function makeDeps(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  return { config, store: makeStore(config), mailer: makeMailer(config) };
}
