// Supabase Postgres as the durable database (write-through).
//
//   boot      connect() -> loadAll(): every table is read from Postgres into the in-process SQLite working set
//   running   attach(db): SQLite triggers log every row change into _changes; a flusher replicates them to
//             Postgres in small ordered transactions (one multi-row upsert per table)
//   shutdown  close(): final flush, then disconnect
//
// So the firm's data of record lives in Supabase and survives any restart of the (stateless) server.
// Row-level replication keeps this dialect-free: the SQLite code paths do not know Postgres exists.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPEND_ONLY = new Set(['transactions', 'entries']); // never updated: replicate with DO NOTHING
const q = (id) => `"${id}"`;
const FLUSH_MS = 1500;
const BATCH = 400;

// BIGINT (int8) and NUMERIC come back as strings by default; every number here fits in 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export async function connect(url, log = console, { pool: injected } = {}) {
  const pool = injected || new pg.Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
  pool.on?.('error', (e) => log.warn('[store] idle client error:', e.message));
  await pool.query('SELECT 1');
  // The DDL takes heavy locks (DROP/CREATE TRIGGER, ALTER TABLE): applied only on a fresh database, never on a
  // normal boot, or two overlapping servers (a Render deploy) deadlock against each other's flushes.
  const have = await pool.query("SELECT to_regclass('public.lottery_tickets') AS t, to_regclass('public.users') AS u");
  if (!have.rows[0]?.t || !have.rows[0]?.u) await pool.query(readFileSync(join(HERE, 'schema.pg.sql'), 'utf8'));

  // Uploaded files (Arena highlight videos) outlive redeploys here. A separate schema, NOT public: loadAll()
  // reads every public table into memory at boot and must never pull video bytes with it.
  let blobs = null;
  try {
    const haveBlobs = await pool.query("SELECT to_regclass('blobs.media') AS t");
    if (!haveBlobs.rows[0]?.t) await pool.query('CREATE SCHEMA IF NOT EXISTS blobs; CREATE TABLE IF NOT EXISTS blobs.media (name TEXT PRIMARY KEY, mime TEXT, data BYTEA NOT NULL, created_at BIGINT)');
    blobs = {
      put: (name, mime, buf) => pool.query('INSERT INTO blobs.media (name, mime, data, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data', [name, mime, buf, Date.now()]),
      get: async (name) => (await pool.query('SELECT data FROM blobs.media WHERE name = $1', [name])).rows[0]?.data || null,
      del: (name) => pool.query('DELETE FROM blobs.media WHERE name = $1', [name]),
      names: async () => (await pool.query('SELECT name FROM blobs.media')).rows.map((r) => r.name),
    };
  } catch (e) { log.warn('[store] durable file storage unavailable (uploads stay on local disk only):', e.message); } // never block boot over this

  let db = null, timer = null, flushing = null, lastError = null, flushed = 0;

  /** Every table's rows, read from Postgres: { table: [row, ...] }. */
  async function loadAll() {
    const { rows: t } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const out = {};
    for (const { tablename } of t) out[tablename] = (await pool.query(`SELECT * FROM ${q(tablename)}`)).rows;
    return out;
  }

  function attach(sqlite) {
    db = sqlite;
    db.exec('CREATE TABLE IF NOT EXISTS _changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, op TEXT NOT NULL, pk TEXT NOT NULL, row TEXT)');
    const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_changes'").map((r) => r.name);
    for (const t of tables) {
      const cols = db.all(`PRAGMA table_info(${q(t)})`);
      const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
      const objNew = cols.map((c) => `'${c.name}', new.${q(c.name)}`).join(', ');
      const pkNew = pk.map((c) => `new.${q(c)}`).join(', ');
      const pkOld = pk.map((c) => `old.${q(c)}`).join(', ');
      db.exec(`DROP TRIGGER IF EXISTS _rep_i_${t}; DROP TRIGGER IF EXISTS _rep_u_${t}; DROP TRIGGER IF EXISTS _rep_d_${t};
        CREATE TRIGGER _rep_i_${t} AFTER INSERT ON ${q(t)} BEGIN INSERT INTO _changes(tbl, op, pk, row) VALUES ('${t}', 'u', json_array(${pkNew}), json_object(${objNew})); END;
        CREATE TRIGGER _rep_u_${t} AFTER UPDATE ON ${q(t)} BEGIN INSERT INTO _changes(tbl, op, pk, row) VALUES ('${t}', 'u', json_array(${pkNew}), json_object(${objNew})); END;
        CREATE TRIGGER _rep_d_${t} AFTER DELETE ON ${q(t)} BEGIN INSERT INTO _changes(tbl, op, pk, row) VALUES ('${t}', 'd', json_array(${pkOld}), NULL); END;`);
    }
    timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
    timer.unref?.();
  }

  async function applyBatch(client, tbl, ups, dels, cols, pkCols) {
    const names = cols.map((c) => c.name);
    for (let i = 0; i < ups.length; i += BATCH) {
      const chunk = ups.slice(i, i + BATCH);
      const params = [];
      const tuples = chunk.map((r) => `(${names.map((n) => { params.push(r[n] ?? null); return `$${params.length}`; }).join(', ')})`);
      const nonPk = names.filter((n) => !pkCols.includes(n));
      const onConflict = APPEND_ONLY.has(tbl) || !nonPk.length
        ? 'DO NOTHING'
        : `DO UPDATE SET ${nonPk.map((n) => `${q(n)} = EXCLUDED.${q(n)}`).join(', ')}`;
      await client.query(`INSERT INTO ${q(tbl)} (${names.map(q).join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (${pkCols.map(q).join(', ')}) ${onConflict}`, params);
    }
    for (const pk of dels) {
      await client.query(`DELETE FROM ${q(tbl)} WHERE ${pkCols.map((c, i) => `${q(c)} = $${i + 1}`).join(' AND ')}`, pk);
    }
  }

  /** Replicate pending changes. Safe to call any time; concurrent calls share one run. */
  function flush() {
    if (!db) return Promise.resolve(0);
    if (flushing) return flushing;
    flushing = (async () => {
      const pending = db.all('SELECT seq, tbl, op, pk, row FROM _changes ORDER BY seq LIMIT 5000');
      if (!pending.length) return 0;
      // keep only the latest change per row
      const last = new Map();
      for (const c of pending) last.set(`${c.tbl}|${c.pk}`, c);
      const byTable = new Map();
      for (const c of last.values()) {
        if (!byTable.has(c.tbl)) byTable.set(c.tbl, { ups: [], dels: [] });
        const b = byTable.get(c.tbl);
        if (c.op === 'u') b.ups.push(JSON.parse(c.row)); else b.dels.push(JSON.parse(c.pk));
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [tbl, b] of byTable) {
          const cols = db.all(`PRAGMA table_info(${q(tbl)})`);
          const pkCols = cols.filter((c) => c.pk > 0).sort((a, b2) => a.pk - b2.pk).map((c) => c.name);
          await applyBatch(client, tbl, b.ups, b.dels, cols, pkCols);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        lastError = e.message;
        log.warn('[store] flush failed, will retry:', e.message);
        throw e;
      } finally { client.release(); }
      db.run('DELETE FROM _changes WHERE seq <= ?', pending[pending.length - 1].seq);
      flushed += pending.length; lastError = null;
      return pending.length;
    })().finally(() => { flushing = null; });
    return flushing;
  }

  async function close() {
    if (timer) clearInterval(timer);
    try { for (let i = 0; i < 5 && db && db.get('SELECT 1 AS x FROM _changes LIMIT 1'); i++) await flush(); } catch { /* logged */ }
    await pool.end().catch(() => {});
  }

  const status = () => ({ backend: 'supabase-postgres', pending: db ? db.get('SELECT COUNT(*) AS n FROM _changes').n : 0, flushed, lastError });
  return { loadAll, attach, flush, close, status, pool, blobs };
}
