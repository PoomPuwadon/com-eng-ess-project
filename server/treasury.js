// Treasury: genesis capital, department budgets, and Autonomous Liquidity Courier (cash robot) trips.
// Every VAULT <-> DEPT movement is a trip (money-ledger skill §5): VAULT -> TRANSIT:<trip> at dispatch,
// TRANSIT -> DEPT on arrival. Nothing can go wrong in transit; trips resume after a restart.
import { MINT, VAULT, DEPT } from './ledger.js';

export const GENESIS_VAULT = 10_000_000_000; // ¤ 100,000,000.00
export const INITIAL_BUDGETS = { [DEPT.trading]: 100_000_000, [DEPT.thai]: 5_000_000, [DEPT.sports]: 2_000_000 }; // sports desk: ¤ 20,000 (VT-02 fixture positions) // ¤ 1,000,000 / ¤ 50,000
const TRIP_SECONDS = 90;

export function createTreasury(db, ledger, bus) {
  function genesis() {
    ledger.post({ actor: 'system:genesis', reason: 'TREASURY_GENESIS', idem: 'genesis:vault', transfers: [{ from: MINT, to: VAULT, amount: GENESIS_VAULT }] });
    for (const [dept, amount] of Object.entries(INITIAL_BUDGETS)) {
      if (!db.kvGet(`budget:init:${dept}`)) { dispatch(VAULT, dept, amount, 'BUDGET_DISPATCH', 'system:cfo'); db.kvSet(`budget:init:${dept}`, true); }
    }
  }

  function dispatch(from, to, amount, reason = 'BUDGET_DISPATCH', actor = 'system:cfo') {
    return db.tx(() => {
      const now = Date.now();
      const { lastInsertRowid } = db.run('INSERT INTO cash_trips(from_acct, to_acct, amount, status, reason, created_at, eta) VALUES (?, ?, ?, ?, ?, ?, ?)',
        from, to, amount, 'in_transit', reason, now, now + TRIP_SECONDS * 1000);
      const id = Number(lastInsertRowid);
      ledger.post({ actor, reason, ref: `trip:${id}`, idem: `trip:${id}:dispatch`, transfers: [{ from, to: `TRANSIT:${id}`, amount }] });
      bus?.emit('trip', { id, from, to, amount, status: 'in_transit' });
      return id;
    });
  }

  function deliverDue() {
    const due = db.all("SELECT * FROM cash_trips WHERE status = 'in_transit' AND eta <= ?", Date.now());
    for (const t of due) {
      db.tx(() => {
        ledger.post({ actor: 'system:alc', reason: t.reason === 'BUDGET_RETURN' ? 'BUDGET_RETURN' : 'BUDGET_DELIVERED', ref: `trip:${t.id}`, idem: `trip:${t.id}:deliver`,
          transfers: [{ from: `TRANSIT:${t.id}`, to: t.to_acct, amount: t.amount }] });
        db.run("UPDATE cash_trips SET status = 'delivered', delivered_at = ? WHERE id = ?", Date.now(), t.id);
      });
      bus?.emit('trip', { id: t.id, to: t.to_acct, amount: t.amount, status: 'delivered' });
    }
    return due.length;
  }

  const trips = (limit = 20) => db.all('SELECT * FROM cash_trips ORDER BY id DESC LIMIT ?', limit);
  const inTransit = (to) => db.get("SELECT COALESCE(SUM(amount), 0) AS s FROM cash_trips WHERE status = 'in_transit' AND to_acct = ?", to).s;

  return { genesis, dispatch, deliverDue, trips, inTransit };
}
