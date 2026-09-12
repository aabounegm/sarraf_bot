import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { createHttp } from './index.ts';

const env = {
  BOT_TOKEN: '123:TEST',
  WEBAPP_URL: 'https://app.example.com',
  OFFERS_CHANNEL: '@innoexchange',
};

test('/api/health is public; /api/me requires valid initData', async () => {
  const app = createHttp(loadConfig(env), openDb(':memory:'));
  assert.equal((await app.request('/api/health')).status, 200);
  assert.equal((await app.request('/api/me')).status, 401);
  assert.equal(
    (await app.request('/api/me', { headers: { authorization: 'tma nope' } })).status,
    401,
  );
});

test('dev endpoint issues initData the real verifier accepts, and is absent in production', async () => {
  const app = createHttp(loadConfig(env), openDb(':memory:'));
  const initData = await (await app.request('/api/dev/init-data')).text();
  const res = await app.request('/api/me', { headers: { authorization: `tma ${initData}` } });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { id: number }).id, 1);

  const prod = createHttp(loadConfig({ ...env, NODE_ENV: 'production' }), openDb(':memory:'));
  assert.notEqual((await prod.request('/api/dev/init-data')).status, 200);
});
