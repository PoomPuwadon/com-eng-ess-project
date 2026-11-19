// In-world hotspots: walk up to a roulette table, onto the trading floor, or into the Probability
// Research Institute and press E.
//   roulette  -> sit at that exact table (src/apps/rouletteSeat.js)
//   markets / research -> open the terminal application

import { nearKiosk } from './apps/chartKiosk.js';

/** The roulette table nearest to (x, z) on VT-01, from the floor's own table list. */
export function nearestTable(leisureCtx, x, z) {
  const wheels = leisureCtx?.roulette?.wheels || [];
  let best = null, bd = Infinity;
  for (const w of wheels) { const d = Math.hypot(x - (w.tx + 0.3), z - w.z); if (d < bd) { bd = d; best = w; } }
  return best && { table: best, dist: bd };
}

export function hotspotAt(player, leisureCtx) {
  const f = player.floor?.id, room = player.room?.id;
  if (f === 'VT-01') {
    const p = player.pos;
    const t = nearestTable(leisureCtx, p.x, p.z)?.table;
    if (t && Math.abs(p.x - (t.tx + 0.3)) < 2.4 && Math.abs(p.z - t.z) < 2.6) return { app: 'roulette', table: t, label: 'E — Take a seat at the Rotational Variance Instrument' };
    const g = leisureCtx?.games, near = (list, r) => (list || []).find((m) => Math.hypot(p.x - m.x, p.z - m.z) < r);
    for (const [kind, r, label] of [['slots', 1.5, 'E — Automated Yield Terminal: spin for real'], ['blackjack', 3.4, 'E — Twenty-One Advisory Table: take a seat'], ['baccarat', 3.8, 'E — Private Banking Table: place a position'], ['craps', 3.6, 'E — Kinetic Probability Pit: roll'], ['poker', 3.8, 'E — Private Card Salon: take a seat (hold\'em vs the house)']]) {
      const m = near(g?.[kind], r); if (m) return { app: 'game', kind, at: m, label };
    }
    return null;
  }
  if (f === 'OT-01' && nearKiosk(player)) return { app: 'chartkiosk', label: 'E — Chart Desk terminal: paste or upload a stock graph for an UP / DOWN reading' };
  if (f === 'OT-01' && room === 'trading_floor') return { app: 'markets', label: 'E — Markets terminal (or M anywhere) · C — the Chart Desk terminal by the entrance' };
  if (f === 'VT-02') return { app: 'sports', label: 'E — Sports Analytics terminal: the marquee fixture, real fixtures, house pricing, your positions' };
  if (f === 'OT-02' && room === 'lottery_institute') return { app: 'research', label: 'E — Research workstation: the Institute\'s live lottery models (or press L anywhere)' };
  return null;
}
