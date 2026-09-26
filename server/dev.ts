/**
 * Local development API server (not deployed). Uses the same handlers as
 * production against an on-disk PGlite database in .data/ (git-ignored),
 * or a real Postgres when DATABASE_URL is set.
 */
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { getProductionDb, type Db } from './db.js';
import { serveNode } from './node-adapter.js';
import { createPgliteDb } from './pglite.js';

let local: Promise<Db> | undefined;
const getDb = () => {
  const prod = getProductionDb();
  if (prod) return prod;
  mkdirSync('.data', { recursive: true });
  return (local ??= createPgliteDb('.data/pglite'));
};

const port = Number(process.env.API_PORT ?? 8787);
createServer((req, res) => {
  serveNode(req, res, getDb).catch(() => {
    res.statusCode = 500;
    res.end();
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`[dev-api] listening on 127.0.0.1:${port}`);
});
