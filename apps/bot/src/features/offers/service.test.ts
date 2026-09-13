import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';

import { openDb, schema } from '../../db/index.ts';
import { AppError } from '../../lib/app-error.ts';
import {
  applyOfferAction,
  createOffer,
  getOffer,
  listOffers,
  listOffersByPoster,
  updateOffer,
} from './service.ts';

const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour' };
const input: OfferInput = {
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP', 'Tinkoff'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 24,
  note: 'Technopark lobby',
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return 'no-error';
};

test('create, list, get: availability and poster are derived', () => {
  const db = openDb(':memory:');
  const created = createOffer(db, alex, input);
  assert.equal(created.status, 'active');
  assert.ok(created.expiresAt && created.expiresAt > Date.now());
  // username stays null until a confirmed claim reveals it (see claims/service.test.ts).
  assert.deepEqual(created.poster, { id: 1, firstName: 'Alex', username: null, deals: 0 });
  assert.equal(created.availability.remaining, toMinor(200));

  createOffer(db, nour, {
    ...input,
    giveCurrency: 'AED',
    giveMethods: ['Cash'],
    getCurrency: 'USDT',
    getMethods: ['TRC20'],
    rate: null,
    negotiable: true,
    expiresInHours: null,
  });
  assert.equal(listOffers(db).length, 2);
  assert.deepEqual(
    listOffers(db, { give: 'AED' }).map((o) => o.poster.firstName),
    ['Nour'],
  );
  assert.equal(listOffers(db, { give: 'AED' })[0]?.negotiable, true);
  assert.equal(listOffersByPoster(db, alex.id).length, 1);
  assert.equal(
    code(() => getOffer(db, 999)),
    'offer-not-found',
  );
});

test('edit: only the poster, never below filled + reserved', () => {
  const db = openDb(':memory:');
  const offer = createOffer(db, alex, input);
  db.insert(schema.users).values({ id: nour.id, firstName: nour.first_name }).run();
  db.insert(schema.claims)
    .values({
      offerId: offer.id,
      takerId: nour.id,
      amount: toMinor(100),
      method: 'SBP',
      status: 'confirmed',
    })
    .run();
  db.insert(schema.claims)
    .values({
      offerId: offer.id,
      takerId: nour.id,
      amount: toMinor(50),
      method: 'SBP',
      status: 'done',
    })
    .run();

  assert.equal(
    code(() => updateOffer(db, nour.id, offer.id, input)),
    'not-your-offer',
  );
  assert.equal(
    code(() => updateOffer(db, alex.id, offer.id, { ...input, giveAmount: toMinor(149) })),
    'amount-below-committed',
  );
  const updated = updateOffer(db, alex.id, offer.id, {
    ...input,
    giveAmount: toMinor(150),
    note: null,
  });
  assert.equal(updated.note, null);
  assert.deepEqual(updated.availability, {
    filled: toMinor(50),
    reserved: toMinor(100),
    requested: 0,
    remaining: 0,
  });
  assert.equal(getOffer(db, offer.id).claims.length, 2);
  assert.equal(getOffer(db, offer.id).poster.deals, 1);
});

test('pause/resume/close transitions; close declines pending requests only', () => {
  const db = openDb(':memory:');
  const offer = createOffer(db, alex, input);
  db.insert(schema.users).values({ id: nour.id, firstName: nour.first_name }).run();
  db.insert(schema.claims)
    .values([
      { offerId: offer.id, takerId: nour.id, amount: 1, method: 'SBP', status: 'pending' },
      { offerId: offer.id, takerId: nour.id, amount: 1, method: 'SBP', status: 'confirmed' },
    ])
    .run();

  assert.equal(
    code(() => applyOfferAction(db, alex.id, offer.id, 'resume')),
    'invalid-transition',
  );
  assert.equal(applyOfferAction(db, alex.id, offer.id, 'pause').status, 'paused');
  assert.equal(listOffers(db).length, 0, 'paused offers leave the board');
  assert.equal(listOffersByPoster(db, alex.id).length, 1, 'but stay in the poster’s own list');
  assert.equal(applyOfferAction(db, alex.id, offer.id, 'resume').status, 'active');
  const closed = applyOfferAction(db, alex.id, offer.id, 'close');
  assert.equal(closed.status, 'closed');
  assert.deepEqual(closed.claims.map((c) => c.status).toSorted(), ['confirmed', 'declined']);
  assert.equal(listOffers(db).length, 0);
  assert.equal(
    code(() => updateOffer(db, alex.id, offer.id, input)),
    'offer-finished',
  );
});
