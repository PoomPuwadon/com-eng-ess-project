// VT-02 Sports Analytics terminal: the Fixture Scout's marquee match, upcoming top-flight and UEFA
// fixtures with real crests, house pricing, a position ticket on the ledger, and your open positions.
import { registerApp } from './shell.js';
import { api, fmt, esc, setBalance, ago } from '../net/api.js';
import { leagueCard } from './league.js';

const crestImg = (t, s = 28) => (t.crest ? `<img src="/api/football/crest?u=${encodeURIComponent(t.crest)}" alt="" width="${s}" height="${s}" style="object-fit:contain;vertical-align:middle">` : `<span style="display:inline-block;width:${s}px;text-align:center;font-weight:800">${esc(t.tla || '')}</span>`);
const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS = { open: 'Open', gain: 'Realised gain', contributed: 'Strategic contribution', void: 'Returned' };

registerApp('sports', {
  title: 'Sports Analytics Terminal',
  sub: 'VT-02 · real fixtures · house pricing · notional capital',
  mount(body, ctx) {
    let s = null, sel = null, market = '1X2', pick = 'H', amount = 100, msg = '';
    const load = async () => { try { s = await api('/api/football/state'); if (!sel && s.marquee) sel = s.marquee.id; render(); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; } };
    function render() {
      if (!s) { body.innerHTML = '<div class="empty">Loading fixtures…</div>'; return; }
      ctx.setSub(`${s.simulated ? 'SIMULATED fixtures (no data key)' : 'Live fixtures · football-data.org'} · ${s.pricingNote}`);
      const m = s.fixtures.find((f) => f.id === sel) || s.marquee;
      const mq = s.marquee;
      const ticket = m && m.pricing ? Object.entries(s.markets).map(([k, def]) => `<div style="margin:6px 0"><div class="muted" style="font-size:11px;text-transform:uppercase">${esc(def.label)}</div>${Object.entries(def.picks).map(([p, l]) => `<button class="btn ${market === k && pick === p ? '' : 'ghost'}" data-m="${k}" data-p="${p}" style="margin:2px">${esc(l)} <b>${m.pricing.prices[k][p].toFixed(2)}x</b></button>`).join('')}</div>`).join('') : '<div class="empty">Pricing closed.</div>';
      body.innerHTML = `<div class="grid g2">
        <div class="card"><h3>Marquee fixture · picked by the Fixture Scout${mq ? ` (${mq.by === 'llm' ? `AI · ${esc(mq.model || 'LLM')}` : 'rule book'})` : ''}</h3>
          ${mq ? `<div style="display:flex;align-items:center;gap:12px;font:800 18px system-ui">${crestImg(mq.homeTeam, 48)} ${esc(mq.homeTeam.name)} <span class="muted">v</span> ${esc(mq.awayTeam.name)} ${crestImg(mq.awayTeam, 48)}</div>
            <div class="muted">${esc(mq.competition.name)} · ${when(mq.utcDate)}</div><p>${esc(mq.preview)}</p><ul style="margin:0 0 0 18px">${(mq.points || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<div class="empty">No fixture selected yet.</div>'}
        </div>
        <div class="card"><h3>Position ticket</h3>${m ? `<div style="font-weight:800;margin-bottom:4px">${crestImg(m.homeTeam, 22)} ${esc(m.homeTeam.shortName || m.homeTeam.name)} v ${esc(m.awayTeam.shortName || m.awayTeam.name)} ${crestImg(m.awayTeam, 22)}</div><div class="muted">${esc(m.competition.name)} · ${when(m.utcDate)}</div>${ticket}
          <div style="margin-top:8px">Allocation ¤ <input type="number" min="1" max="10000" value="${amount}" data-amt style="width:90px;background:#171b25;color:#fff;border:1px solid #3a4152;border-radius:6px;padding:5px"> <button class="btn" data-open ${m.pricing ? '' : 'disabled'}>Open position</button></div>
          <div class="muted" style="margin-top:6px">${esc(msg)}</div>` : ''}</div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3>Upcoming fixtures</h3><table class="tbl" style="width:100%">${s.fixtures.map((f) => `<tr data-f="${f.id}" style="cursor:pointer;${f.id === sel ? 'background:rgba(214,178,94,.15)' : ''}"><td class="muted">${esc(f.competition.code)}</td><td>${crestImg(f.homeTeam, 18)} ${esc(f.homeTeam.shortName || f.homeTeam.name)}</td><td>${crestImg(f.awayTeam, 18)} ${esc(f.awayTeam.shortName || f.awayTeam.name)}</td><td class="muted">${when(f.utcDate)}</td><td style="font-family:ui-monospace,monospace">${f.pricing ? `${f.pricing.prices['1X2'].H.toFixed(2)} · ${f.pricing.prices['1X2'].D.toFixed(2)} · ${f.pricing.prices['1X2'].A.toFixed(2)}` : '—'}</td></tr>`).join('')}</table></div>
        <div class="card"><h3>Your positions</h3>${s.mine.length ? `<table class="tbl" style="width:100%">${s.mine.map((p) => `<tr><td>${esc(p.label)}</td><td>${fmt(p.stake)} @ ${p.price.toFixed(2)}x</td><td>${STATUS[p.status] || p.status}${p.payout ? ` · ${fmt(p.payout)}` : ''}</td></tr>`).join('')}</table>` : '<div class="empty">No positions yet. Positions settle on the real full-time result (90 minutes + stoppage).</div>'}
          <h3 style="margin-top:14px">Sports Desk (AI) book</h3><div class="muted">Desk liquidity ${fmt(s.desk.balance)}</div>${s.desk.positions.map((p) => `<div>${esc(p.label)} · ${fmt(p.stake)} @ ${p.price.toFixed(2)}x · ${STATUS[p.status] || p.status}</div>`).join('') || '<div class="muted">No desk positions yet.</div>'}
          <div class="muted" style="margin-top:12px;font-size:11px">${esc(s.attribution)}. Club crests are the clubs' trademarks, shown for identification only.${s.lastFetch ? ` Updated ${ago(s.lastFetch)}.` : ''}</div></div>
      </div>
      <div style="margin-top:12px">${leagueCard(s.league, s.llm, 'all')}</div>`;
    }
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m],[data-open],[data-f]');
      if (!b) return;
      if (b.dataset.f) { sel = Number(b.dataset.f); render(); return; }
      if (b.dataset.m) { market = b.dataset.m; pick = b.dataset.p; render(); return; }
      const inp = body.querySelector('[data-amt]'); amount = Math.max(1, Number(inp?.value) || 1);
      try {
        const out = await api('/api/football/position', { method: 'POST', body: { matchId: sel, market, pick, amount: Math.round(amount * 100) } });
        setBalance(out.balance); msg = `Position opened: ${out.position.label} · ${fmt(out.position.stake)} at ${out.position.price.toFixed(2)}x`;
        await load();
      } catch (err) { msg = err.message; render(); }
    });
    load();
    const iv = setInterval(load, 30_000);
    return { unmount: () => clearInterval(iv) };
  },
});
