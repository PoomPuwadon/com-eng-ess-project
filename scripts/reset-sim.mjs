// `npm run reset` — start the firm's notional economy over (ledger, players, orders, agents, tickets)
// while keeping the cached real-world data (quotes, price bars, official lottery results), so no
// provider has to be called again. Stop the server first. The old database is kept as a backup.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, renameSync } from 'node:fs';
import { CONFIG } from '../server/env.js';
import { openDb } from '../server/db.js';

const file = CONFIG.dbFile;
if (!existsSync(file)) { console.log('No database yet — nothing to reset.'); process.exit(0); }
const backup = file.replace(/\.db$/, `.backup-${Date.now()}.db`);
renameSync(file, backup);
for (const ext of ['-wal', '-shm']) if (existsSync(file + ext)) renameSync(file + ext, backup + ext);
const old = new DatabaseSync(backup, { readOnly: true });
const db = openDb(file);
const KEEP = ['quotes', 'bars', 'lottery_draws', 'lottery_probe'];
for (const t of KEEP) {
  const rows = old.prepare(`SELECT * FROM ${t}`).all();
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  const ins = db.prepare(`INSERT OR REPLACE INTO ${t}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  db.exec('BEGIN');
  for (const r of rows) ins.run(...cols.map((c) => r[c]));
  db.exec('COMMIT');
  console.log(`kept ${rows.length} rows of ${t}`);
}
console.log(`Economy reset. Previous database saved as ${backup}`);
