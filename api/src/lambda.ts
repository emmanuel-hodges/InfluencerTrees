// Lambda entry point. API Gateway (HTTP API, payload 2.0) events are
// translated by Hono's adapter; cookies and multi-value headers included.
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.js';
import { makeDeps } from './runtime.js';

const app = createApp(makeDeps());

export const handler = handle(app);
