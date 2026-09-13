import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convert, toMinor } from './money.ts';
import { OfferInput, availability, parseStartParam, rateInfo } from './offer.ts';

test('availability: pending reserves nothing, confirmed and done do', () => {
  const a = availability(toMinor(300), [
    { status: 'done', amount: toMinor(120) },
    { status: 'confirmed', amount: toMinor(50) },
    { status: 'pending', amount: toMinor(100) },
    { status: 'declined', amount: toMinor(999) },
  ]);
  assert.deepEqual(a, {
    filled: toMinor(120),
    reserved: toMinor(50),
    requested: toMinor(100),
    remaining: toMinor(130),
  });
});

test('convert uses the stronger currency as base in both directions', () => {
  assert.equal(convert('USDT', 'RUB', 96.5, toMinor(200)), toMinor(19_300));
  assert.equal(convert('RUB', 'USDT', 96.5, toMinor(9_650)), toMinor(100));
});

const valid = {
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP', 'Tinkoff'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 24,
  note: '  ',
};

test('OfferInput accepts a valid offer and normalises the note', () => {
  const parsed = OfferInput.parse(valid);
  assert.equal(parsed.note, null);
  assert.equal(
    OfferInput.parse({ ...valid, rate: null, negotiable: true, expiresInHours: null }).rate,
    null,
  );
});

test('OfferInput rejects same currency, foreign methods, missing rate and bad expiry', () => {
  const fails = (patch: object, path: string) => {
    const r = OfferInput.safeParse({ ...valid, ...patch });
    assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === path), `${path} should fail`);
  };
  fails({ getCurrency: 'USDT' }, 'getCurrency');
  fails({ giveMethods: ['SBP'] }, 'giveMethods');
  fails({ getMethods: [] }, 'getMethods');
  fails({ rate: null, negotiable: false }, 'rate');
  fails({ expiresInHours: 7 }, 'expiresInHours');
  fails({ giveAmount: 0 }, 'giveAmount');
});

test('rateInfo picks the stronger currency as base regardless of direction', () => {
  assert.deepEqual(
    rateInfo({ giveCurrency: 'RUB', getCurrency: 'USDT', rate: 96.5, negotiable: true }),
    {
      kind: 'asking',
      base: 'USDT',
      quote: 'RUB',
      rate: 96.5,
    },
  );
  assert.deepEqual(
    rateInfo({ giveCurrency: 'RUB', getCurrency: 'USDT', rate: null, negotiable: true }),
    {
      kind: 'open',
    },
  );
});

test('parseStartParam', () => {
  assert.deepEqual(parseStartParam('offer_1042'), { kind: 'offer', offerId: 1042 });
  assert.deepEqual(parseStartParam('take_7'), { kind: 'take', offerId: 7 });
  assert.equal(parseStartParam('offer_x'), null);
  assert.equal(parseStartParam(undefined), null);
});
