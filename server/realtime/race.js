// VT-04 Equine Performance Centre: a click-speed race between connected players.
// Each racer's horse runs at a speed set by their taps per second (server-measured over a rolling
// window, capped). The server owns distances, the finish and the position book; the client only
// animates horses along the real 3D track from the distance.
import { createBook } from './book.js';
import { racePrices, speedFromTps, MAX_TPS } from './pricing.js';

export const TRACK_LEN = 2 * (170 - 128) + 2 * Math.PI * 30; // one lap of the VT-04 dirt oval (centre line)
export const COUNTDOWN_MS = 3000, CLOSE_AT = 0.85, WINDOW_MS = 1000;

// Spectators go to the top walkway of the crescent Members' Grandstand (floors/equineCentre.js: arcs
// about (149, 160), walkway r 214.45..218.5 at +7 m), spread either side of the centre, facing the track.
export const EQ_FLOOR_Y = 92;
const STAND = { gx: 149, gz: 160, r: 216.6, y: 7.5, mid: -Math.PI / 2 };
/** grandstand spot i of n (world), looking at the middle of the track (149, 0) */
export function grandstandSpot(i, n) {
  const step = Math.min(0.012, 0.36 / Math.max(1, n)); // ~2.6 m apart, never wider than the stand
  const a = STAND.mid + (i - (n - 1) / 2) * step;
  const x = STAND.gx + STAND.r * Math.cos(a), z = STAND.gz + STAND.r * Math.sin(a);
  const dx = 149 - x, dz = 0 - z;
  return { floor: 'VT-04', x, y: EQ_FLOOR_Y + STAND.y, z, yaw: Math.atan2(-dx, -dz) };
}

/**
 * Randomise racers: prefer players who have not boxed in VT-03; if there are too few, fill up from
 * the rest. candidates: [{ id, boxed }]; rand: () => [0,1).
 */
export function pickRacers(candidates, count, rand = Math.random) {
  const n = Math.max(2, Math.min(6, Math.round(count) || 2));
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const fresh = shuffle(candidates.filter((c) => !c.boxed)), rest = shuffle(candidates.filter((c) => c.boxed));
  return [...fresh, ...rest].slice(0, n).map((c) => c.id);
}

