// OT-01 boards: the AI DESK BOARD (front, faces the portal) and the RESEARCH WALL (back, faces the pit).
// Pure drawing from feed.js state: nothing here invents data. Redrawn on events / every 2 s by Board.tick.
import { Board, font, rrect, wrap, drawChip, drawRows, drawHeader } from './thoughtBoard.js';
import { COL, latest, status, research, book, outcomeColor, offline, agoShort, llmInfo } from './feed.js';

export const NAMES = { head_trader: 'Chad Whitmore III', co_head_trader: 'Priya Ramanathan-Cole', quant: 'Dr. Tobias Wren', risk_officer: 'Marcus Adeyemi-Park' };

/** one row per order: proposal -> CLEARED / VETOED / REJECTED -> FILLED; signals and the open plan ride along as plain rows */
export function orderRows(events, n = 7) {
  const rows = [], byRef = new Map();
  for (const e of events) {
    if (e.stage === 'proposal' && e.ref && e.ref !== 'memo') { const r = { ev: e, text: e.text, outcome: null, at: e.at }; rows.push(r); byRef.set(e.ref, r); }
    else if (['veto', 'execute', 'result'].includes(e.stage) && e.ref && byRef.has(e.ref)) {
      const r = byRef.get(e.ref);
      if (e.stage === 'veto') { r.outcome = 'vetoed'; r.text = e.text; r.at = e.at; }
      else if (e.stage === 'execute') { r.outcome = 'cleared'; r.at = e.at; }
      else if (e.outcome === 'rejected') { r.outcome = 'rejected'; r.text = e.text; r.at = e.at; }
    } else if (e.stage === 'result' && e.outcome === 'filled') {
      const d = e.data || {};
      const r = [...rows].reverse().find((x) => x.outcome === 'cleared' && x.ev.data?.symbol === d.symbol && x.ev.data?.side === d.side && x.ev.data?.qty === d.qty);
      if (r) { r.outcome = 'filled'; r.text = `${r.ev.text.split(' — ')[0]} @ ${(d.price / 100).toFixed(2)} — ${r.ev.data?.rationale || ''}`; r.at = e.at; }
    } else if (e.stage === 'signal' && e.ref === 'note') rows.push({ ev: e, text: e.text, outcome: null, at: e.at });
  }
  return rows.slice(-n).map((r) => ({ ...r.ev, text: r.text, outcome: r.outcome, at: r.at }));
}

