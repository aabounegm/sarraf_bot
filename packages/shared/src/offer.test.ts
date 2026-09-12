import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convert, toMinor } from './money.ts';
import { availability } from './offer.ts';

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
