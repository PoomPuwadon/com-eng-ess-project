// Double-entry, append-only ledger (money-ledger skill). Amounts are integer minor units (1/100).
// ledger.post() is the ONLY function that changes a balance.

export const MINT = 'SYSTEM:MINT';
export const VAULT = 'VAULT';
export const EXT_MARKET = 'EXTERNAL:MARKET';
export const EXT_LOTTERY = 'EXTERNAL:LOTTERY';
export const DEPT = { trading: 'DEPT:trading_floor', thai: 'DEPT:thai_markets', sports: 'DEPT:sports_desk' };
export const player = (id) => `PLAYER:${id}`;

const MINT_REASONS = new Set(['STARTING_BALANCE', 'ADMIN_TOPUP', 'RESET', 'TREASURY_GENESIS']);
const mayGoNegative = (acct) => acct === MINT || acct.startsWith('EXTERNAL:');
const kindOf = (acct) => acct.split(':')[0];

export class LedgerError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

export function createLedger(db, { onPost } = {}) {
  const ensure = (acct) => {
    if (!db.get('SELECT 1 FROM accounts WHERE id = ?', acct)) {
      db.run('INSERT INTO accounts(id, kind, created_at) VALUES (?, ?, ?)', acct, kindOf(acct), Date.now());
      db.run('INSERT INTO balances(account_id, balance) VALUES (?, 0)', acct);
    }
  };
  const balance = (acct) => db.get('SELECT balance FROM balances WHERE account_id = ?', acct)?.balance ?? 0;

  /**
   * Post one transaction.
   * tx = { actor, reason, ref?, idem?, memo?, transfers: [{ from, to, amount }] }
   * Transfers are expanded into signed entries that always sum to zero. Returns { id, duplicate }.
   */
  function post(tx) {
    const { actor, reason, ref = null, idem = null, memo = null } = tx;
    if (!actor || !reason) throw new LedgerError('BAD_TX', 'actor and reason required');
    const legs = (tx.transfers || []).filter((t) => t.amount !== 0);
    for (const t of legs) {
      if (!Number.isSafeInteger(t.amount) || t.amount < 0) throw new LedgerError('BAD_AMOUNT', `amount must be a non-negative integer (got ${t.amount})`);
      if (!t.from || !t.to || t.from === t.to) throw new LedgerError('BAD_TX', 'transfer needs distinct from/to');
      if ((t.from === MINT || t.to === MINT) && !MINT_REASONS.has(reason)) throw new LedgerError('MINT_FORBIDDEN', `reason ${reason} may not touch ${MINT}`);
    }
    return db.tx(() => {
      if (idem) {
        const dup = db.get('SELECT id FROM transactions WHERE idem = ?', idem);
        if (dup) return { id: dup.id, duplicate: true };
      }
      const delta = new Map();
      for (const t of legs) {
        delta.set(t.from, (delta.get(t.from) || 0) - t.amount);
        delta.set(t.to, (delta.get(t.to) || 0) + t.amount);
      }
      let sum = 0;
      for (const v of delta.values()) sum += v;
      if (sum !== 0) throw new LedgerError('UNBALANCED', 'entries must sum to zero');
      for (const [acct, d] of delta) {
        ensure(acct);
        const nb = balance(acct) + d;
        if (nb < 0 && !mayGoNegative(acct)) throw new LedgerError('INSUFFICIENT', `${acct} would go negative`);
      }
      const { lastInsertRowid: id } = db.run('INSERT INTO transactions(created_at, actor, reason, ref, idem, memo) VALUES (?, ?, ?, ?, ?, ?)',
        Date.now(), actor, reason, ref, idem, memo);
      for (const [acct, d] of delta) {
        if (d === 0) continue;
        db.run('INSERT INTO entries(tx_id, account_id, amount) VALUES (?, ?, ?)', id, acct, d);
        db.run('UPDATE balances SET balance = balance + ? WHERE account_id = ?', d, acct);
      }
      if (onPost) onPost({ id: Number(id), reason, delta });
      return { id: Number(id), duplicate: false };
    });
  }

  /** Reconciler (money-ledger §3): recompute balances from entries and check every invariant. */
  function reconcile() {
    const problems = [];
    const total = db.get('SELECT COALESCE(SUM(balance), 0) AS s FROM balances').s;
    if (total !== 0) problems.push(`conservation: balances sum to ${total}`);
    const drift = db.all(`SELECT b.account_id, b.balance, COALESCE(e.s, 0) AS s FROM balances b
      LEFT JOIN (SELECT account_id, SUM(amount) AS s FROM entries GROUP BY account_id) e ON e.account_id = b.account_id
      WHERE b.balance != COALESCE(e.s, 0)`);
    for (const d of drift) problems.push(`drift: ${d.account_id} balance ${d.balance} != entries ${d.s}`);
    const neg = db.all("SELECT account_id, balance FROM balances WHERE balance < 0 AND account_id != ? AND account_id NOT LIKE 'EXTERNAL:%'", MINT);
    for (const n of neg) problems.push(`negative: ${n.account_id} = ${n.balance}`);
    const unbalanced = db.all('SELECT tx_id, SUM(amount) AS s FROM entries GROUP BY tx_id HAVING SUM(amount) != 0');
    for (const u of unbalanced) problems.push(`unbalanced tx ${u.tx_id}`);
    return { ok: problems.length === 0, problems, checkedAt: Date.now() };
  }

  return { post, balance, ensure, reconcile };
}

/** Format minor units for UI: 123456 -> "1,234.56" */
export const fmt = (minor) => (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
