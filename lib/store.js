// Storage layer.
//  - DATABASE_URL set  -> PostgreSQL (e.g. Neon). Permanent; survives redeploys/restarts.
//  - DATABASE_URL unset -> local JSON file (DATA_DIR/db.json). Dev only; lost on Render redeploys.
// The app keeps a working copy in memory (`db`) exactly as before; save() persists
// every changed/removed record to the backend. In Postgres mode API responses wait
// for the write to commit (see persistMiddleware), so an "OK" means it is on disk.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
export const STORAGE = DATABASE_URL ? 'postgres' : 'json-file';

// collection key in `db`  ->  table name in Postgres
const TABLES = {
  users: 'users',
  clients: 'clients',
  visits: 'visits',            // measurements (anthropometry, labs, notes) per client visit
  plans: 'plans',              // diet plans (meals in data jsonb), assigned via client_id
  recipes: 'recipes',
  appointments: 'appointments',
  todos: 'todos',
  templates: 'templates',
  customFoods: 'custom_foods',
  diary: 'diary',
  messages: 'messages',
};
const KEYS = Object.keys(TABLES);

const empty = () => Object.fromEntries(KEYS.map(k => [k, []]));
export const db = empty();

function normalize() {
  for (const k of KEYS) if (!Array.isArray(db[k])) db[k] = [];
}

export function uid() {
  return crypto.randomBytes(9).toString('base64url');
}

export function owned(list, ownerId) {
  return list.filter(x => x.ownerId === ownerId);
}

export function findOwned(list, ownerId, id) {
  return list.find(x => x.id === id && x.ownerId === ownerId) || null;
}

/* ----------------------------- JSON file (dev) ----------------------------- */

function readJsonFile() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

/* -------------------------------- Postgres -------------------------------- */

let pool = null;
const persisted = Object.fromEntries(KEYS.map(k => [k, new Map()])); // id -> JSON string last committed
const status = { ready: false, lastSaveAt: null, lastError: null, pending: false };

const SCHEMA_VERSION = 1;
export function schemaSql() {
  const parts = [`CREATE TABLE IF NOT EXISTS schema_meta (key text PRIMARY KEY, value text NOT NULL)`];
  for (const t of Object.values(TABLES)) {
    parts.push(`CREATE TABLE IF NOT EXISTS ${t} (
      id text PRIMARY KEY,
      owner_id text,
      client_id text,
      ${t === 'users' ? 'email text, role text,' : ''}
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    parts.push(`CREATE INDEX IF NOT EXISTS ${t}_owner_idx ON ${t} (owner_id)`);
    if (t !== 'users') parts.push(`CREATE INDEX IF NOT EXISTS ${t}_client_idx ON ${t} (client_id)`);
  }
  parts.push(`CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email))`);
  parts.push(`INSERT INTO schema_meta (key, value) VALUES ('version', '${SCHEMA_VERSION}')
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  return parts;
}

// owner column per collection: users are owned by their dietitian (client logins) or themselves
const ownerOf = (k, row) => (k === 'users' ? (row.dietitianId || row.id) : row.ownerId) || null;

async function connectPg() {
  const { default: pg } = await import('pg');
  let conn = DATABASE_URL;
  // node-postgres does not understand channel_binding; Neon works fine without it.
  try {
    const u = new URL(conn);
    u.searchParams.delete('channel_binding');
    if (u.searchParams.get('sslmode') === 'require') u.searchParams.set('sslmode', 'verify-full');
    conn = u.toString();
  } catch { /* leave as is */ }
  pool = new pg.Pool({
    connectionString: conn,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
  });
  pool.on('error', err => console.error('[db] idle client error:', err.message));
}

async function withRetry(label, fn, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (err) {
      last = err;
      console.error(`[db] ${label} failed (attempt ${i + 1}/${tries}): ${err.message}`);
      await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** i, 10000)));
    }
  }
  throw last;
}

