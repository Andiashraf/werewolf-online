// ============================================================================
// Turso (libSQL) persistence. Works identically against a real Turso database
// (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) or a local SQLite file when
// those aren't set — which is what makes this testable without real
// credentials, and lets you develop locally before deploying.
// ============================================================================

import { createClient } from '@libsql/client';

let client = null;

export function getDb() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || 'file:local-dev.db';
  const authToken = process.env.TURSO_AUTH_TOKEN; // undefined is fine for a local file: URL
  client = createClient({ url, authToken });
  return client;
}

export async function initSchema() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export async function loadRoom(code) {
  const db = getDb();
  const res = await db.execute({ sql: 'SELECT state FROM rooms WHERE code = ?', args: [code] });
  if (res.rows.length === 0) return null;
  try {
    return JSON.parse(res.rows[0].state);
  } catch {
    return null;
  }
}

export async function saveRoom(code, state) {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO rooms (code, state, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
    `,
    args: [code, JSON.stringify(state), Date.now()],
  });
}

export async function deleteRoom(code) {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM rooms WHERE code = ?', args: [code] });
}

export async function listRoomCodes() {
  const db = getDb();
  const res = await db.execute('SELECT code, updated_at FROM rooms ORDER BY updated_at DESC LIMIT 100');
  return res.rows.map((r) => ({ code: r.code, updatedAt: r.updated_at }));
}
