import { eq } from 'drizzle-orm';
import type { StorageAdapter } from 'grammy';

import { type Db, schema } from '../db/index.ts';

/** grammY session storage backed by the `sessions` table. */
export function sqliteStorage<T>(db: Db): StorageAdapter<T> {
  return {
    read(key) {
      const row = db.select().from(schema.sessions).where(eq(schema.sessions.key, key)).get();
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    write(key, value) {
      const serialized = JSON.stringify(value);
      db.insert(schema.sessions)
        .values({ key, value: serialized })
        .onConflictDoUpdate({ target: schema.sessions.key, set: { value: serialized } })
        .run();
    },
    delete(key) {
      db.delete(schema.sessions).where(eq(schema.sessions.key, key)).run();
    },
  };
}
