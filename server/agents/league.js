// Model League: Claude v Gemini (v the rule book), scored on real outcomes in every department where an AI
// makes money decisions. Every order, fill and certificate records the model that decided it.
//   Trading Floor: FIFO lots per desk and symbol; P&L (realised + unrealised at the delayed price) is credited
//                  to the model that BOUGHT the lot (the decision that picked the stock).
//   Thai Markets:  certificates the desk bought, by model: cost, settled payouts, net.
//   LLM usage:     calls and USD from llm_spend (what each model cost to run).
import { DEPT } from '../ledger.js';

export const FAMILIES = [
  { id: 'claude', label: 'Claude', color: '#d97757' },
  { id: 'gemini', label: 'Gemini', color: '#4f8df5' },
  { id: 'rules', label: 'Rule book', color: '#9aa0a6' },
];
export const familyOf = (model) => (!model || model === 'rules' ? 'rules' : model.startsWith('gemini') ? 'gemini' : model.startsWith('claude') ? 'claude' : 'rules');

export function createLeague({ db, market, desk }) {
  function trading() {
    const out = Object.fromEntries(FAMILIES.map((f) => [f.id, { pnl: 0, realized: 0, unrealized: 0, fills: 0, closes: 0, wins: 0, models: new Set() }]));
    const lots = new Map(); // `${agent}|${symbol}` -> [{ qty, px, fam }]
    for (const t of db.all('SELECT agent, symbol, side, qty, price, model FROM trades WHERE owner = ? AND agent IS NOT NULL ORDER BY id', DEPT.trading)) {
      const k = `${t.agent}|${t.symbol}`, fam = familyOf(t.model);
      const q = lots.get(k) || []; lots.set(k, q);
      if (t.side === 'buy') { q.push({ qty: t.qty, px: t.price, fam }); out[fam].fills++; if (t.model && t.model !== 'rules') out[fam].models.add(t.model); continue; }
      out[fam].fills++;
      let left = t.qty;
      const byFam = {};
      while (left > 0 && q.length) {
        const lot = q[0], n = Math.min(left, lot.qty);
        byFam[lot.fam] = (byFam[lot.fam] || 0) + n * (t.price - lot.px);
        lot.qty -= n; left -= n; if (!lot.qty) q.shift();
      }
      for (const [f, r] of Object.entries(byFam)) { out[f].realized += r; if (r !== 0) { out[f].closes++; if (r > 0) out[f].wins++; } } // flat closes are neither
    }
    for (const [k, q] of lots) {
      const quote = market.quote(k.split('|')[1]);
      if (!quote) continue;
      const px = Math.round(quote.price * 100);
      for (const lot of q) out[lot.fam].unrealized += lot.qty * (px - lot.px);
    }
    for (const f of Object.values(out)) { f.pnl = f.realized + f.unrealized; f.models = [...f.models]; }
    return out;
  }

  function lottery() {
    const out = Object.fromEntries(FAMILIES.map((f) => [f.id, { tickets: 0, cost: 0, payout: 0, settled: 0, wins: 0, net: 0 }]));
    for (const t of db.all('SELECT price, status, payout, model FROM lottery_tickets WHERE owner = ?', DEPT.thai)) {
      const o = out[familyOf(t.model)];
      o.tickets++; o.cost += t.price;
      if (t.status === 'settled') { o.settled++; o.payout += t.payout || 0; if (t.payout > 0) o.wins++; }
    }
    for (const o of Object.values(out)) o.net = o.payout - o.cost;
    return out;
  }

  function usage() {
    const out = Object.fromEntries(FAMILIES.map((f) => [f.id, { calls: 0, usd: 0 }]));
    for (const r of db.all('SELECT model, COUNT(*) AS n, COALESCE(SUM(usd), 0) AS usd FROM llm_spend GROUP BY model')) {
      const o = out[familyOf(r.model)]; o.calls += r.n; o.usd += r.usd;
    }
    return out;
  }

  /** the full table: one row per model family, a column group per department, plus the two trading desks */
  function table() {
    const tr = trading(), lo = lottery(), us = usage();
    const families = FAMILIES.map((f) => ({ ...f, trading: tr[f.id], lottery: lo[f.id], llm: { ...us[f.id], usd: +us[f.id].usd.toFixed(4) }, total: tr[f.id].pnl + lo[f.id].net }))
      .sort((a, b) => b.total - a.total);
    return { at: Date.now(), families, desks: desk.sleeves().map(({ positions, ...d }) => ({ ...d, positions: positions.length })) };
  }

  return { table, trading, lottery, usage };
}
