// In-world hotspots: walk up to a roulette table, onto the trading floor, or into the Probability
// Research Institute and press E.
//   roulette  -> sit at that exact table (src/apps/rouletteSeat.js)
//   markets / research -> open the terminal application

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
    return null;
  }
  if (f === 'OT-01' && room === 'trading_floor') return { app: 'markets', alt: 'chartdesk', label: 'E — Markets terminal (or M anywhere) · C — Chart Desk: upload a stock graph for an UP / DOWN reading' };
  if (f === 'VT-02') return { app: 'sports', label: 'E — Sports Analytics terminal: the marquee fixture, real fixtures, house pricing, your positions' };
  if (f === 'OT-02' && room === 'lottery_institute') return { app: 'research', label: 'E — Research workstation: the Institute\'s live lottery models (or press L anywhere)' };
  return null;
}
