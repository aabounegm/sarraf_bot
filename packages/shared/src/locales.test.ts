import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { FluentResource } from '@fluent/bundle';

const dir = new URL('../locales/', import.meta.url);
const ids = (file: string) =>
  new FluentResource(readFileSync(new URL(file, dir), 'utf8')).body.map((m) => m.id).toSorted();

test('every locale defines the same message ids as en.ftl', () => {
  const en = ids('en.ftl');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ftl') && f !== 'en.ftl')) {
    assert.deepEqual(ids(file), en, `${file} is out of sync with en.ftl`);
  }
});
