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

  return { register, login, enter, verifyAdmin, accountOf };
}
