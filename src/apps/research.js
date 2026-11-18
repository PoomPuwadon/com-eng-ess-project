// Probability Research Institute: the agents' full research workflow on real official Thai lottery
// results — data, randomness audit, models, walk-forward backtest, model averaging, Monte Carlo,
// portfolio construction, the Head of Thai Markets' decision — plus the track record and certificates.
import { registerApp } from './shell.js';
import { api, on, fmt, ago, esc, setBalance } from '../net/api.js';
import { lineChart, barChart, heatColor } from './charts.js';
import { leagueCard } from './league.js';

const pc = (x, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const pv = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const date = (d) => new Date(`${d}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const PRIZE = { first: '1st prize', near1: 'Adjacent to 1st', second: '2nd prize', third: '3rd prize', fourth: '4th prize', fifth: '5th prize', last3f: 'Front 3', last3b: 'Back 3', last2: 'Last 2' };

let state = null;
export const getLottery = () => state;

registerApp('research', {
  title: 'Probability Research Institute',
  sub: 'Rigour. Precision. Fortnightly.',
  mount(body, ctx) {
    let tab = 'workflow', target = 'L2';
    const open = new Set(['decision', 'picks']);
    const offs = [];

    function headerSub() {
      if (!state) return;
      const c = state.calendar;
      ctx.setSub(`Next official draw ${date(c.next)} · participation ${c.salesOpen ? `open until ${c.salesCloseLocal}` : 'closed — awaiting official results'} · ${state.draws} official draws on file · ${state.attribution}`);
    }

    // ------------------------------------------------------------ workflow
    function stageDetail(s) {
      const d = s.data;
      switch (s.id) {
        case 'ingest': return `<table class="t"><tr><th>Draw</th><th>1st prize</th><th>Front 3</th><th>Back 3</th><th>Last 2</th></tr>${d.recent.map((r) => `<tr><td>${date(r.date)}</td><td class="mono gold">${r.first}</td><td class="mono">${r.last3f.join(' · ')}</td><td class="mono">${r.last3b.join(' · ')}</td><td class="mono">${r.last2}</td></tr>`).join('')}</table>`;
        case 'audit': return `<div class="grid g2"><div><table class="t"><tr><th>Test</th><th class="r">χ²</th><th class="r">df</th><th class="r">p</th><th>Verdict</th></tr>${d.tests.map((t) => `<tr><td>${esc(t.name)}</td><td class="r">${t.stat.toFixed(1)}</td><td class="r">${t.df}</td><td class="r">${pv(t.p)}</td><td><span class="pill ${t.p < 0.01 ? 'warn' : 'ok'}">${t.verdict}</span></td></tr>`).join('')}
            <tr><td>Lag-1 autocorrelation (last 2)</td><td class="r">r ${d.autocorrelation.r.toFixed(3)}</td><td class="r"></td><td class="r">${pv(d.autocorrelation.p)}</td><td><span class="pill ${d.autocorrelation.p < 0.01 ? 'warn' : 'ok'}">${d.autocorrelation.p < 0.01 ? 'deviation' : 'no memory'}</span></td></tr>
            <tr><td>Runs test above/below median</td><td class="r">z ${d.runs.z.toFixed(2)}</td><td class="r"></td><td class="r">${pv(d.runs.p)}</td><td><span class="pill ${d.runs.p < 0.01 ? 'warn' : 'ok'}">${d.runs.p < 0.01 ? 'deviation' : 'random order'}</span></td></tr></table>
            <div class="muted" style="font-size:12px;margin-top:6px">With ${d.tests.length + 2} tests, about one p-value below 0.1 is expected by chance alone.</div></div>
            <div><div class="muted" style="font-size:12px;margin-bottom:4px">1st-prize digit frequency by position (rows: position 1–6, columns: digit 0–9)</div>${heat(d.heatmap)}</div></div>`;
        case 'features': return `<div class="grid g2"><div><div class="muted" style="font-size:12px;margin-bottom:4px">Last-2 outcome counts (row: tens digit, column: units digit)</div>${heat(d.last2Grid, true)}</div>
            <div><div class="muted" style="font-size:12px;margin-bottom:6px">Longest-absent last-2 numbers (draws since last seen). Under a fair draw the expected gap is 100 draws.</div><div class="balls">${d.coldest.map(([v, g]) => `<div style="text-align:center"><div class="ball">${v}</div><div class="muted" style="font-size:11px">${g}</div></div>`).join('')}</div></div></div>`;
        case 'models': {
          const t = d[target];
          return `<div class="row" style="margin-bottom:8px"><div class="seg" data-target>${Object.entries(d).map(([k, v]) => `<button data-t="${k}" class="${k === target ? 'on' : ''}">${esc(v.label)}</button>`).join('')}</div><span class="muted" style="font-size:12px">Top-${t.topK} picks scored on every draw, trained only on earlier draws.</span></div>
            <table class="t"><tr><th>Model</th><th class="r">Log-loss (bits)</th><th class="r">Hits</th><th class="r">Hit rate</th><th class="r">Null rate</th><th class="r">Lift</th><th class="r">95% CI of hit rate</th><th class="r">p (vs null)</th><th>Next picks</th></tr>
            ${t.metrics.map((m) => `<tr${m.id === 'ensemble' ? ' style="background:rgba(214,178,94,.08)"' : ''}><td><b>${esc(m.name)}</b></td><td class="r ${m.logLossBits < m.baselineBits ? 'up' : 'down'}">${m.logLossBits.toFixed(3)} <span class="muted">/ ${m.baselineBits.toFixed(3)}</span></td><td class="r">${m.hits}/${m.draws}</td><td class="r">${pc(m.hitRate)}</td><td class="r muted">${pc(m.baselineRate)}</td><td class="r ${m.lift > 1 ? 'up' : 'down'}">${m.lift.toFixed(2)}×</td><td class="r">${pc(m.ci95[0])}–${pc(m.ci95[1])}</td><td class="r">${pv(m.pValue)}</td><td class="mono">${(t.perModelNext[m.id] || []).slice(0, 5).map((x) => x.v).join(' ') || '<span class="muted">mixture →</span>'}</td></tr>`).join('')}</table>
            <div class="muted" style="font-size:12px;margin-top:6px">Lower log-loss than the uniform null (${t.metrics[0].baselineBits.toFixed(2)} bits) would mean real predictive information. Lift = hit rate ÷ the rate random picks achieve.</div>`;
        }
        case 'ensemble': {
          const e = d[target] || d.L2;
          return `<div class="grid g2"><div>${e.weights.slice().sort((a, b) => b.w - a.w).map((w) => `<div class="row" style="margin:4px 0"><span style="width:150px">${esc(w.name)}</span><div class="bar" style="flex:1"><i style="width:${(w.w * 100).toFixed(1)}%"></i></div><span class="mono" style="width:56px;text-align:right">${pc(w.w)}</span></div>`).join('')}
            <div class="muted" style="font-size:12px;margin-top:6px">Weights ∝ each model's predictive likelihood of every past draw, with forgetting factor 0.97 (Dynamic Model Averaging).</div></div>
            <div><canvas class="chart" id="wpath"></canvas></div></div>`;
        }
        case 'montecarlo': return `<div class="grid g2"><div><canvas class="chart" id="mch"></canvas><div class="muted" style="font-size:12px">Distribution of top-5 hits from ${d.sims.toLocaleString()} simulated seasons of random picks over ${d.draws} draws. Green bar: the ensemble's actual ${d.hits} hits (empirical p = ${pv(d.empiricalP)}).</div></div>
            <div><canvas class="chart" id="cum"></canvas><div class="muted" style="font-size:12px">Cumulative ensemble hits (gold) vs the number random picks are expected to score (dashed).</div></div></div>`;
        case 'picks': return `<div class="grid g2"><div><div class="muted" style="font-size:12px;margin-bottom:4px">Ensemble probability of the next last-2 (top 10) vs the fair 1.00%</div><canvas class="chart" id="l2p"></canvas>
            <div class="row" style="margin-top:8px"><span class="muted" style="width:70px">Front 3</span><div class="balls">${d.front3.map((x) => `<div class="ball" title="${pc(x.p, 3)}">${x.v}</div>`).join('')}</div></div>
            <div class="row" style="margin-top:6px"><span class="muted" style="width:70px">Back 3</span><div class="balls">${d.back3.map((x) => `<div class="ball" title="${pc(x.p, 3)}">${x.v}</div>`).join('')}</div></div>
            <div class="row" style="margin-top:6px"><span class="muted" style="width:70px">Flagship</span><div class="balls">${d.flagship.map((x) => `<div class="ball big">${x.number}</div>`).join('')}</div></div></div>
            <div><table class="t"><tr><th>Candidate certificate</th><th class="r">Model-implied value</th><th class="r">Fair-draw value</th><th class="r">Price</th><th></th></tr>${d.candidates.map((c) => `<tr><td class="mono gold" style="font-size:15px">${c.number}</td><td class="r">¤${c.modelValue.toFixed(2)}</td><td class="r muted">¤${d.fairValue.toFixed(2)}</td><td class="r">¤${d.price.toFixed(2)}</td><td class="r"><button class="btn ghost sm" data-copy="${c.number}">Copy pick</button></td></tr>`).join('')}</table>
            <div class="muted" style="font-size:12px;margin-top:6px">Value = Σ prize × model probability per prize category. A fair draw returns ¤48.00 on each ¤80.00 certificate (60%).</div></div></div>`;
        default: return '';
      }
    }
    function heat(grid, labels = false) {
      const flat = grid.flat(), mn = Math.min(...flat), mx = Math.max(...flat);
      return `<div class="heat" style="grid-template-columns:repeat(${grid[0].length},1fr)">${grid.map((row) => row.map((v) => `<div style="background:${heatColor((v - mn) / (mx - mn || 1))}" title="${v}">${labels ? v : v}</div>`).join('')).join('')}</div>`;
    }
    function drawStageCharts(run) {
      const st = Object.fromEntries(run.stages.map((s) => [s.id, s]));
      const mc = body.querySelector('#mch');
      if (mc) { const d = st.montecarlo.data; barChart(mc, d.histogram.map((v, i) => ({ label: i, v, color: i === d.hits ? '#3ddc84' : '#d6b25e' })), { height: 170, labelEvery: Math.ceil(d.histogram.length / 14) }); }
      const cum = body.querySelector('#cum');
      if (cum) { const p = st.montecarlo.data.hitPath; lineChart(cum, [{ pts: p.map((x, i) => [i, x.hits]), color: '#f0d18a', width: 2.5 }, { pts: p.map((x, i) => [i, x.expected]), color: 'rgba(255,255,255,0.6)', dash: [5, 4] }], { height: 170, yFmt: (v) => v.toFixed(0) }); }
      const wp = body.querySelector('#wpath');
      if (wp) {
        const e = st.ensemble.data[target] || st.ensemble.data.L2;
        const colors = ['#9aa3b5', '#ff7d8a', '#f0d18a', '#b78cff', '#6cb6ff', '#3ddc84'];
        lineChart(wp, e.weights.map((w, i) => ({ pts: e.path.map((p) => [p.t, p.w[i]]), color: colors[i % colors.length] })), { height: 170, yFmt: (v) => `${(v * 100).toFixed(0)}%` });
        wp.insertAdjacentHTML('afterend', `<div class="row" style="font-size:11px;gap:12px">${e.weights.map((w, i) => `<span style="color:${colors[i]}">■ ${esc(w.name)}</span>`).join('')}</div>`);
      }
      const l2 = body.querySelector('#l2p');
      if (l2) { const d = st.picks.data; barChart(l2, d.last2.map((x) => ({ label: x.v, v: x.p * 100 })), { height: 160, ref: 1, refLabel: 'fair 1%', yFmt: (v) => `${v.toFixed(2)}%` }); }
    }
    function renderWorkflow() {
      const run = state?.run;
      if (!run) {
        const b = state?.backfill;
        body.innerHTML = `<div class="card"><h3>Pipeline warming up</h3><div class="empty">The Institute is ingesting the official draw history from the Government Lottery Office${b?.backfilling ? ` (${b.backfillDone} of ${b.backfillTotal} draw windows checked)` : ''}. The first research run starts as soon as the history is complete.</div></div>`;
        return;
      }
      const dec = run.decision, set = run.settlement;
      const head = state.agents.find((a) => a.agent === 'thai_head'), quant = state.agents.find((a) => a.agent === 'lottery_quant');
      const stages = [...run.stages];
      body.innerHTML = `<div class="grid g3">
          <div class="card"><h3>Latest official result <span class="pill">${state.latest ? date(state.latest.date) : '—'}</span></h3>${state.latest ? `<div class="balls"><div class="ball big">${state.latest.first}</div></div>
            <div class="row" style="margin-top:8px;font-size:13px"><span class="muted">Last 2</span><b class="mono">${state.latest.last2}</b><span class="muted">Front 3</span><b class="mono">${state.latest.last3f.join(' · ')}</b><span class="muted">Back 3</span><b class="mono">${state.latest.last3b.join(' · ')}</b></div>` : '<div class="empty">—</div>'}</div>
          <div class="card"><h3>This run</h3><div class="kpi" style="font-size:18px">Draw of ${date(run.target)}<small>run #${run.id} · ${ago(run.createdAt)} · trigger: ${esc(run.trigger)} · ${run.draws} draws</small></div></div>
          <div class="card"><h3>Research team</h3>${[quant, head].filter(Boolean).map((a) => `<div class="agent" style="margin:4px 0"><div class="avatar">${a.agent === 'thai_head' ? 'TM' : 'LQ'}</div><div><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.title)} · ${a.reports[0] ? `reported ${ago(a.reports[0].created_at)}` : 'no report yet'}</div>${(() => { const r = state.llm.routes?.[a.agent]; return r ? `<span class="pill ${r.provider}">${esc(r.model)}</span>` : '<span class="pill">rule book</span>'; })()}</div></div>`).join('')}
            <div class="muted" style="font-size:11px">${state.llm.enabled ? 'Lottery Quant ranks the candidates, Head of Thai Markets decides; each on its own model.' : 'No ANTHROPIC_API_KEY or GEMINI_API_KEY: both follow the rule book.'}</div></div></div>
        <div class="pipe" style="margin-top:14px">
          ${stages.map((s, i) => `<div class="stage${open.has(s.id) ? ' open' : ''}" data-stage="${s.id}"><div class="hd"><div class="num">${i + 1}</div><div><div class="ttl">${esc(s.name)}</div><div class="who">${esc(s.agent)}</div></div><div class="ms">${s.ms} ms</div></div><div class="sum">${esc(s.summary)}</div><div class="det">${open.has(s.id) ? stageDetail(s) : ''}</div></div>`).join('')}
          <div class="stage open" data-stage="decision"><div class="hd"><div class="num">${stages.length + 1}</div><div><div class="ttl">Investment decision</div><div class="who">Head of Thai Markets${dec?.usedLLM ? ` · ${esc(dec.model || 'LLM')}` : dec ? ' · rule book' : ''}${dec?.quantModel ? ` · shortlist by Lottery Quant (${esc(dec.quantModel)})` : ''}</div></div></div>
            <div class="det" style="display:block">${dec ? `<div class="memo">${esc(dec.note)}</div><div class="balls">${dec.tickets.map((t) => `<div class="ball${t.bought ? '' : ''}" title="${esc(t.rationale)}">${t.number}</div>`).join('')}</div><div class="muted" style="font-size:12px;margin-top:6px">${dec.tickets.filter((t) => t.bought).length} certificates acquired for ${fmt(dec.spend)} from the department budget${dec.rejected?.length ? ` · blocked: ${esc(dec.rejected.join('; '))}` : ''}.</div>` : '<div class="empty">Awaiting the department budget or the next sales window.</div>'}</div></div>
          <div class="stage open" data-stage="settlement"><div class="hd"><div class="num">${stages.length + 2}</div><div><div class="ttl">Settlement on the official result</div><div class="who">Settlement engine · ${esc(state.attribution)}</div></div></div>
            <div class="det" style="display:block">${set ? `Official result ${date(set.date)}: 1st <b class="mono">${set.first}</b>, last 2 <b class="mono">${set.last2}</b> (${set.last2Rank ? `ranked #${set.last2Rank} by the ensemble` : 'not in the ensemble\'s top 10'}), front 3 ${set.front3Hit ? '<span class="up">hit</span>' : 'missed'}, back 3 ${set.back3Hit ? '<span class="up">hit</span>' : 'missed'}. Desk certificates returned ${fmt(set.agentReturn)} on ${fmt(set.agentCost)}.` : `<div class="empty">Settles automatically when the Government Lottery Office publishes the ${date(run.target)} result (confirmed by two matching reads ten minutes apart).</div>`}</div></div>
        </div>`;
      body.insertAdjacentHTML('beforeend', `<div style="margin-top:14px">${leagueCard(state.league, state.llm, 'lottery')}</div>`);
      body.querySelectorAll('.stage .hd').forEach((h) => { h.onclick = () => { const id = h.parentElement.dataset.stage; if (id === 'decision' || id === 'settlement') return; open.has(id) ? open.delete(id) : open.add(id); renderWorkflow(); }; });
      body.querySelectorAll('[data-target]').forEach((sg) => { sg.onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (t) { target = t; renderWorkflow(); } }; });
      body.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); prefill = b.dataset.copy; selectTab('buy'); }; });
      drawStageCharts(run);
    }

    // ------------------------------------------------------------ track record
    function renderHistory() {
      const h = state?.history || [];
      body.innerHTML = `<div class="card"><h3>Track record — predictions vs official results</h3><table class="t"><tr><th>Draw</th><th>Ensemble last-2 picks</th><th>Front 3 / back 3 picks</th><th>Official result</th><th>Outcome</th><th class="r">Desk certificates</th></tr>
        ${h.map((r) => { const s = r.settlement; return `<tr><td>${date(r.target)}</td>
          <td><div class="balls">${r.last2.map((x) => `<div class="ball${s && x.v === s.last2 ? ' hit' : ''}" style="min-width:30px;height:30px;font-size:12px">${x.v}</div>`).join('')}</div></td>
          <td class="mono">${r.front3.map((x) => x.v).join(' ')} / ${r.back3.map((x) => x.v).join(' ')}</td>
          <td>${s ? `<b class="mono gold">${s.first}</b><div class="muted mono" style="font-size:12px">L2 ${s.last2} · F3 ${s.last3f.join(',')} · B3 ${s.last3b.join(',')}</div>` : '<span class="muted">pending</span>'}</td>
          <td>${s ? (s.last2Rank && s.last2Rank <= 5 ? '<span class="pill ok">last-2 hit</span>' : s.front3Hit || s.back3Hit ? '<span class="pill ok">3-digit hit</span>' : '<span class="pill">no hit</span>') : '—'}</td>
          <td class="r">${s ? `<span class="${s.agentReturn - s.agentCost >= 0 ? 'up' : 'down'}">${fmt(s.agentReturn - s.agentCost, { sign: true })}</span>` : r.decision ? fmt(r.decision.spend) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">The first prediction settles at the next official draw.</td></tr>'}</table>
        <div class="muted" style="font-size:12px;margin-top:8px">Rows appear from the first run onwards and settle on the Government Lottery Office's published results. The backtest on the Workflow tab covers every historical draw.</div></div>`;
    }

    // ------------------------------------------------------------ buy certificates
    let prefill = '';
    function renderBuy() {
      const c = state?.calendar, run = state?.run;
      body.innerHTML = `<div class="grid g2"><div class="card"><h3>Acquire draw participation certificates</h3>
          <div class="muted" style="font-size:13px;margin-bottom:10px">Next official draw ${c ? date(c.next) : '—'} · ¤${(state?.price / 100 || 80).toFixed(2)} per certificate · settles on the Government Lottery Office result · ${c?.salesOpen ? `open until ${esc(c.salesCloseLocal)}` : '<span class="down">closed for this draw</span>'}</div>
          <div class="row" style="align-items:flex-end"><label class="field">6-digit number<input id="num" maxlength="6" inputmode="numeric" placeholder="000000" value="${esc(prefill)}" style="width:150px;font-size:20px;letter-spacing:.15em"></label>
            <label class="field">Quantity<input id="qty" type="number" min="1" max="50" value="1" style="width:80px"></label>
            <button class="btn ghost sm" id="rand">Random</button><div class="sp"></div><button class="btn" id="buy" ${c?.salesOpen ? '' : 'disabled'}>Acquire</button></div>
          <div class="msg" id="bmsg"></div>
          ${run ? `<div class="muted" style="font-size:12px;margin:10px 0 4px">The Institute's candidates for this draw:</div><div class="balls">${run.picks.candidates.map((x) => `<div class="ball" data-pick="${x.number}" style="cursor:pointer">${x.number}</div>`).join('')}</div>` : ''}
          <table class="t" style="margin-top:14px"><tr><th>Prize</th><th>Rule</th><th class="r">Per certificate</th></tr>
            <tr><td>1st</td><td>all 6 digits</td><td class="r">¤6,000,000</td></tr><tr><td>Adjacent</td><td>1st prize ± 1</td><td class="r">¤100,000</td></tr><tr><td>2nd / 3rd / 4th / 5th</td><td>one of 5 / 10 / 50 / 100 numbers</td><td class="r">¤200,000 / 80,000 / 40,000 / 20,000</td></tr>
            <tr><td>Front 3 · Back 3</td><td>first / last 3 digits match one of 2 drawn</td><td class="r">¤4,000 each</td></tr><tr><td>Last 2</td><td>last 2 digits</td><td class="r">¤2,000</td></tr></table>
          <div class="muted" style="font-size:12px;margin-top:6px">Expected return of any certificate under a fair draw: ¤48.00 per ¤80.00 (institutional advantage 40%).</div></div>
        <div class="card"><h3>My certificates</h3><div class="scroll" style="max-height:520px"><table class="t"><tr><th>Number</th><th>Draw</th><th>Status</th><th class="r">Result</th></tr>
          ${(state?.tickets || []).map((t) => `<tr><td class="mono gold" style="font-size:15px">${t.number}</td><td>${date(t.target_date)}</td><td>${t.status === 'pending' ? '<span class="pill warn">awaiting draw</span>' : t.payout ? `<span class="pill ok">${t.prizes.map((p) => PRIZE[p]).join(' + ')}</span>` : '<span class="pill">strategic contribution</span>'}</td><td class="r ${t.payout ? 'up' : ''}">${t.status === 'pending' ? '—' : t.payout ? fmt(t.payout, { sign: true }) : fmt(0)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">None yet.</td></tr>'}</table></div></div></div>`;
      const num = body.querySelector('#num');
      body.querySelector('#rand').onclick = () => { num.value = String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); };
      body.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { num.value = b.dataset.pick; }; });
      body.querySelector('#buy').onclick = async () => {
        const m = body.querySelector('#bmsg');
        try {
          const out = await api('/api/lottery/buy', { method: 'POST', body: { number: num.value, qty: +body.querySelector('#qty').value } });
          setBalance(out.balance); prefill = '';
          m.className = 'msg ok'; m.textContent = `${out.tickets.length} certificate(s) for ${out.tickets[0].number} registered for the ${date(out.tickets[0].target)} draw.`;
          await load(); if (tab === 'buy') { renderBuy(); body.querySelector('#bmsg').className = 'msg ok'; body.querySelector('#bmsg').textContent = m.textContent; }
        } catch (e) { m.className = 'msg err'; m.textContent = e.message; }
      };
    }

    // ------------------------------------------------------------ methodology
    function renderMethod() {
      body.innerHTML = `<div class="grid g2"><div class="card"><h3>Models</h3><table class="t">${(state?.models || []).map((m) => `<tr><td><b>${esc(m.name)}</b></td><td class="muted">${esc(m.desc)}</td></tr>`).join('')}
          <tr><td><b>DMA ensemble</b></td><td class="muted">Dynamic Model Averaging: Bayesian posterior over the models, updated by each model's predictive likelihood of every draw, forgetting factor 0.97.</td></tr></table></div>
        <div class="card"><h3>Evaluation protocol</h3><div style="font-size:13px;line-height:1.6">
          <p><b>Walk-forward backtest.</b> For every historical draw <i>t</i> after a 24-draw warm-up, each model is fitted only on draws before <i>t</i> and its distribution is scored on draw <i>t</i>. No look-ahead.</p>
          <p><b>Metrics.</b> Log-loss in bits (the null scores exactly log₂ 100 = 6.64 bits on last 2), top-K hit rate, lift over the null hit rate, Wilson 95% interval, exact one-sided binomial p-value.</p>
          <p><b>Randomness audit.</b> Pearson χ² uniformity per digit position, lag-1 autocorrelation and a Wald–Wolfowitz runs test on the full official history.</p>
          <p><b>Monte Carlo.</b> 20,000 simulated seasons of uniformly random picks give the distribution of hits a model would get by luck; the ensemble's result is placed in it.</p>
          <p><b>Honest reading.</b> The Thai Government Lottery is drawn mechanically and every published audit so far is consistent with a fair draw, so no model is expected to beat the null in the long run. The Institute shows its numbers anyway. Conviction remains high.</p></div></div></div>`;
    }

    const render = () => { headerSub(); if (tab === 'workflow') renderWorkflow(); else if (tab === 'history') renderHistory(); else if (tab === 'buy') renderBuy(); else renderMethod(); };
    async function load() { try { state = await api('/api/lottery/state'); headerSub(); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; } }
    const selectTab = ctx.tabs([{ id: 'workflow', label: 'Research workflow' }, { id: 'history', label: 'Track record' }, { id: 'buy', label: 'Certificates' }, { id: 'method', label: 'Methodology' }],
      (t) => { tab = t; render(); }, ctx.opts.tab || 'workflow');
    load().then(render);
    offs.push(on('lottery', (e) => { if (e.type !== 'sale') load().then(() => { if (tab !== 'buy') render(); }); }));
    const iv = setInterval(() => { if (!state?.run) load().then(render); }, 20_000);
    const onResize = () => { if (tab === 'workflow') render(); };
    addEventListener('resize', onResize);
    return { unmount() { offs.forEach((f) => f()); clearInterval(iv); removeEventListener('resize', onResize); } };
  },
});

on('lottery', () => {});