const TRADING_STAGES = ['proposal', 'veto', 'execute', 'result', 'signal'];
const money = (m) => `${m >= 0 ? '+' : '−'}¤${Math.abs(m / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function bar(g, x, y, w, label, pnl, max, who) {
  font(g, 30, 800); g.fillStyle = who; g.textBaseline = 'top'; g.fillText(label, x, y);
  const cx = x + w / 2, bw = Math.min(w / 2, (Math.abs(pnl) / max) * (w / 2));
  rrect(g, x, y + 40, w, 24, 8, 'rgba(255,255,255,.07)');
  rrect(g, pnl >= 0 ? cx : cx - bw, y + 40, Math.max(6, bw), 24, 8, pnl >= 0 ? COL.good : COL.bad);
  font(g, 28, 800); g.fillStyle = pnl >= 0 ? COL.good : COL.bad; g.fillText(money(pnl), x, y + 70);
}

export function makeDeskBoard() {
  return new Board({ w: 8, h: 3.6, px: 256, name: 'ai-desk-board', draw: (g, W, H) => {
    const st = status('OT-01'), closed = st.market === 'closed';
    if (offline()) { drawHeader(g, W, 'AI DESK BOARD', 'AI FEED OFFLINE · the building server is not answering', 'NEXT DECISION', 0, COL.bad); return; }
    drawHeader(g, W, closed ? 'MARKET CLOSED · RESEARCH MODE' : 'AI DESK BOARD', closed ? 'Agents research markets and news; trading resumes at the open' : 'Live orders from four named agents · every row is a real decision',
      closed ? 'MARKET OPENS IN' : 'NEXT DECISION', closed ? st.nextOpenAt : st.nextAt, closed ? COL.gemini : COL.gold);
    const rows = closed ? latest('OT-01', 7, ['research']).filter((e) => e.data?.kind !== 'market').map((e) => (e.data?.kind === 'headline' && !e.data.none ? { ...e, outcome: e.data.impact } : e)) : orderRows(latest('OT-01', 80, TRADING_STAGES));
    drawRows(g, 30, 190, W - 60, H - 190 - 150, rows, { names: NAMES, show: 5, rowH: 122, px: 38 });
    const b = book(), desks = b?.league?.desks || [], fam = b?.league?.families || [];
    const y0 = H - 138; g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y0 - 8, W, 2);
    const max = Math.max(1, ...desks.map((d) => Math.abs(d.pnl)), ...fam.map((f) => Math.abs(f.trading?.pnl || 0)));
    desks.forEach((d, i) => bar(g, 40 + i * 520, y0, 470, `${d.desk} · ${d.agent === 'head_trader' ? 'CLAUDE' : 'GEMINI'}`, d.pnl, max, d.agent === 'head_trader' ? COL.claude : COL.gemini));
    font(g, 26, 800); g.fillStyle = '#9aa3b2'; g.textBaseline = 'top'; g.fillText('MODEL LEAGUE · trading P&L', 1130, y0);
    fam.forEach((f, i) => { const p = f.trading?.pnl || 0; font(g, 28, 800); g.fillStyle = f.id === 'claude' ? COL.claude : f.id === 'gemini' ? COL.gemini : COL.rules; g.fillText(f.label.toUpperCase(), 1130 + i * 300, y0 + 38); g.fillStyle = p >= 0 ? COL.good : COL.bad; g.fillText(money(p), 1130 + i * 300, y0 + 72); });
    if (!desks.length) { font(g, 28, 700); g.fillStyle = '#7b8498'; g.fillText('Desk scoreline loads with the firm book.', 40, y0 + 20); }
    const info = llmInfo(); if (info && !info.enabled) { font(g, 24, 800); g.textAlign = 'right'; g.fillStyle = COL.rules; g.fillText('NO MODEL KEY: RULE BOOK DECISIONS', W - 30, H - 36); g.textAlign = 'left'; }
  } });
}

export function makeResearchWall() {
  return new Board({ w: 8, h: 3.6, px: 256, name: 'ai-research-wall', draw: (g, W, H) => {
    const st = status('OT-01'), r = research(), closed = st.market === 'closed';
    drawHeader(g, W, 'RESEARCH WALL', r ? `${r.mode === 'llm' ? 'Model research' : 'RULE BOOK research'} · ${agoShort(r.at)} ago · ${r.source === 'none' ? 'no news source' : r.source}` : 'Overnight market and news research appears here while the market is closed',
      closed ? 'NEXT RESEARCH' : 'MARKET OPEN', closed ? st.nextResearchAt : null, COL.gemini);
    const heads = latest('OT-01', 60, ['research']).filter((e) => e.data?.kind === 'headline' && !e.data.none).slice(-4).reverse();
    heads.forEach((e, i) => {
      const w = (W - 80) / 2, x = 30 + (i % 2) * (w + 20), y = 190 + Math.floor(i / 2) * 330, d = e.data, col = outcomeColor(d.impact);
      rrect(g, x, y, w, 308, 18, 'rgba(255,255,255,.06)', col, 4);
      font(g, 70, 900); g.fillStyle = '#f6efe0'; g.textBaseline = 'top'; g.fillText(d.symbol, x + 24, y + 18);
      g.fillStyle = col; g.textAlign = 'right'; g.fillText(d.impact === 'bullish' ? '▲' : d.impact === 'bearish' ? '▼' : '•', x + w - 24, y + 14); g.textAlign = 'left';
      font(g, 33, 700); g.fillStyle = '#e8ecf5'; wrap(g, d.headline, w - 48, 2).forEach((l, k) => g.fillText(l, x + 24, y + 104 + k * 40));
      font(g, 28, 600); g.fillStyle = '#9aa3b2'; wrap(g, d.reason, w - 48, 2).forEach((l, k) => g.fillText(l, x + 24, y + 196 + k * 34));
      drawChip(g, e, x + 24, y + 262, 22);
    });
    if (!heads.length) { font(g, 40, 700); g.fillStyle = '#7b8498'; g.textBaseline = 'top'; g.fillText(closed ? 'No tracked-symbol headlines yet. The next research cycle is on the countdown.' : 'The market is open: the desks are trading. Research resumes after the close.', 40, 230); }
    const plan = latest('OT-01', 60, ['research']).filter((e) => e.data?.kind === 'plan').pop();
    if (plan) { rrect(g, 30, H - 118, W - 60, 96, 14, 'rgba(90,162,255,.12)', COL.gemini, 3); font(g, 30, 800); g.fillStyle = COL.gemini; g.textBaseline = 'top'; g.fillText('OPEN PLAN', 50, H - 108); font(g, 30, 600); g.fillStyle = '#e8ecf5'; wrap(g, plan.text, W - 330, 2).forEach((l, i) => g.fillText(l, 260, H - 108 + i * 36)); }
  } });
}
