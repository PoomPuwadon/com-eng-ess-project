// Guest identities: a random bearer token stored in the browser. Username + password sign-in is
// Phase 1 work; this keeps a fake-money balance per browser until then.
import { randomBytes, createHash, randomInt } from 'node:crypto';
import { MINT, player } from './ledger.js';

const hash = (t) => createHash('sha256').update(t).digest('hex');
const ADJ = ['Liquid', 'Bullish', 'Hedged', 'Leveraged', 'Synergised', 'Diversified', 'Vested', 'Accredited', 'Tax-Efficient', 'Offshore'];
const NOUN = ['Associate', 'Analyst', 'Principal', 'Partner', 'Stakeholder', 'Visionary', 'Whale', 'Investor', 'Patron', 'Delegate'];

export function createPlayers(db, ledger, config) {
  function create({ name: chosen } = {}) {
    const token = randomBytes(24).toString('base64url');
    const id = randomBytes(8).toString('hex');
    const name = chosen || `${ADJ[randomInt(ADJ.length)]} ${NOUN[randomInt(NOUN.length)]} ${randomInt(100, 1000)}`;
    db.tx(() => {
      db.run('INSERT INTO players(id, token_hash, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)', id, hash(token), name, Date.now(), Date.now());
      ledger.post({ actor: 'system:onboarding', reason: 'STARTING_BALANCE', ref: id, idem: `start:${id}`,
        transfers: [{ from: MINT, to: player(id), amount: config.startingBalance }] });
    });
    return { token, player: get(id) };
  }
  const get = (id) => {
    const p = db.get('SELECT id, name, created_at FROM players WHERE id = ?', id);
    return p && { ...p, account: player(p.id), balance: ledger.balance(player(p.id)) };
  };
  function auth(token) {
    if (!token) return null;
    const h = hash(token);
    const p = db.get('SELECT id FROM players WHERE token_hash = ?', h) || db.get('SELECT player_id AS id FROM sessions WHERE token_hash = ?', h);
    if (!p) return null;
    db.run('UPDATE players SET last_seen = ? WHERE id = ?', Date.now(), p.id);
    return get(p.id);
  }
  function rename(id, name) {
    const clean = String(name || '').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 28);
    if (clean.length < 2) throw Object.assign(new Error('Display name must be 2–28 characters.'), { status: 400 });
    db.run('UPDATE players SET name = ? WHERE id = ?', clean, id);
    return get(id);
  }
  const nameOf = (id) => db.get('SELECT name FROM players WHERE id = ?', id)?.name || 'Former associate';
  /** A new bearer token for an existing player (sign-in from another device). */
  function issueToken(id) {
    const token = randomBytes(24).toString('base64url');
    db.run('INSERT INTO sessions(token_hash, player_id, created_at) VALUES (?, ?, ?)', hash(token), id, Date.now());
    return token;
  }
  /** Sign out: the token stops authenticating (its session row goes; a player's original token is replaced). */
  function revoke(token) {
    if (!token) return;
    const h = hash(token);
    db.run('DELETE FROM sessions WHERE token_hash = ?', h);
    db.run('UPDATE players SET token_hash = ? WHERE token_hash = ?', hash(randomBytes(24).toString('base64url')), h);
  }
  return { create, get, auth, rename, nameOf, issueToken, revoke };
}
