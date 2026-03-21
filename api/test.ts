import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../server/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const diagnostics: any = {
    status: 'ok',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      DATABASE_URL: process.env.DATABASE_URL ? 'PRESENT' : 'MISSING',
    },
    fs: {
      cwd: process.cwd(),
      rootFiles: fs.readdirSync(process.cwd()),
      sqliteExists: fs.existsSync(path.resolve(process.cwd(), 'sqlite.db')),
      tmpSqliteExists: fs.existsSync('/tmp/sqlite.db'),
    },
    time: new Date().toISOString()
  };

  try {
    const db = await getDb();
    diagnostics.db = {
      connected: !!db,
      type: typeof db,
    };
  } catch (e: any) {
    diagnostics.db = {
      error: e.message,
      stack: e.stack
    };
  }

  res.status(200).json(diagnostics);
}

