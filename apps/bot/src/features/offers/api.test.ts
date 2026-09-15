import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toMinor } from '@sarraf/shared';

import { loadConfig } from '../../config.ts';
import { openDb } from '../../db/index.ts';
import { signInitData } from '../../http/auth.ts';
import { createHttp } from '../../http/index.ts';
import { applyOfferAction } from './service.ts';

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
const body = {
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 24,
  note: '',
};

test('offers API: create, list, filter, read, forbid, validate', async () => {
  const app = createHttp(config, openDb(':memory:'));
  const created = await app.request('/api/offers', {
    method: 'POST',
    headers: as(alex),
    body: JSON.stringify(body),
  });
  assert.equal(created.status, 201);
  const offer = (await created.json()) as { id: number; poster: { id: number } };
  assert.equal(offer.poster.id, 1);

  assert.equal(
    ((await (await app.request('/api/offers', { headers: as(nour) })).json()) as unknown[]).length,
    1,
  );
  assert.equal(
    ((await (await app.request('/api/offers?give=EGP', { headers: as(nour) })).json()) as unknown[])
      .length,
    0,
  );
  assert.equal((await app.request('/api/offers?give=XXX', { headers: as(nour) })).status, 400);
  assert.equal((await app.request(`/api/offers/${offer.id}`, { headers: as(nour) })).status, 200);
  assert.equal((await app.request('/api/offers/999', { headers: as(nour) })).status, 404);
  assert.equal(
    ((await (await app.request('/api/offers/mine', { headers: as(alex) })).json()) as unknown[])
      .length,
    1,
  );
  assert.equal(
    ((await (await app.request('/api/offers/mine', { headers: as(nour) })).json()) as unknown[])
      .length,
    0,
  );

  const invalid = await app.request('/api/offers', {
    method: 'POST',
    headers: as(alex),
    body: JSON.stringify({ ...body, getCurrency: 'USDT' }),
  });
  assert.equal(invalid.status, 400);
  const forbidden = await app.request(`/api/offers/${offer.id}/pause`, {
    method: 'POST',
    headers: as(nour),
  });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: 'not-your-offer' });
  const paused = await app.request(`/api/offers/${offer.id}/pause`, {
    method: 'POST',
    headers: as(alex),
  });
  assert.equal(((await paused.json()) as { status: string }).status, 'paused');
  assert.equal((await app.request('/api/offers')).status, 401);
});

test('offers API: repost revives an expired offer, and only an expired one', async () => {
  const db = openDb(':memory:');
  const app = createHttp(config, db);
  const created = await app.request('/api/offers', {
    method: 'POST',
    headers: as(alex),
    body: JSON.stringify(body),
  });
  const offer = (await created.json()) as { id: number };
  const repost = () =>
    app.request(`/api/offers/${offer.id}/repost`, { method: 'POST', headers: as(alex) });

  const tooEarly = await repost();
  assert.equal(tooEarly.status, 409);
  assert.deepEqual(await tooEarly.json(), { error: 'invalid-transition' });

  applyOfferAction(db, alex.id, offer.id, 'expire'); // the scheduler's, never a route
  const back = await repost();
  assert.equal(back.status, 200);
  const revived = (await back.json()) as { status: string; expiresAt: number };
  assert.equal(revived.status, 'active');
  assert.ok(revived.expiresAt > Date.now() + 23 * 3_600_000, 'a fresh 24h');
});