async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT pg_advisory_xact_lock(724411)`);
    for (const q of schemaSql()) await c.query(q);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

async function loadPg() {
  for (const k of KEYS) {
    const { rows } = await pool.query(`SELECT data FROM ${TABLES[k]} ORDER BY created_at, id`);
    db[k] = rows.map(r => r.data);
    persisted[k] = new Map(db[k].map(row => [row.id, JSON.stringify(row)]));
  }
}

async function writeDiff() {
  // Snapshot current memory, compute changes vs last commit.
  const plan = [];
  for (const k of KEYS) {
    const now = new Map();
    for (const row of db[k]) {
      if (!row || typeof row !== 'object') continue;
      if (!row.id) row.id = uid();
      now.set(row.id, JSON.stringify(row));
    }
    const prev = persisted[k];
    const upserts = [];
    for (const [id, s] of now) if (prev.get(id) !== s) upserts.push(s);
    const deletes = [];
    for (const id of prev.keys()) if (!now.has(id)) deletes.push(id);
    if (upserts.length || deletes.length) plan.push({ k, now, upserts, deletes });
  }
  if (!plan.length) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const { k, upserts, deletes } of plan) {
      const t = TABLES[k];
      if (deletes.length) await c.query(`DELETE FROM ${t} WHERE id = ANY($1::text[])`, [deletes]);
      for (let i = 0; i < upserts.length; i += 500) {
        const chunk = upserts.slice(i, i + 500).map(s => {
          const row = JSON.parse(s);
          return { id: row.id, owner: ownerOf(k, row), client: row.clientId || null, email: row.email || null, role: row.role || null, data: row };
        });
        const userCols = t === 'users';
        await c.query(
          `INSERT INTO ${t} (id, owner_id, client_id, ${userCols ? 'email, role, ' : ''}data, updated_at)
           SELECT x->>'id', x->>'owner', x->>'client', ${userCols ? "lower(x->>'email'), x->>'role', " : ''}x->'data', now()
           FROM jsonb_array_elements($1::jsonb) AS x
           ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, client_id = EXCLUDED.client_id,
             ${userCols ? 'email = EXCLUDED.email, role = EXCLUDED.role, ' : ''}data = EXCLUDED.data, updated_at = now()`,
          [JSON.stringify(dedupe(chunk))]
        );
      }
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
  for (const { k, now, upserts, deletes } of plan) {
    for (const id of deletes) persisted[k].delete(id);
    for (const s of upserts) { const id = JSON.parse(s).id; persisted[k].set(id, now.get(id)); }
  }
}

function dedupe(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.id, r);
  return [...m.values()];
}

let dirty = false;
let running = null;
let retryTimer = null;

async function flushLoop() {
  while (dirty) {
    dirty = false;
    try {
      await writeDiff();
      status.lastSaveAt = new Date().toISOString();
      status.lastError = null;
    } catch (err) {
      dirty = true;
      status.lastError = err.message;
      console.error('[db] save failed:', err.message);
      if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; if (dirty) save().catch(() => {}); }, 5000);
      throw err;
    }
  }
}

/** Persist all changes. Returns a promise that resolves once committed. */
export function save() {
  if (STORAGE === 'json-file') {
    saveJson();
    return Promise.resolve();
  }
  dirty = true;
  if (!running) {
    status.pending = true;
    running = flushLoop().finally(() => { running = null; status.pending = false; });
    running.catch(() => {}); // errors are reported via status/res; never crash the process
  }
  return running;
}

/** Wait for any in-flight write (no-op in JSON mode). */
export function flush() {
  if (STORAGE === 'json-file') return Promise.resolve();
  if (running) return running;
  if (dirty) return save();
  return Promise.resolve();
}

/**
 * Express middleware: if a handler called save(), delay res.json until the write is
 * committed. On a database failure the client gets 503 instead of a false "saved".
 */
export function persistMiddleware(req, res, next) {
  if (STORAGE === 'json-file') return next();
  const orig = res.json.bind(res);
  res.json = (body) => {
    if (!running) return orig(body);
    running.then(
      () => orig(body),
      () => { if (!res.headersSent) res.status(503); orig({ error: 'Προσωρινό πρόβλημα σύνδεσης με τη βάση. Η αλλαγή θα αποθηκευτεί αυτόματα μόλις αποκατασταθεί· ανανεώστε τη σελίδα σε λίγο πριν την επαναλάβετε.' }); }
    );
    return res;
  };
  next();
}

export function storageInfo() {
  return STORAGE === 'json-file'
    ? { storage: 'json-file', persistent: false }
    : { storage: 'postgres', persistent: true, ready: status.ready, lastSaveAt: status.lastSaveAt, lastError: status.lastError, pending: status.pending };
}

export async function pingDb() {
  if (!pool) return true;
  await pool.query('SELECT 1');
  return true;
}

/** Load data at boot. Must be awaited before serving requests. */
export async function initStore() {
  if (STORAGE === 'json-file') {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const parsed = readJsonFile();
    if (parsed) Object.assign(db, empty(), parsed);
    normalize();
    console.log(`[db] storage: JSON file ${DB_FILE} (NOT persistent on Render — set DATABASE_URL)`);
    return;
  }
  await connectPg();
  await withRetry('connect+migrate', migrate);
  await withRetry('load', loadPg);
  normalize();
  const counts = KEYS.map(k => `${k}=${db[k].length}`).join(' ');
  console.log(`[db] storage: PostgreSQL (schema v${SCHEMA_VERSION}) loaded ${counts}`);
  // One-time import of an existing local db.json into an empty database.
  if (!db.users.length) {
    const parsed = readJsonFile();
    if (parsed && Array.isArray(parsed.users) && parsed.users.length) {
      Object.assign(db, empty(), parsed);
      normalize();
      await save();
      console.log(`[db] imported ${DB_FILE} into PostgreSQL (${db.users.length} users, ${db.clients.length} clients)`);
    }
  }
  status.ready = true;
}

export async function closeStore() {
  try { await flush(); } catch (err) { console.error('[db] final flush failed:', err.message); }
  if (pool) await pool.end().catch(() => {});
}