export function createRace(ctx) {
  let race = null, seq = 0;

  const view = () => race && {
    id: race.id, phase: race.phase, host: race.hostConn, len: TRACK_LEN, goAt: race.goAt,
    racers: race.racers.map((r) => ({ conn: r.conn, playerId: r.playerId, name: r.name, lane: r.lane, d: +r.d.toFixed(2), tps: +r.tps.toFixed(1), v: +r.v.toFixed(2), place: r.place ?? null })),
    prices: racePrices(race.racers.map((r) => r.d)), open: positionsOpen(), winner: race.winner ?? null,
    positions: race.book.positions.length, pool: race.book.positions.reduce((s, p) => s + p.stake, 0), result: race.result || null,
  };
  const positionsOpen = () => Boolean(race && (race.phase === 'countdown' || (race.phase === 'running' && Math.max(...race.racers.map((r) => r.d)) < TRACK_LEN * CLOSE_AT)));

  function start(host, connIds) {
    if (race && (race.phase === 'running' || race.phase === 'countdown')) throw Object.assign(new Error('A race is already under way.'), { status: 409 });
    const all = ctx.conns();
    const list = [...new Set(connIds)].map((id) => all.find((c) => c.id === id)).filter(Boolean).slice(0, 6);
    if (list.length < 2) throw Object.assign(new Error('Select 2–6 connected riders.'), { status: 400 });
    const id = `eq${ctx.now().toString(36)}${++seq}`;
    race = {
      id, phase: 'countdown', hostConn: host.id, goAt: ctx.now() + COUNTDOWN_MS,
      racers: list.map((c, i) => ({ conn: c.id, playerId: c.playerId, name: c.name, lane: i, d: 0, v: 0, tps: 0, taps: [] })),
      book: createBook(ctx.ledger, id), finishOrder: [],
    };
    for (const c of list) ctx.release(c.id);
    // everyone else (the host included) goes to the grandstand, like the stands for a VT-03 bout
    const spectators = all.filter((c) => !list.includes(c));
    spectators.forEach((c, i) => { ctx.release(c.id); ctx.teleport(c.id, grandstandSpot(i, spectators.length)); });
    ctx.broadcast({ t: 'race_go', race: view() });
    ctx.announce(`Equine session: ${race.racers.map((r) => r.name).join(', ')} to the gate. Tap faster = faster horse.`);
    ctx.changed();
    return view();
  }

  function tap(conn, n = 1) {
    if (!race || race.phase !== 'running') return;
    const r = race.racers.find((x) => x.conn === conn.id);
    if (!r) return;
    const now = ctx.now();
    const k = Math.max(0, Math.min(4, Math.round(Number(n) || 0))); // batched client taps, at most 4 per message
    for (let i = 0; i < k; i++) r.taps.push(now);
  }

  function finish(reason) {
    if (!race || (race.phase !== 'running' && race.phase !== 'countdown')) return null;
    const order = [...race.racers].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.d - a.d);
    const winner = reason === 'finish' || race.phase === 'running' ? order[0] : null;
    const settled = race.book.settle(winner ? new Set([winner.conn]) : null);
    race.phase = 'ended'; race.winner = winner ? winner.conn : null;
    race.result = { reason, winner: winner?.name || null, order: order.map((r) => r.name), void: !winner };
    for (const p of settled) ctx.notify(p.playerId, p.status === 'gain' ? `Realised gain: ¤${(p.payout / 100).toFixed(2)} on ${p.label}` : p.status === 'void' ? `Position on ${p.label} returned.` : `Strategic contribution to the Treasury Reserve: ¤${(p.stake / 100).toFixed(2)}.`);
    for (const pid of new Set(settled.map((p) => p.playerId))) ctx.balance(pid);
    ctx.announce(winner ? `Equine session closed (${reason}). ${winner.name} takes the line.` : `Equine session cancelled (${reason}). All positions returned.`);
    ctx.changed();
    return view();
  }

  function stake(conn, racerConn, amount) {
    if (!positionsOpen()) throw Object.assign(new Error('Pricing for this session has closed.'), { status: 409 });
    if (race.racers.some((r) => r.conn === conn.id)) throw Object.assign(new Error('Riders may not hold positions on their own session.'), { status: 403 });
    const i = race.racers.findIndex((r) => r.conn === racerConn);
    if (i < 0) throw Object.assign(new Error('Unknown rider.'), { status: 400 });
    const price = racePrices(race.racers.map((r) => r.d))[i];
    const p = race.book.open({ playerId: conn.playerId, pick: racerConn, stake: Math.round(amount), price, label: race.racers[i].name });
    ctx.balance(conn.playerId); ctx.changed();
    return { id: p.id, price, stake: p.stake, label: p.label };
  }

  /** dt in seconds; called by the hub tick (10 Hz) */
  function tick(dt) {
    if (!race) return;
    const now = ctx.now();
    if (race.phase === 'countdown' && now >= race.goAt) { race.phase = 'running'; ctx.changed(); }
    if (race.phase !== 'running') return;
    const host = ctx.poseOf(race.hostConn);
    if (host && host.floor !== 'VT-04') { finish('the host left the centre'); return; }
    for (const r of race.racers) {
      if (r.place) continue;
      r.taps = r.taps.filter((t) => now - t <= WINDOW_MS);
      r.tps = Math.min(MAX_TPS, r.taps.length * (1000 / WINDOW_MS));
      const target = ctx.poseOf(r.conn) ? speedFromTps(r.tps) : 0; // disconnected riders pull up
      r.v += (target - r.v) * Math.min(1, dt * 3); // the horse eases into its new speed
      r.d = Math.min(TRACK_LEN, r.d + r.v * dt);
      if (r.d >= TRACK_LEN) { r.place = race.finishOrder.length + 1; race.finishOrder.push(r.conn); }
    }
    if (race.finishOrder.length) finish('finish');
  }

  return {
    start, tap, stake, finish, tick, view,
    active: () => Boolean(race && (race.phase === 'running' || race.phase === 'countdown')),
    isRacer: (connId) => Boolean(race && (race.phase === 'running' || race.phase === 'countdown') && race.racers.some((r) => r.conn === connId)),
  };
}
