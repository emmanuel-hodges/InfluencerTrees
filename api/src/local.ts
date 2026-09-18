// Local server: the same app under Node, for `npm run dev`. Reads
// api/.env.local (see .env.example). The site's dev server proxies /api
// here, so the browser sees one origin exactly as it does behind CloudFront.
import { serve } from '@hono/node-server';
import { config as loadDotenv } from 'dotenv';
import { createApp } from './app.js';
import { makeDeps } from './runtime.js';

loadDotenv({ path: '.env.local', quiet: true });

const deps = makeDeps();
const app = createApp(deps);
// Its own variable: tools that launch `npm run dev` often export PORT for
// the site, and the API must not collide with it.
const port = Number(process.env.API_PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(
    `api listening on http://localhost:${port}/api ` +
      `(store=${deps.config.storeKind}${deps.config.storeKind === 'dynamodb' ? `:${deps.config.tableName}` : ''}, ` +
      `email=${deps.config.emailMode}, founder=${deps.config.founderEmail ? 'set' : 'unset'})`,
  );
});
