// Name + password sign-in behind a small, swappable interface.
//
//   AuthStore  { find(nameKey) -> rec|null, insert(rec), update(nameKey, patch) }
//   createAuth({ store, players, adminPassword }) -> { register, login, verifyAdmin }
//
// Two stores ship today: an in-memory one (tests) and a JSON file (data/users.json, gitignored).
// A real database only has to implement the same three methods.
// Passwords are hashed with scrypt + a per-user salt; plain passwords are never stored or logged.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const err = (status, message) => Object.assign(new Error(message), { status });
export const nameKey = (name) => String(name || '').trim().toLowerCase();

export function memoryStore(seed = {}) {
  const rows = new Map(Object.entries(seed));
  return {
    find: (k) => rows.get(k) || null,
    insert: (rec) => { rows.set(rec.key, rec); },
    update: (k, patch) => { const r = rows.get(k); if (r) rows.set(k, { ...r, ...patch }); },
    all: () => [...rows.values()],
  };
}

export function jsonFileStore(file) {
  let rows = {};
  if (existsSync(file)) { try { rows = JSON.parse(readFileSync(file, 'utf8')); } catch { rows = {}; } }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(rows, null, 1));
    renameSync(`${file}.tmp`, file); // atomic replace
  };
  return {
    find: (k) => rows[k] || null,
    insert: (rec) => { rows[rec.key] = rec; save(); },
    update: (k, patch) => { if (rows[k]) { rows[k] = { ...rows[k], ...patch }; save(); } },
    all: () => Object.values(rows),
  };
}

/** Accounts in the `users` table (replicated to Supabase). importFile: one-time import of a legacy users.json. */
export function dbStore(db, importFile) {
  const toRec = (r) => r && { key: r.key, name: r.name, salt: r.salt, hash: r.hash, playerId: r.player_id, createdAt: r.created_at, lastLogin: r.last_login };
  const insert = (rec) => db.run('INSERT INTO users(key, name, salt, hash, player_id, created_at, last_login) VALUES (?,?,?,?,?,?,?)',
    rec.key, rec.name, rec.salt, rec.hash, rec.playerId, rec.createdAt || Date.now(), rec.lastLogin ?? null);
  if (importFile && existsSync(importFile) && !db.get('SELECT 1 AS x FROM users LIMIT 1')) {
    try { for (const rec of Object.values(JSON.parse(readFileSync(importFile, 'utf8')))) insert(rec); } catch { /* unreadable legacy file: start empty */ }
  }
  return {
    find: (k) => toRec(db.get('SELECT * FROM users WHERE key = ?', k)) || null,
    insert,
    update: (k, patch) => { if (patch.lastLogin !== undefined) db.run('UPDATE users SET last_login = ? WHERE key = ?', patch.lastLogin, k); },
    all: () => db.all('SELECT * FROM users').map(toRec),
  };
}

const hashPw = (pw, salt) => scryptSync(String(pw), salt, 32).toString('hex');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createAuth({ store, players, adminPassword }) {
  function checkName(name) {
    const clean = String(name || '').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 24);
    if (clean.length < 2) throw err(400, 'Name must be 2–24 letters or numbers.');
    return clean;
  }
  function checkPw(pw) {
    if (typeof pw !== 'string' || pw.length < 4 || pw.length > 128) throw err(400, 'Password must be 4–128 characters.');
    return pw;
  }

  /** New account: a fresh player (fake-money starting balance via the ledger) bound to name + password. */
  function register(name, password) {
    const clean = checkName(name); checkPw(password);
    const k = nameKey(clean);
    if (store.find(k)) throw err(409, 'That name is already on the register. Sign in instead.');
    const { token, player } = players.create({ name: clean });
    const salt = randomBytes(16).toString('hex');
    store.insert({ key: k, name: clean, salt, hash: hashPw(password, salt), playerId: player.id, createdAt: Date.now() });
    return { token, player, created: true };
  }

  function login(name, password) {
    const rec = store.find(nameKey(name));
    if (!rec || !same(hashPw(password ?? '', rec.salt), rec.hash)) throw err(401, 'Name or password not recognised.');
    const token = players.issueToken(rec.playerId);
    store.update(rec.key, { lastLogin: Date.now() });
    return { token, player: players.get(rec.playerId), created: false };
  }

  /** "Sign in or open an account" in one step: unknown names register, known names must match. */
  function enter(name, password) {
    return store.find(nameKey(name)) ? login(name, password) : register(name, password);
  }

  const verifyAdmin = (pw) => typeof pw === 'string' && pw.length > 0 && same(hashPw(pw, 'console'), hashPw(adminPassword, 'console'));
  const accountOf = (playerId) => store.all().find((r) => r.playerId === playerId) || null;

  const known = (name) => Boolean(store.find(nameKey(name)));

  return { register, login, enter, known, verifyAdmin, accountOf };
}
