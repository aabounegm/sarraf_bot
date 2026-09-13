import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { offersApi } from '../features/offers/api.ts';
import { AppError } from '../lib/app-error.ts';
import { signInitData, telegramAuth } from './auth.ts';

function createApi(config: Config, db: Db) {
  const api = new Hono().get('/health', (c) => c.json({ ok: true }));
  if (config.NODE_ENV !== 'production') {
    // Lets the mini app call the API from a plain browser: valid initData for a fixed fake user.
    api.get('/dev/init-data', (c) =>
      c.text(signInitData({ id: 1, first_name: 'Dev', language_code: 'en' }, config.BOT_TOKEN)),
    );
  }
  return api
    .use(telegramAuth(config.BOT_TOKEN))
    .get('/me', (c) => c.json(c.get('user')))
    .route('/offers', offersApi(db));
}

/** Type of the API, consumed by the mini app via `hc<Api>('/api')` for end-to-end typing. */
export type Api = ReturnType<typeof createApi>;

// The built mini app is served from the same origin as /api, so production is one process behind
// one reverse_proxy. In development Vite serves the app and proxies /api here instead.
const webappDist = relative(
  process.cwd(),
  fileURLToPath(new URL('../../../webapp/dist', import.meta.url)),
);

export function createHttp(config: Config, db: Db) {
  const app = new Hono()
    .onError((err, c) => {
      if (err instanceof AppError) return c.json({ error: err.code }, err.status);
      console.error(err);
      return c.json({ error: 'internal' }, 500);
    })
    .route('/api', createApi(config, db))
    .use('*', serveStatic({ root: webappDist }))
    .get('*', serveStatic({ path: join(webappDist, 'index.html') })); // SPA fallback
  return app;
}
