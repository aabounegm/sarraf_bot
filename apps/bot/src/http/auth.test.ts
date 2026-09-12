import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { verifyInitData } from './auth.ts';

const TOKEN = '123456:TEST';

function sign(fields: Record<string, string>, token = TOKEN) {
  const dataCheckString = Object.entries(fields)
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: 'AAH',
  user: JSON.stringify({ id: 42, first_name: 'Nour', language_code: 'ar' }),
};

test('accepts correctly signed initData', () => {
  assert.equal(verifyInitData(sign(fields), TOKEN)?.id, 42);
});

test('rejects tampered, wrong-token and expired initData', () => {
  assert.equal(verifyInitData(sign(fields).replace('Nour', 'Mallory'), TOKEN), null);
  assert.equal(verifyInitData(sign(fields, 'other'), TOKEN), null);
  assert.equal(verifyInitData(sign({ ...fields, auth_date: '1000' }), TOKEN), null);
  assert.equal(verifyInitData('', TOKEN), null);
});
