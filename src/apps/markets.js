// Markets terminal: the firm's public AI book (positions, fills with rationale, agent reports),
// a trade ticket on real delayed US prices, the visitor's own portfolio, and a leaderboard.
import { registerApp } from './shell.js';
import { api, on, fmt, pct, px, ago, esc, setBalance, getMe } from '../net/api.js';
import { lineChart } from './charts.js';
import { leagueCard, writtenBy } from './league.js';

const AGENT_INITIALS = { head_trader: 'A', co_head_trader: 'B', quant: 'Q', risk_officer: 'RO' };
const AGENT_SHORT = { head_trader: 'Desk A', co_head_trader: 'Desk B' };
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const until = (ms) => { const s = Math.max(0, (ms - Date.now()) / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const tfmt = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

let quotes = null; // shared snapshot (also used by the 3D trading floor)
export const getQuotes = () => quotes;

registerApp('markets', {
  title: 'Markets Terminal',
  sub: 'Real US equities · delayed prices · notional capital',
  mount(body, ctx) {
    let tab = 'firm', sel = 'SPY', chartRange = '1d', firm = null, mine = null, chart = null, side = 'buy', type = 'market';
    const offs = [];
    const status = () => {
      if (!quotes) return 'Connecting to market data…';
      const m = quotes.market, last = Math.max(...quotes.quotes.map((q) => q.asOf || 0));
      return `${m.open ? '● Market open' : `○ Market closed — opens in ${m.nextOpen ? until(m.nextOpen) : '—'}`} · ${quotes.source} · ${quotes.delayNote} · prices as of ${last ? tfmt(last) : '—'}`;
    };
    const header = () => ctx.setSub(status());

    // ------------------------------------------------------------ firm book
    function renderFirm() {
      if (!firm) { body.innerHTML = '<div class="empty">Loading the firm book…</div>'; return; }
      const b = firm.book, start = 100_000_000, pnl = b.nav - start;
      const agents = Object.fromEntries(firm.agents.map((a) => [a.agent, a]));
      const ht = agents.head_trader, ch = agents.co_head_trader, q = agents.quant, ro = agents.risk_officer;
      const routes = firm.llm.routes || {};
      const modelPill = (id) => { const r = routes[id]; return r ? `<span class="pill ${r.provider === 'claude' ? 'claude' : 'gemini'}">${esc(r.model)}</span>` : '<span class="pill">rule book</span>'; };
      const sig = q?.reports[0]?.data?.signals || [];
      body.innerHTML = `
        <div class="grid g4">
          <div class="card"><h3>Net asset value</h3><div class="kpi">${fmt(b.nav, { dp: 0 })}<small>Trading Floor book · started ${fmt(start, { dp: 0 })}</small></div></div>
          <div class="card"><h3>Total P&amp;L</h3><div class="kpi ${cls(pnl)}">${fmt(pnl, { sign: true, dp: 0 })}<small>${pct(pnl / start)} · realised ${fmt(b.realized, { sign: true, dp: 0 })}</small></div></div>
          <div class="card"><h3>Invested</h3><div class="kpi">${((b.invested / Math.max(b.nav, 1)) * 100).toFixed(1)}%<small>${b.positions.length} positions · ${b.pending.length} working orders</small></div></div>
          <div class="card"><h3>Cash</h3><div class="kpi">${fmt(b.cash, { dp: 0 })}<small>reserved for orders ${fmt(b.reserved, { dp: 0 })}${firm.budget.inTransit ? ` · ${fmt(firm.budget.inTransit, { dp: 0 })} with the ALC` : ''}</small></div></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>Latest buys <span class="pill">${b.pending.filter((o) => o.side === 'buy').length} buy orders working</span></h3><table class="t">
          ${b.pending.filter((o) => o.side === 'buy').map((o) => `<tr><td class="muted">${ago(o.created_at)}</td><td>${esc(AGENT_SHORT[o.agent] || '')}</td><td><span class="pill warn">WORKING</span> <b>${o.symbol}</b></td><td class="r">${o.qty}</td><td class="muted">${esc(o.rationale || '')}</td></tr>`).join('')}
          ${firm.trades.filter((t) => t.side === 'buy').slice(0, 10).map((t) => `<tr><td class="muted">${tfmt(t.created_at)}</td><td>${esc(AGENT_SHORT[t.agent] || (t.agent ? 'Desk A' : '—'))} <span class="muted" style="font-size:11px">${esc(t.model && t.model !== 'rules' ? t.model : 'rule book')}</span></td><td><span class="pill ok">BOUGHT</span> <b>${t.symbol}</b></td><td class="r">${t.qty} @ ${px(t.price / 100)}</td><td class="muted">${esc(t.rationale || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No buys yet. Orders sent while the market is closed fill at the next open.</td></tr>'}
        </table></div>
        <div class="grid g2" style="margin-top:14px">
          <div class="card"><h3>NAV history <span class="pill">5-min marks</span></h3><canvas class="chart" id="navc"></canvas></div>
          <div class="card"><h3>AI desk status <span class="pill ${firm.llm.enabled ? 'ok' : 'warn'}">${firm.llm.enabled ? `LLM · ${(firm.llm.providers || []).map((p) => esc(p.model)).join(' + ')}` : 'Rule book (no API key)'}</span></h3>
            <div class="muted" style="font-size:12px;margin-bottom:6px">Last decision ${firm.lastTick ? ago(firm.lastTick) : '—'} · next in ${firm.nextTickInMs != null ? until(Date.now() + firm.nextTickInMs) : '—'} · LLM spend this month $${firm.llm.monthToDateUsd.toFixed(3)} of $${firm.llm.capUsd} cap</div>
            ${[ht, ch, q, ro].filter(Boolean).map((a) => `<div class="agent" style="margin-top:8px"><div class="avatar">${AGENT_INITIALS[a.agent]}</div><div><b>${esc(a.name)}</b> ${modelPill(a.agent)} <span class="muted">· ${esc(a.title)}</span>
              ${a.reports[0] ? `<div class="memo">${esc(a.reports[0].report)}</div><div class="muted" style="font-size:11px">${ago(a.reports[0].created_at)}${writtenBy(a.reports[0])}</div>` : '<div class="empty">No report yet.</div>'}</div></div>`).join('')}
          </div>
        </div>
        <div style="margin-top:14px">${leagueCard(firm.league, firm.llm, 'trading')}</div>
        <div class="grid g2" style="margin-top:14px">
          <div class="card"><h3>Positions</h3><div class="scroll"><table class="t"><tr><th>Symbol</th><th class="r">Qty</th><th class="r">Avg</th><th class="r">Last</th><th class="r">Value</th><th class="r">Unrealised</th><th class="r">Weight</th></tr>
            ${b.positions.map((p) => `<tr class="click" data-sym="${p.symbol}"><td><b>${p.symbol}</b> <span class="muted">${esc(p.name || '')}</span></td><td class="r">${p.qty}</td><td class="r">${px(p.avg / 100)}</td><td class="r">${px(p.price / 100)}</td><td class="r">${fmt(p.value, { dp: 0 })}</td><td class="r ${cls(p.unrealized)}">${fmt(p.unrealized, { sign: true, dp: 0 })}</td><td class="r">${((p.value / b.nav) * 100).toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No positions yet — orders queue while the market is closed.</td></tr>'}
            </table></div>
            ${b.pending.length ? `<h3 style="margin-top:12px">Working orders</h3><table class="t">${b.pending.map((o) => `<tr><td><span class="pill ${o.side === 'buy' ? 'ok' : 'bad'}">${o.side.toUpperCase()}</span> ${o.qty} <b>${o.symbol}</b> <span class="muted">${esc(AGENT_SHORT[o.agent] || '')}</span></td><td class="muted">${esc(o.rationale || '')}</td><td class="r muted">${ago(o.created_at)}</td></tr>`).join('')}</table>` : ''}
          </div>
          <div class="card"><h3>Quant signal table <span class="pill">${esc(q?.reports[0]?.data?.regime || '—')}</span></h3><div class="scroll"><table class="t"><tr><th>#</th><th>Symbol</th><th class="r">Score</th><th class="r">6m</th><th class="r">Trend</th><th class="r">RSI</th><th class="r">Vol</th></tr>
            ${sig.slice(0, 16).map((s, i) => `<tr class="click" data-sym="${s.symbol}"><td class="muted">${i + 1}</td><td><b>${s.symbol}</b></td><td class="r ${cls(s.score)}">${s.score.toFixed(2)}</td><td class="r ${cls(s.ret6m)}">${pct(s.ret6m, 1)}</td><td class="r ${cls(s.trend50)}">${pct(s.trend50, 1)}</td><td class="r">${(s.rsi14 || 0).toFixed(0)}</td><td class="r">${(s.vol20 * 100).toFixed(0)}%</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Awaiting daily bars…</td></tr>'}
            </table></div><div class="muted" style="font-size:11px;margin-top:6px">Score = 0.45·z(6-month return) + 0.3·z(3-month) + 0.25·z(price vs 50-day average) − 0.15·z(volatility), RSI overbought penalty. Built from one year of real daily bars.</div></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>Fill log — every trade the desk made, with its reasoning</h3><div class="scroll"><table class="t"><tr><th>Time</th><th>Agent</th><th>Side</th><th>Symbol</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th><th class="r">Realised</th><th>Rationale</th></tr>
          ${firm.trades.map((t) => `<tr><td class="muted">${tfmt(t.created_at)}</td><td>${esc(AGENT_SHORT[t.agent] || (t.agent ? 'Desk A' : '—'))}<div class="muted" style="font-size:11px">${esc(t.model && t.model !== 'rules' ? t.model : 'rule book')}</div></td><td><span class="pill ${t.side === 'buy' ? 'ok' : 'bad'}">${t.side.toUpperCase()}</span></td><td><b>${t.symbol}</b></td><td class="r">${t.qty}</td><td class="r">${px(t.price / 100)}</td><td class="r">${fmt(t.amount, { dp: 0 })}</td><td class="r ${cls(t.realized)}">${t.realized == null ? '—' : fmt(t.realized, { sign: true, dp: 0 })}</td><td class="muted" style="max-width:380px">${esc(t.rationale || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No fills yet. Orders sent while the market is closed fill at the next open.</td></tr>'}
          </table></div></div>`;
      const nav = firm.navHistory.map((p) => [p.t, p.nav / 100]);
      lineChart(body.querySelector('#navc'), [{ pts: nav, color: '#f0d18a', fill: 'rgba(240,209,138,0.25)' }], { height: 170, refY: start / 100, refLabel: 'initial budget', xFmt: (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) });
      body.querySelectorAll('[data-sym]').forEach((r) => { r.onclick = () => { sel = r.dataset.sym; selectTab('trade'); }; });
    }

    // ------------------------------------------------------------ trade
    function renderTrade() {
      if (!quotes) { body.innerHTML = '<div class="empty">Loading quotes…</div>'; return; }
      const q = quotes.quotes.find((x) => x.symbol === sel) || quotes.quotes[0];
      sel = q.symbol;
      const pos = mine?.portfolio.positions.find((p) => p.symbol === sel);
      body.innerHTML = `<div class="split">
        <div class="card" style="padding:0"><div class="scroll" style="max-height:none"><table class="t" id="wl"><tr><th>Symbol</th><th class="r">Last</th><th class="r">Day</th></tr>
          ${quotes.quotes.map((x) => `<tr class="click${x.symbol === sel ? ' sel' : ''}" data-sym="${x.symbol}"><td><b>${x.symbol}</b><div class="muted" style="font-size:11px">${esc(x.name)}</div></td><td class="r mono">${px(x.price)}</td><td class="r mono ${cls(x.change)}">${pct(x.change)}</td></tr>`).join('')}
        </table></div></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card"><div class="row"><div><div style="font:700 22px Georgia">${q.symbol} <span class="muted" style="font:500 14px system-ui">${esc(q.name)}</span></div>
            <div class="mono" style="font-size:26px;font-weight:700">${px(q.price)} <span class="${cls(q.change)}" style="font-size:16px">${pct(q.change)}</span></div>
            <div class="muted" style="font-size:12px">Day range ${px(q.low)} – ${px(q.high)} · prev close ${px(q.prevClose)} · ${esc(q.source)} · as of ${tfmt(q.asOf)}</div></div><div class="sp"></div>
            <div class="seg" id="rng"><button data-r="1d" class="${chartRange === '1d' ? 'on' : ''}">Today 5-min</button><button data-r="1y" class="${chartRange === '1y' ? 'on' : ''}">1 year</button></div></div>
            <canvas class="chart" id="pc" style="margin-top:10px"></canvas></div>
          <div class="card"><h3>Order ticket</h3>
            <div class="row"><div class="seg" id="side"><button data-s="buy" class="buy ${side === 'buy' ? 'on' : ''}">Buy</button><button data-s="sell" class="sell ${side === 'sell' ? 'on' : ''}">Sell</button></div>
              <div class="seg" id="type"><button data-t="market" class="${type === 'market' ? 'on' : ''}">Market</button><button data-t="limit" class="${type === 'limit' ? 'on' : ''}">Limit</button></div></div>
            <div class="row" style="margin-top:10px;align-items:flex-end">
              <label class="field">Shares<input id="qty" type="number" min="1" step="1" value="10" style="width:110px"></label>
              <label class="field" id="limf" style="${type === 'limit' ? '' : 'display:none'}">Limit price<input id="lim" type="number" step="0.01" value="${q.price.toFixed(2)}" style="width:120px"></label>
              <div class="field">Estimated<span class="mono" id="est" style="font-size:15px;color:var(--ink);padding:8px 0">—</span></div><div class="sp"></div>
              <button class="btn ${side}" id="send">${side === 'buy' ? 'Buy' : 'Sell'} ${q.symbol}</button></div>
            <div class="msg" id="tmsg"></div>
            <div class="muted" style="font-size:12px">Available liquidity ${fmt(mine?.portfolio.cash ?? getMe()?.balance)}${pos ? ` · you hold ${pos.qty} ${sel} (${pos.qty - pos.reservedQty} free)` : ''}. ${quotes.market.open ? 'Market orders fill at the next delayed price (within seconds).' : 'The market is closed: orders queue and fill at the first delayed price after the open.'} Market buys reserve price + 5 %; the unused part returns on fill.</div>
          </div></div></div>`;
      body.querySelector('#wl').onclick = (e) => { const r = e.target.closest('[data-sym]'); if (r) { sel = r.dataset.sym; loadChart(); renderTrade(); } };
      body.querySelector('#rng').onclick = (e) => { const r = e.target.closest('button')?.dataset.r; if (r) { chartRange = r; renderTrade(); } };
      body.querySelector('#side').onclick = (e) => { const s = e.target.closest('button')?.dataset.s; if (s) { side = s; renderTrade(); } };
      body.querySelector('#type').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (t) { type = t; renderTrade(); } };
      const est = () => { const n = +body.querySelector('#qty').value || 0; const p = type === 'limit' ? +body.querySelector('#lim').value : q.price; body.querySelector('#est').textContent = fmt(Math.round(n * p * 100)); };
      body.querySelector('#qty').oninput = est; body.querySelector('#lim').oninput = est; est();
      body.querySelector('#send').onclick = async () => {
        const m = body.querySelector('#tmsg');
        try {
          const out = await api('/api/market/order', { method: 'POST', body: { symbol: sel, side, qty: +body.querySelector('#qty').value, type, limit: +body.querySelector('#lim').value } });
          m.className = 'msg ok'; m.textContent = `Order #${out.order.id} ${out.order.status}: ${side} ${out.order.qty} ${sel}${quotes.market.open ? ' — filling at the next price.' : ' — queued for the open.'}`;
          mine = { ...(mine || {}), portfolio: out.portfolio }; setBalance(out.portfolio.cash);
          setTimeout(loadMine, 4500);
        } catch (err) { m.className = 'msg err'; m.textContent = err.message; }
      };
      drawPriceChart();
    }
    async function loadChart() { try { chart = await api(`/api/market/chart?symbol=${encodeURIComponent(sel)}`); drawPriceChart(); } catch { /* ignore */ } }
    function drawPriceChart() {
      const c = body.querySelector('#pc'); if (!c) return;
      if (!chart || chart.symbol !== sel) { lineChart(c, [], { height: 220 }); return; }
      const pts = chartRange === '1d' ? chart.intraday : chart.daily;
      const up = pts.length > 1 && pts[pts.length - 1][1] >= pts[0][1];
      lineChart(c, [{ pts, color: up ? '#3ddc84' : '#ff5c6c', fill: up ? 'rgba(61,220,132,0.22)' : 'rgba(255,92,108,0.22)' }], {
        height: 220, refY: chartRange === '1d' ? chart.quote?.prev_close : null, refLabel: 'prev close',
        xFmt: (t) => (chartRange === '1d' ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(t).toLocaleDateString([], { month: 'short', year: '2-digit' })),
      });
    }

    // ------------------------------------------------------------ my portfolio
    function renderMine() {
      if (!mine) { body.innerHTML = '<div class="empty">Loading your portfolio…</div>'; return; }
      const p = mine.portfolio;
      body.innerHTML = `<div class="grid g4">
          <div class="card"><h3>Portfolio value</h3><div class="kpi">${fmt(p.nav)}<small>cash + reserved + holdings</small></div></div>
          <div class="card"><h3>Holdings</h3><div class="kpi">${fmt(p.invested)}<small>${p.positions.length} positions</small></div></div>
          <div class="card"><h3>Unrealised</h3><div class="kpi ${cls(p.unrealized)}">${fmt(p.unrealized, { sign: true })}</div></div>
          <div class="card"><h3>Realised</h3><div class="kpi ${cls(p.realized)}">${fmt(p.realized, { sign: true })}</div></div></div>
        <div class="grid g2" style="margin-top:14px">
          <div class="card"><h3>Positions</h3><table class="t"><tr><th>Symbol</th><th class="r">Qty</th><th class="r">Avg</th><th class="r">Last</th><th class="r">Value</th><th class="r">Unrealised</th></tr>
            ${p.positions.map((x) => `<tr class="click" data-sym="${x.symbol}"><td><b>${x.symbol}</b></td><td class="r">${x.qty}</td><td class="r">${px(x.avg / 100)}</td><td class="r">${px(x.price / 100)}</td><td class="r">${fmt(x.value)}</td><td class="r ${cls(x.unrealized)}">${fmt(x.unrealized, { sign: true })}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No positions. Open the Trade tab to buy your first shares.</td></tr>'}</table>
            <h3 style="margin-top:14px">Working orders</h3><table class="t">${p.pending.map((o) => `<tr><td><span class="pill ${o.side === 'buy' ? 'ok' : 'bad'}">${o.side.toUpperCase()}</span> ${o.qty} <b>${o.symbol}</b> ${o.type === 'limit' ? `@ ${px(o.limit_price / 100)}` : 'market'}</td><td class="r muted">${ago(o.created_at)}</td><td class="r"><button class="btn ghost sm" data-cancel="${o.id}">Cancel</button></td></tr>`).join('') || '<tr><td class="empty">None.</td></tr>'}</table></div>
          <div class="card"><h3>Value history</h3><canvas class="chart" id="mnav"></canvas>
            <h3 style="margin-top:12px">Recent fills</h3><div class="scroll" style="max-height:220px"><table class="t">${mine.trades.map((t) => `<tr><td class="muted">${tfmt(t.created_at)}</td><td><span class="pill ${t.side === 'buy' ? 'ok' : 'bad'}">${t.side.toUpperCase()}</span> ${t.qty} <b>${t.symbol}</b></td><td class="r">${px(t.price / 100)}</td><td class="r ${cls(t.realized)}">${t.realized == null ? '' : fmt(t.realized, { sign: true })}</td></tr>`).join('') || '<tr><td class="empty">No fills yet.</td></tr>'}</table></div></div></div>`;
      lineChart(body.querySelector('#mnav'), [{ pts: mine.navHistory.map((x) => [x.t, x.nav / 100]), color: '#6cb6ff', fill: 'rgba(108,182,255,0.2)' }], { height: 150, xFmt: (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) });
      body.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = async () => { try { const out = await api('/api/market/cancel', { method: 'POST', body: { id: +b.dataset.cancel } }); mine.portfolio = out.portfolio; setBalance(out.portfolio.cash); renderMine(); } catch (e) { b.textContent = e.message; } }; });
      body.querySelectorAll('[data-sym]').forEach((r) => { r.onclick = () => { sel = r.dataset.sym; selectTab('trade'); }; });
    }

    // ------------------------------------------------------------ leaderboard
    async function renderBoard() {
      body.innerHTML = '<div class="empty">Loading…</div>';
      try {
        const lb = await api('/api/market/leaderboard');
        if (tab !== 'board') return;
        const me = getMe()?.name;
        body.innerHTML = `<div class="card"><h3>Associate league table — portfolio value (includes all liquidity)</h3><table class="t"><tr><th>#</th><th>Associate</th><th class="r">Portfolio value</th><th class="r">Return</th><th class="r">Positions</th></tr>
          <tr style="background:rgba(214,178,94,.07)"><td>—</td><td><b>The Firm (AI desk)</b></td><td class="r">${fmt(lb.firm.nav, { dp: 0 })}</td><td class="r ${cls(lb.firm.nav - lb.firm.start)}">${pct(lb.firm.nav / lb.firm.start - 1)}</td><td class="r"></td></tr>
          ${lb.leaders.map((l, i) => `<tr${l.name === me ? ' class="sel"' : ''}><td>${i + 1}</td><td>${esc(l.name)}</td><td class="r">${fmt(l.nav)}</td><td class="r ${cls(l.ret)}">${pct(l.ret)}</td><td class="r">${l.positions}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nobody has traded yet. The league table awaits its first visionary.</td></tr>'}</table></div>`;
      } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }

    // ------------------------------------------------------------ data + wiring
    const render = () => { header(); if (tab === 'firm') renderFirm(); else if (tab === 'trade') renderTrade(); else if (tab === 'mine') renderMine(); else renderBoard(); };
    async function loadQuotes() { try { quotes = await api('/api/market/quotes'); if (tab === 'trade' && !body.querySelector(':focus')) renderTrade(); header(); } catch { /* offline */ } }
    async function loadFirm() { try { firm = await api('/api/firm/book'); if (tab === 'firm') renderFirm(); } catch { /* offline */ } }
    async function loadMine() { try { mine = await api('/api/market/portfolio'); setBalance(mine.portfolio.cash); if (tab === 'mine') renderMine(); } catch { /* offline */ } }
    let deb = 0;
    const soon = (fn) => { clearTimeout(deb); deb = setTimeout(fn, 600); };
    offs.push(on('quotes', (s) => { quotes = s; header(); if (tab === 'trade' && !body.querySelector('input:focus')) { const y = body.scrollTop; renderTrade(); body.scrollTop = y; } }));
    offs.push(on('trade', (t) => { soon(() => { loadFirm(); if (t.owner?.startsWith('PLAYER:')) loadMine(); }); }));
    offs.push(on('firm', () => soon(loadFirm)));
    const iv = setInterval(() => { loadFirm(); header(); }, 30_000);
    const selectTab = ctx.tabs([{ id: 'firm', label: 'Firm Book (AI desk)' }, { id: 'trade', label: 'Trade' }, { id: 'mine', label: 'My Portfolio' }, { id: 'board', label: 'League Table' }],
      (t) => { tab = t; if (t === 'trade') loadChart(); render(); }, ctx.opts.tab || 'firm');
    loadQuotes(); loadFirm(); loadMine();
    const onResize = () => render();
    addEventListener('resize', onResize);
    return { unmount() { offs.forEach((f) => f()); clearInterval(iv); removeEventListener('resize', onResize); } };
  },
});

// keep a shared quote snapshot for the 3D trading floor even when the terminal is closed
on('quotes', (s) => { quotes = s; });
export async function primeQuotes() { try { quotes = await api('/api/market/quotes'); } catch { /* offline */ } return quotes; }
