import { PGlite } from '@electric-sql/pglite';
import { applySchema, type Db } from './db.js';

/** In-process Postgres used by local development and the test suite only. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = new PGlite(dataDir);
  let chain: Promise<unknown> = Promise.resolve();
  const db: Db = {
    query: async (sql, params) => (await pg.query(sql, params as unknown[])) as never,
    transaction: (fn) => {
      const run = chain.then(() =>
        pg.transaction(async (t) => {
          const tx: Db = {
            query: async (sql, params) => (await t.query(sql, params as unknown[])) as never,
            transaction: (inner) => inner(tx),
          };
          return fn(tx);
        }),
      );
      chain = run.catch(() => undefined);
      return run;
    },
  };
  await applySchema(db);
  return db;
}
