// The Probability Research Institute's live state, as the 3D room needs it. liveData.js writes it from
// /api/lottery/state (on load, on server events, every 5 min); OT-02 reads it by polling `version` from its own
// update loop (no subscriptions to leak when the floor streams out). Everything shown on the OT-02 screens comes
// from here: official GLO results, the models' real forecasts and backtests, the desk's real certificates.

export const LOTTO = { version: 0, data: null };

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** '2026-11-16' -> '16 พ.ย. 69' (Buddhist-era short year, as printed on the tickets) */
export const thDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_TH[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`; };
/** '2026-11-16' -> '16 NOV 2026' */
export const enDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_EN[m - 1]} ${y}`; };

/** Reduce the API response to what the room draws (computed once per update, not per frame). */
export function setLottoRoom(s) {
  const run = s.run;
  const st = (id) => run?.stages.find((x) => x.id === id);
  const models = st('models')?.data, ens = st('ensemble')?.data, mc = st('montecarlo')?.data, audit = st('audit')?.data, feat = st('features')?.data;
  const L2 = models?.L2;
  const weight = (id) => ens?.L2.weights.find((w) => w.id === id)?.w ?? 0;
  const metrics = L2 ? L2.metrics.map((m) => ({ ...m, w: m.id === 'ensemble' ? 1 : weight(m.id), next: (L2.perModelNext?.[m.id] || []).slice(0, 3) })) : [];
  const grid = feat?.last2Grid || audit?.last2Grid || null;
  const digitFreq = grid ? Array.from({ length: 10 }, (_, d) => grid[d].reduce((a, b) => a + b, 0) + grid.reduce((a, row) => a + row[d], 0)) : null;
  LOTTO.data = {
    calendar: s.calendar, latest: s.latest, draws: s.draws, attribution: s.attribution,
    recent: s.recentDraws || st('ingest')?.data.recent || [],
    sales: s.sales || { n: 0, buyers: 0 },
    run: run && {
      id: run.id, target: run.target, createdAt: run.createdAt, trigger: run.trigger,
      stages: run.stages.map(({ id, name, agent, ms, summary }) => ({ id, name, agent, ms, summary })),
      metrics, ensemble: metrics.find((m) => m.id === 'ensemble'),
      audit: audit && { tests: audit.tests, autocorrelation: audit.autocorrelation, runs: audit.runs },
      grid, digitFreq, coldest: feat?.coldest || [],
      mc: mc && { sims: mc.sims, hits: mc.hits, draws: mc.draws, p0: mc.p0, empiricalP: mc.empiricalP, histogram: mc.histogram, hitPath: mc.hitPath },
      picks: run.picks, decision: run.decision, settlement: run.settlement,
    },
    history: s.history || [],
  };
  LOTTO.version++;
}
