import type { IncomingMessage, ServerResponse } from 'node:http';
import { getProductionDb } from '../server/db.js';
import { serveNode } from '../server/node-adapter.js';

/** Single Vercel Function serving every /api/* route (see vercel.json rewrites). */
export default function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  return serveNode(req, res, getProductionDb);
}
