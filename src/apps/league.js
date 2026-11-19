// Model League card: Claude v Gemini v the rule book, scored on real outcomes (server/agents/league.js).
// Shared by the Markets terminal, the Research Institute and the Sports Desk.
import { fmt, esc } from '../net/api.js';

const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const swatch = (f) => `<span class="lg-dot" style="background:${f.color}"></span>`;
const routeOf = (llm, agent) => llm?.routes?.[agent];
export const modelTag = (model) => (!model ? 'rule book' : model);

/** focus: 'trading' | 'lottery' | 'all' — which department leads the table */
export function leagueCard(league, llm, focus = 'all') {
  if (!league) return '';
  const fams = league.families;
  const leader = fams.find((f) => f.id !== 'rules' && (f.trading.fills || f.lottery.tickets || f.llm.calls));
  const keyFor = (f) => (focus === 'trading' ? f.trading.pnl : focus === 'lottery' ? f.lottery.net : f.total);
  const rows = [...fams].sort((a, b) => keyFor(b) - keyFor(a));
  const live = (llm?.providers || []).map((p) => p.name);
  const status = (id) => (id === 'rules' ? '<span class="pill">fallback</span>' : live.includes(id) ? '<span class="pill ok">live</span>' : '<span class="pill warn">no key</span>');
  const desks = focus !== 'lottery' && league.desks?.length ? `
    <table class="t" style="margin-top:10px"><tr><th>Trading desk</th><th>Style</th><th>Model now</th><th class="r">Sleeve</th><th class="r">P&amp;L</th><th class="r">Return</th><th class="r">Fills</th><th class="r">Win rate</th></tr>
      ${league.desks.map((d) => `<tr><td><b>${esc(d.desk)}</b></td><td class="muted">${esc(d.style)}</td><td>${d.route ? esc(d.route.model) : '<span class="muted">rule book</span>'}</td>
        <td class="r">${fmt(d.nav, { dp: 0 })}</td><td class="r ${cls(d.pnl)}">${fmt(d.pnl, { sign: true, dp: 0 })}</td><td class="r ${cls(d.pnl)}">${d.nav ? ((d.pnl / d.nav) * 100).toFixed(2) : '0.00'}%</td>
        <td class="r">${d.fills}</td><td class="r">${d.closes ? `${Math.round((d.wins / d.closes) * 100)}%` : '—'}</td></tr>`).join('')}
    </table>` : '';
  const ai = rows.filter((f) => f.id !== 'rules');
  const top = ai[0], tied = ai.length > 1 && keyFor(ai[0]) === keyFor(ai[1]);
  const pill = !leader ? '<span class="pill warn">awaiting first AI decisions</span>'
    : tied ? '<span class="pill">level on P&amp;L</span>' : `<span class="pill ${top.id}">leader: ${esc(top.label)}</span>`;
  return `<div class="card model-league"><h3>Model League · Claude v Gemini ${pill}</h3>
    <div class="scroll"><table class="t"><tr><th>#</th><th>Model</th><th></th>
      <th class="r">Trading P&amp;L</th><th class="r">Fills</th><th class="r">Win rate</th>
      <th class="r">Thai desk net</th><th class="r">Certificates</th>
      <th class="r">Total</th><th class="r">AI calls</th><th class="r">AI cost</th></tr>
      ${rows.map((f, i) => `<tr${f.id === 'rules' ? ' class="muted"' : ''}><td class="muted">${i + 1}</td><td>${swatch(f)}<b>${esc(f.label)}</b>${f.trading.models?.length ? `<div class="muted" style="font-size:11px">${esc(f.trading.models.join(', '))}</div>` : ''}</td><td>${status(f.id)}</td>
        <td class="r ${cls(f.trading.pnl)}">${fmt(f.trading.pnl, { sign: true, dp: 0 })}</td><td class="r">${f.trading.fills}</td><td class="r">${f.trading.closes ? `${Math.round((f.trading.wins / f.trading.closes) * 100)}%` : '—'}</td>
        <td class="r ${cls(f.lottery.net)}">${f.lottery.tickets ? fmt(f.lottery.net, { sign: true, dp: 0 }) : '—'}</td><td class="r">${f.lottery.tickets ? `${f.lottery.tickets}${f.lottery.wins ? ` · ${f.lottery.wins} won` : ''}` : '—'}</td>
        <td class="r ${cls(f.total)}"><b>${fmt(f.total, { sign: true, dp: 0 })}</b></td><td class="r">${f.llm.calls}</td><td class="r">${f.id === 'rules' ? '—' : `$${f.llm.usd.toFixed(3)}`}</td></tr>`).join('')}
    </table></div>${desks}
    <div class="muted" style="font-size:11px;margin-top:6px">Every order, fill and certificate records the model that decided it. Trading P&amp;L is credited to the model that bought each lot (FIFO), marked at the delayed price. Rule book = decisions made with no AI (no key, cost cap, or an AI error).
      ${routeOf(llm, 'head_trader') || routeOf(llm, 'co_head_trader') ? '' : ' Add ANTHROPIC_API_KEY and/or GEMINI_API_KEY to .env.local to start the league.'}</div></div>`;
}

/** small "who wrote this" tag for agent reports */
export const writtenBy = (report) => (report?.llm ? ` · written by ${esc(report.data?.model || 'the LLM')}` : ' · rule book');
