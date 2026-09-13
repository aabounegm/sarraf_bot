import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

import * as schema from './schema.ts';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Opens (creating if needed) the SQLite database and applies pending migrations. */
export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = new DatabaseSync(path);
  client.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db = drizzle({ client });
  const failure = migrate(db, { migrationsFolder });
  if (failure) throw new Error(`migration failed: ${JSON.stringify(failure)}`);
  return db;
}

export type Db = ReturnType<typeof openDb>;
/** Either the database or a transaction handle — service internals accept both. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
export { schema };
