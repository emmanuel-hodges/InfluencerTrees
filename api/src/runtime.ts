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
  if (config.emailMode !== 'ses') return new LogMailer();
  // Every sent message must carry the support address as reply-to (CLAUDE.md,
  // Email). Failing here, at startup, is what makes that a property of the
  // deployment rather than a habit.
  if (!config.contactEmail) throw new Error('CONTACT_EMAIL is required when EMAIL_MODE=ses: every message needs a reply-to');
  return new SesMailer(config.sesFrom, config.sesConfigurationSet, config.contactEmail);
}

export function makeDeps(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  return { config, store: makeStore(config), mailer: makeMailer(config) };
}
