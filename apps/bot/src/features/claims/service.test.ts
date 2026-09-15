import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';

import { type Db, openDb } from '../../db/index.ts';
import { AppError } from '../../lib/app-error.ts';
import { applyOfferAction, createOffer, getOffer } from '../offers/service.ts';
import { applyClaimAction, createClaim, listClaimsByTaker } from './service.ts';

const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour', username: 'nour' };
const karim = { id: 3, first_name: 'Karim' };
const input: OfferInput = {
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP', 'Tinkoff'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 24,
  note: null,
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

/** An offer by Alex, with a fresh in-memory db. */
function board() {
  const db = openDb(':memory:');
  const offer = createOffer(db, alex, input);
  return { db, offerId: offer.id };
}

const claimOf = (db: Db, offerId: number, takerId: number) =>
  getOffer(db, offerId).claims.find((c) => c.taker.id === takerId)!;

test('take: pending requests reserve nothing and are visible to everyone', () => {
  const { db, offerId } = board();
  const offer = createClaim(db, nour, {
    offerId,
    amount: toMinor(100),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });

  assert.equal(offer.availability.remaining, toMinor(200), 'pending reserves nothing');
  assert.equal(offer.availability.requested, toMinor(100));
  assert.equal(offer.claims.length, 1);
  assert.equal(offer.claims[0]?.status, 'pending');
});

test('take is refused for own offers, closed offers, unknown methods and seconds helpings', () => {
  const { db, offerId } = board();
  const take = (
    taker: Parameters<typeof createClaim>[1],
    patch: Partial<Parameters<typeof createClaim>[2]> = {},
  ) =>
    code(() =>
      createClaim(db, taker, {
        offerId,
        amount: toMinor(50),
        method: 'SBP',
        receiveMethod: 'TRC20',
        ...patch,
      }),
    );

  assert.equal(take(alex), 'own-offer');
  assert.equal(
    take(nour, { method: 'Cash' }),
    'unknown-method',
    'pays with a method off the offer',
  );
  assert.equal(take(nour, { receiveMethod: 'TON' }), 'unknown-method', 'receives on one too');
  assert.equal(take(nour, { amount: toMinor(300) }), 'amount-exceeds-remaining');
  assert.equal(take(nour), 'no-error');
  assert.equal(take(nour), 'already-claimed', 'one open request per taker per offer');

  applyOfferAction(db, alex.id, offerId, 'pause');
  assert.equal(take(karim), 'offer-unavailable');
});

test('confirm reserves; a second confirm beyond what is left is refused', () => {
  const { db, offerId } = board();
  createClaim(db, nour, { offerId, amount: toMinor(150), method: 'SBP', receiveMethod: 'TRC20' });
  createClaim(db, karim, {
    offerId,
    amount: toMinor(100),
    method: 'Tinkoff',
    receiveMethod: 'TRC20',
  });
  const nours = claimOf(db, offerId, nour.id).id;
  const karims = claimOf(db, offerId, karim.id).id;

  const confirmed = applyClaimAction(db, alex.id, nours, 'confirm');
  assert.equal(confirmed.availability.reserved, toMinor(150));
  assert.equal(confirmed.availability.remaining, toMinor(50));

  assert.equal(
    code(() => applyClaimAction(db, alex.id, karims, 'confirm')),
    'amount-exceeds-remaining',
  );
  assert.equal(
    code(() => applyClaimAction(db, nour.id, karims, 'confirm')),
    'not-your-claim',
  );
  assert.equal(
    code(() => applyClaimAction(db, alex.id, nours, 'confirm')),
    'invalid-transition',
  );
});

test('contact details are exchanged only after confirmation', () => {
  const { db, offerId } = board();
  createClaim(db, nour, { offerId, amount: toMinor(50), method: 'SBP', receiveMethod: 'TRC20' });
  const claimId = claimOf(db, offerId, nour.id).id;

  assert.equal(getOffer(db, offerId, nour.id).poster.username, null, 'pending: no handle');
  assert.equal(getOffer(db, offerId, alex.id).claims[0]?.taker.username, null);

  applyClaimAction(db, alex.id, claimId, 'confirm');
  assert.equal(getOffer(db, offerId, nour.id).poster.username, 'alex');
  assert.equal(getOffer(db, offerId, alex.id).claims[0]?.taker.username, 'nour');
  assert.equal(getOffer(db, offerId, karim.id).poster.username, null, 'not their deal');
  assert.equal(getOffer(db, offerId).poster.username, null, 'no viewer, no handle');
});

test('done is two-sided and completes the offer when nothing is left', () => {
  const { db, offerId } = board();
  createClaim(db, nour, { offerId, amount: toMinor(200), method: 'SBP', receiveMethod: 'TRC20' });
  const claimId = claimOf(db, offerId, nour.id).id;
  applyClaimAction(db, alex.id, claimId, 'confirm');

  const half = applyClaimAction(db, nour.id, claimId, 'done');
  assert.equal(half.claims[0]?.status, 'confirmed', 'one side is not enough');
  assert.equal(half.claims[0]?.takerDone, true);
  assert.equal(half.status, 'active');

  const both = applyClaimAction(db, alex.id, claimId, 'done');
  assert.equal(both.claims[0]?.status, 'done');
  assert.equal(both.availability.filled, toMinor(200));
  assert.equal(both.status, 'completed', 'nothing left to give');
  assert.equal(both.poster.deals, 1);
});

test('cancel, decline and release put the amount back', () => {
  const { db, offerId } = board();
  createClaim(db, nour, { offerId, amount: toMinor(100), method: 'SBP', receiveMethod: 'TRC20' });
  const nours = claimOf(db, offerId, nour.id).id;
  assert.equal(
    code(() => applyClaimAction(db, alex.id, nours, 'cancel')),
    'not-your-claim',
  );
  assert.equal(applyClaimAction(db, nour.id, nours, 'cancel').availability.requested, 0);

  createClaim(db, karim, { offerId, amount: toMinor(100), method: 'SBP', receiveMethod: 'TRC20' });
  const karims = claimOf(db, offerId, karim.id).id;
  applyClaimAction(db, alex.id, karims, 'confirm');
  const released = applyClaimAction(db, karim.id, karims, 'release');
  assert.equal(released.availability.remaining, toMinor(200));
  assert.equal(released.claims.find((c) => c.id === karims)?.status, 'cancelled');
});

test('your requests: newest first, handle only once confirmed', () => {
  const { db, offerId } = board();
  createClaim(db, nour, { offerId, amount: toMinor(50), method: 'SBP', receiveMethod: 'TRC20' });
  const second = createOffer(db, karim, { ...input, giveAmount: toMinor(10) });
  createClaim(db, nour, {
    offerId: second.id,
    amount: toMinor(10),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });

  const mine = listClaimsByTaker(db, nour.id);
  assert.deepEqual(
    mine.map((c) => c.poster.firstName),
    ['Karim', 'Alex'],
  );
  assert.deepEqual(
    mine.map((c) => c.poster.username),
    [null, null],
  );
  assert.equal(mine[0]?.giveCurrency, 'USDT');

  applyClaimAction(db, alex.id, claimOf(db, offerId, nour.id).id, 'confirm');
  assert.equal(listClaimsByTaker(db, nour.id).at(-1)?.poster.username, 'alex');
});
