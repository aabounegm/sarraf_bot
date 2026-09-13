import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toMinor } from '@sarraf/shared';

import { loadConfig } from '../../config.ts';
import { openDb } from '../../db/index.ts';
import { signInitData } from '../../http/auth.ts';
import { createHttp } from '../../http/index.ts';

const config = loadConfig({
  BOT_TOKEN: '123:TEST',
  PUBLIC_URL: 'https://a.b',
  OFFERS_CHANNEL: '@c',
});
const as = (user: { id: number; first_name: string; username?: string }) => ({
  authorization: `tma ${signInitData(user, config.BOT_TOKEN)}`,
  'content-type': 'application/json',
});
const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour' };
const offerBody = {
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

interface OfferBody {
  id: number;
  poster: { username: string | null };
  availability: { reserved: number; requested: number };
  claims: { id: number; status: string }[];
}

test('claims API: request, confirm, list mine, reject junk', async () => {
  const app = createHttp(config, openDb(':memory:'));
  const post = (path: string, user: typeof alex | typeof nour, body?: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: as(user),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const offer = (await (await post('/api/offers', alex, offerBody)).json()) as OfferBody;

  const bad = await post('/api/claims', nour, { offerId: offer.id, amount: 0, method: 'SBP' });
  assert.equal(bad.status, 400, 'zero amount is not a request');
  assert.equal(
    (await post('/api/claims', alex, { offerId: offer.id, amount: 100, method: 'SBP' })).status,
    403,
    'the poster cannot take their own offer',
  );

  const created = await post('/api/claims', nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
  });
  assert.equal(created.status, 201);
  const withClaim = (await created.json()) as OfferBody;
  assert.equal(withClaim.availability.requested, toMinor(50));
  assert.equal(withClaim.poster.username, null, 'no handle before confirmation');
  const claimId = withClaim.claims[0]!.id;

  assert.equal((await post(`/api/claims/${claimId}/confirm`, nour)).status, 403);
  assert.equal((await post(`/api/claims/${claimId}/explode`, alex)).status, 400);
  const confirmed = (await (
    await post(`/api/claims/${claimId}/confirm`, alex)
  ).json()) as OfferBody;
  assert.equal(confirmed.availability.reserved, toMinor(50));

  const mine = (await (await app.request('/api/claims/mine', { headers: as(nour) })).json()) as {
    poster: { username: string | null };
  }[];
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.poster.username, 'alex', 'confirmed: the handle is shared');
});
