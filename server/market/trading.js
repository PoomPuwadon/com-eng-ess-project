// Order book for players and the firm's Trading Floor desk. Long-only, whole shares.
// Fills happen at the latest delayed quote. Orders sent while the US market is closed queue and fill
// at the first fresh price after the open (unless SIM_ALLOW_CLOSED_FILLS=1 for testing).
// Ledger recipe (money-ledger §4): buys reserve cash owner -> ESCROW:ORDER:<id>, fills pay
// ESCROW -> EXTERNAL:MARKET; sells pay EXTERNAL:MARKET -> owner.
import { EXT_MARKET } from '../ledger.js';
import { marketStatus } from '../time.js';
import { SYMBOLS } from './data.js';

const MAX_QTY = 1_000_000;
const STALE_MS = 30 * 60_000;
const escrow = (id) => `ESCROW:ORDER:${id}`;
const minor = (price) => Math.round(price * 100);
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

export function createTrading(db, ledger, market, bus, config) {
  function placeOrder(owner, o, meta = {}) {
    const symbol = String(o.symbol || '').toUpperCase();
    const side = o.side === 'sell' ? 'sell' : o.side === 'buy' ? 'buy' : null;
    const qty = Number(o.qty);
    const type = o.type === 'limit' ? 'limit' : 'market';
    if (!SYMBOLS.includes(symbol)) throw err('That instrument is not on the firm\'s approved list.');
    if (!side) throw err('Side must be buy or sell.');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw err('Quantity must be a whole number of shares.');
    const q = market.quote(symbol);
    if (!q || !(q.price > 0)) throw err('Pricing under review. Markets will reopen shortly.', 409);
    const limit = type === 'limit' ? minor(Number(o.limit)) : null;
    if (type === 'limit' && !(limit > 0)) throw err('Enter a limit price.');
    // one working order per symbol per agent (the two trading desks may each work the same name)
    if (meta.agent && db.get("SELECT 1 FROM orders WHERE owner = ? AND symbol = ? AND status = 'pending' AND agent = ?", owner, symbol, meta.agent)) throw err('An order for this instrument is already working.', 409);

    return db.tx(() => {
      const now = Date.now();
      const { lastInsertRowid } = db.run('INSERT INTO orders(owner, symbol, side, qty, type, limit_price, status, created_at, agent, rationale, model) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        owner, symbol, side, qty, type, limit, 'pending', now, meta.agent || null, meta.rationale ? String(meta.rationale).slice(0, 400) : null, meta.model || null);
      const id = Number(lastInsertRowid);
      if (side === 'buy') {
        const reserve = type === 'limit' ? limit * qty : Math.ceil(minor(q.price) * qty * 1.05); // 5 % collar on market orders
        if (ledger.balance(owner) < reserve) throw err('Insufficient liquidity for this allocation (market orders reserve price + 5 %).', 402);
        ledger.post({ actor: meta.actor || owner, reason: 'ORDER_RESERVE', ref: `order:${id}`, idem: `order:${id}:reserve`, transfers: [{ from: owner, to: escrow(id), amount: reserve }] });
        db.run('UPDATE orders SET reserved = ? WHERE id = ?', reserve, id);
      } else {
        const pos = db.get('SELECT qty, reserved_qty FROM positions WHERE owner = ? AND symbol = ?', owner, symbol);
        if (!pos || pos.qty - pos.reserved_qty < qty) throw err('You do not hold enough unreserved shares to sell.');
        db.run('UPDATE positions SET reserved_qty = reserved_qty + ? WHERE owner = ? AND symbol = ?', qty, owner, symbol);
      }
      const order = db.get('SELECT * FROM orders WHERE id = ?', id);
      bus.emit('order', { owner, order });
      return order;
    });
  }

  function cancelOrder(owner, id, reason = 'cancelled') {
    return db.tx(() => {
      const o = db.get("SELECT * FROM orders WHERE id = ? AND owner = ? AND status = 'pending'", id, owner);
      if (!o) throw err('No working order with that id.', 404);
      if (o.side === 'buy' && o.reserved) ledger.post({ actor: owner, reason: 'ORDER_RELEASE', ref: `order:${id}`, idem: `order:${id}:release`, transfers: [{ from: escrow(id), to: owner, amount: o.reserved }] });
      if (o.side === 'sell') db.run('UPDATE positions SET reserved_qty = reserved_qty - ? WHERE owner = ? AND symbol = ?', o.qty, owner, o.symbol);
      db.run('UPDATE orders SET status = ?, note = ? WHERE id = ?', 'cancelled', reason, id);
      return db.get('SELECT * FROM orders WHERE id = ?', id);
    });
  }

  function fill(o, px) {
    return db.tx(() => {
      const now = Date.now();
      const gross = px * o.qty;
      let realized = null;
      if (o.side === 'buy') {
        const transfers = [{ from: escrow(o.id), to: EXT_MARKET, amount: Math.min(gross, o.reserved) }];
        if (gross > o.reserved) transfers.push({ from: o.owner, to: EXT_MARKET, amount: gross - o.reserved });
        else if (o.reserved > gross) transfers.push({ from: escrow(o.id), to: o.owner, amount: o.reserved - gross });
        ledger.post({ actor: 'system:execution', reason: 'EXTERNAL_TRADE', ref: `order:${o.id}`, idem: `order:${o.id}:fill`, transfers });
        db.run(`INSERT INTO positions(owner, symbol, qty, cost) VALUES (?,?,?,?) ON CONFLICT(owner, symbol) DO UPDATE SET qty = qty + excluded.qty, cost = cost + excluded.cost`, o.owner, o.symbol, o.qty, gross);
      } else {
        const pos = db.get('SELECT * FROM positions WHERE owner = ? AND symbol = ?', o.owner, o.symbol);
        const costOut = Math.round((pos.cost * o.qty) / pos.qty);
        realized = gross - costOut;
        ledger.post({ actor: 'system:execution', reason: 'EXTERNAL_TRADE', ref: `order:${o.id}`, idem: `order:${o.id}:fill`, transfers: [{ from: EXT_MARKET, to: o.owner, amount: gross }] });
        db.run('UPDATE positions SET qty = qty - ?, cost = cost - ?, reserved_qty = reserved_qty - ?, realized = realized + ? WHERE owner = ? AND symbol = ?', o.qty, costOut, o.qty, realized, o.owner, o.symbol);
      }
      db.run("UPDATE orders SET status = 'filled', fill_price = ?, filled_at = ? WHERE id = ?", px, now, o.id);
      db.run('INSERT INTO trades(owner, symbol, side, qty, price, amount, realized, order_id, agent, rationale, created_at, model) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        o.owner, o.symbol, o.side, o.qty, px, gross, realized, o.id, o.agent, o.rationale, now, o.model || null);
      const trade = { owner: o.owner, symbol: o.symbol, side: o.side, qty: o.qty, price: px, amount: gross, realized, agent: o.agent, model: o.model || null, rationale: o.rationale, at: now };
      bus.emit('trade', trade);
      return trade;
    });
  }

  /** Executor: called every few seconds. */
  function processPending() {
    const ms = marketStatus();
    const canTrade = ms.open || config.allowClosedFills;
    if (!canTrade) return 0;
    let n = 0;
    for (const o of db.all("SELECT * FROM orders WHERE status = 'pending' ORDER BY id")) {
      const q = market.quote(o.symbol);
      if (!q) continue;
      if (ms.open && Date.now() - q.as_of > STALE_MS && !config.allowClosedFills) continue; // provider lagging: wait for a fresh price
      const px = minor(q.price);
      if (o.type === 'limit' && ((o.side === 'buy' && px > o.limit_price) || (o.side === 'sell' && px < o.limit_price))) continue;
      try { fill(o, px); n++; } catch (e) {
        try { cancelOrder(o.owner, o.id, `rejected at fill: ${e.message}`); } catch { /* already gone */ }
      }
    }
    return n;
  }

  function portfolio(owner) {
    const cash = ledger.balance(owner);
    const pending = db.all("SELECT * FROM orders WHERE owner = ? AND status = 'pending' ORDER BY id DESC", owner);
    const reserved = pending.reduce((s, o) => s + (o.side === 'buy' ? o.reserved : 0), 0);
    const rows = db.all('SELECT * FROM positions WHERE owner = ? AND qty > 0 ORDER BY symbol', owner);
    const positions = rows.map((p) => {
      const q = market.quote(p.symbol);
      const px = q ? minor(q.price) : Math.round(p.cost / p.qty);
      const value = px * p.qty;
      return { symbol: p.symbol, name: q?.name, qty: p.qty, reservedQty: p.reserved_qty, cost: p.cost, avg: Math.round(p.cost / p.qty), price: px,
        value, unrealized: value - p.cost, dayChange: q?.prev_close ? q.price / q.prev_close - 1 : 0, realized: p.realized };
    });
    const invested = positions.reduce((s, p) => s + p.value, 0);
    const realized = db.get('SELECT COALESCE(SUM(realized), 0) AS r FROM positions WHERE owner = ?', owner).r;
    return { owner, cash, reserved, invested, nav: cash + reserved + invested, positions, pending, realized,
      unrealized: positions.reduce((s, p) => s + p.unrealized, 0) };
  }

  const trades = (owner, limit = 50) => db.all('SELECT * FROM trades WHERE owner = ? ORDER BY id DESC LIMIT ?', owner, limit);
  const orders = (owner, limit = 50) => db.all('SELECT * FROM orders WHERE owner = ? ORDER BY id DESC LIMIT ?', owner, limit);

  function snapshotNav(owners) {
    const t = Math.floor(Date.now() / 300_000) * 300_000;
    for (const owner of owners) db.run('INSERT OR REPLACE INTO nav_history(owner, t, nav) VALUES (?,?,?)', owner, t, portfolio(owner).nav);
  }
  const navHistory = (owner, limit = 600) => db.all('SELECT t, nav FROM nav_history WHERE owner = ? ORDER BY t DESC LIMIT ?', owner, limit).reverse();

  function leaderboard(players, startingBalance, limit = 15) {
    const owners = db.all("SELECT DISTINCT owner FROM trades WHERE owner LIKE 'PLAYER:%'").map((r) => r.owner);
    return owners.map((owner) => {
      const p = portfolio(owner);
      const id = owner.slice(7);
      return { name: players.nameOf(id), nav: p.nav, ret: p.nav / startingBalance - 1, positions: p.positions.length };
    }).sort((a, b) => b.nav - a.nav).slice(0, limit);
  }

  return { placeOrder, cancelOrder, processPending, portfolio, trades, orders, snapshotNav, navHistory, leaderboard, fill };
}
