import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, schema } from './index.ts';

test('migrations apply and foreign keys are enforced', () => {
  const db = openDb(':memory:');
  db.insert(schema.users).values({ id: 1, firstName: 'Alex' }).run();
  const [offer] = db
    .insert(schema.offers)
    .values({
      posterId: 1,
      giveCurrency: 'USDT',
      giveAmount: 20_000,
      giveMethods: ['TRC20'],
      getCurrency: 'RUB',
      getMethods: ['SBP', 'Tinkoff'],
      rate: 96.5,
    })
    .returning()
    .all();
  assert.ok(offer);
  assert.deepEqual(offer.getMethods, ['SBP', 'Tinkoff']);
  assert.equal(offer.status, 'active');
  assert.throws(
    () =>
      db.insert(schema.claims).values({ offerId: 999, takerId: 1, amount: 1, method: 'SBP' }).run(),
    (err: unknown) => err instanceof Error && /FOREIGN KEY/.test(String(err.cause)),
  );
});
