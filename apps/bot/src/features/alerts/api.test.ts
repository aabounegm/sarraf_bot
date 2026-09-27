import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig } from '../../config.ts';
import { openDb } from '../../db/index.ts';
import { signInitData } from '../../http/auth.ts';
import { createHttp } from '../../http/index.ts';

const config = loadConfig({
  BOT_TOKEN: '123:TEST',
  PUBLIC_URL: 'https://a.b',
  OFFERS_CHANNEL: '@c',
});
const as = (user: { id: number; first_name: string }) => ({
  authorization: `tma ${signInitData(user, config.BOT_TOKEN)}`,
  'content-type': 'application/json',
});
const alex = { id: 1, first_name: 'Alex' };
const nour = { id: 2, first_name: 'Nour' };
const pair = { giveCurrency: 'USDT', getCurrency: 'RUB', giveMethods: [], getMethods: [] };

const put = (app: ReturnType<typeof createHttp>, user: typeof alex, body: unknown) =>
  app.request('/api/alerts', { method: 'PUT', headers: as(user), body: JSON.stringify(body) });

test('alerts API: save, list, pause, delete — and only your own', async () => {
  const app = createHttp(config, openDb(':memory:'));

  const created = await put(app, alex, pair);
  assert.equal(created.status, 200);
  const alert = (await created.json()) as { id: number; paused: boolean };

  // The same pair again is an edit, not a second alert.
  assert.equal(
    ((await (await put(app, alex, { ...pair, getMethods: ['SBP'] })).json()) as { id: number }).id,
    alert.id,
  );
  const mine = (await (await app.request('/api/alerts', { headers: as(alex) })).json()) as {
    getMethods: string[];
  }[];
  assert.deepEqual(
    mine.map((a) => a.getMethods),
    [['SBP']],
  );
  assert.deepEqual(await (await app.request('/api/alerts', { headers: as(nour) })).json(), []);

  assert.equal((await put(app, alex, { ...pair, getCurrency: 'USDT' })).status, 400);
  assert.equal((await put(app, alex, { ...pair, giveMethods: ['SBP'] })).status, 400);

  const action = (user: typeof alex, id: number, verb: string) =>
    app.request(`/api/alerts/${id}/${verb}`, { method: 'POST', headers: as(user) });
  assert.equal((await action(nour, alert.id, 'pause')).status, 403);
  assert.equal((await action(alex, alert.id, 'jump')).status, 400);
  assert.equal(
    ((await (await action(alex, alert.id, 'pause')).json()) as { paused: boolean }).paused,
    true,
  );
  assert.equal((await action(alex, alert.id, 'pause')).status, 409, 'already paused');
  assert.equal((await action(alex, alert.id, 'delete')).status, 200);
  assert.equal((await action(alex, alert.id, 'delete')).status, 404);
});
