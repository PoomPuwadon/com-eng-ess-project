// VT-03 Combat Sports Analytics Pavilion: a live bout between connected players.
// Server-authoritative: the server decides every hit (reach, facing, cooldown), keeps health, and
// settles the position book. Boxers walk the real walkout road into the ring.
import { createBook } from './book.js';
import { fightPrices } from './pricing.js';

export const RING = { x: 120, z: 0, half: 5.5, top: 1.2 }; // VT-03 ring (world x/z; top above the slab)
export const PAVILION_Y = 67;
// slower drain (user, 2026-11-18): 4-7 per landed punch, one punch per 650 ms -> at least ~18 clean hits
// (~12 s of perfect hitting, usually 30 s+) to empty a 100-point condition bar
export const REACH = 1.9, COOLDOWN_MS = 650, DMG = [4, 7], CONE = Math.cos((65 * Math.PI) / 180);

/** walkout start for boxer i of n: the black focus room / walkout road (east of the ring) */
export function walkoutSpot(i, n) {
  const z = n <= 1 ? 0 : -1.6 + (3.2 * i) / (n - 1);
  return { floor: 'VT-03', x: 174 - (i % 2) * 1.2, y: PAVILION_Y, z };
}
/** spectator spot i of n: the upper bowl either side of the walkout road (looking at the ring) */
export function standSpot(i, n) {
  const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), per = Math.max(1, Math.ceil(n / 2));
  const a = side * (0.22 + (0.5 * k) / per), r = 33 + (k % 3) * 2.6;
  return { floor: 'VT-03', x: RING.x + Math.cos(a) * r, y: PAVILION_Y, z: RING.z + Math.sin(a) * r, yaw: Math.atan2(Math.cos(a), Math.sin(a)) };
}
export const inRing = (p) => p && p.floor === 'VT-03' && Math.abs(p.x - RING.x) < RING.half && Math.abs(p.z - RING.z) < RING.half && p.y > PAVILION_Y + RING.top - 0.3;

/**
 * Resolve one punch. attacker/defenders: { id, x, z, yaw, hp } (yaw = camera yaw; forward = (-sin, -cos)).
 * Returns the defender hit (nearest in reach inside the facing cone) or null.
 */
export function resolvePunch(att, others) {
  const fx = -Math.sin(att.yaw), fz = -Math.cos(att.yaw);
  let best = null, bd = Infinity;
  for (const o of others) {
    if (o.id === att.id || o.hp <= 0) continue;
    const dx = o.x - att.x, dz = o.z - att.z, d = Math.hypot(dx, dz);
    if (d > REACH) continue;
    if (d > 0.05 && (dx * fx + dz * fz) / d < CONE) continue; // must be in front (clinched = always hits)
    if (d < bd) { best = o; bd = d; }
  }
  return best;
}

export function createBoxing(ctx) {
  let round = null, seq = 0;
  const boxedPlayers = new Set(); // playerIds who have boxed (for the VT-04 "already boxed" badge)

  const view = () => round && {
    id: round.id, phase: round.phase, host: round.hostConn, startedAt: round.startedAt,
    boxers: round.boxers.map((b) => ({ conn: b.conn, playerId: b.playerId, name: b.name, hp: b.hp, inRing: b.inRing, ko: b.hp <= 0 })),
    prices: fightPrices(round.boxers.map((b) => b.hp)), winner: round.winner ?? null, positions: round.book.positions.length,
    pool: round.book.positions.reduce((s, p) => s + p.stake, 0), result: round.result || null,
  };

  function start(host, connIds) {
    if (round && round.phase === 'active') throw Object.assign(new Error('A bout is already in progress.'), { status: 409 });
    const all = ctx.conns();
    const boxers = [...new Set(connIds)].map((id) => all.find((c) => c.id === id)).filter(Boolean);
    if (boxers.length < 2) throw Object.assign(new Error('Select at least two connected competitors.'), { status: 400 });
    const id = `mt${ctx.now().toString(36)}${++seq}`;
    round = {
      id, phase: 'active', hostConn: host.id, hostFloor: host.pose?.floor, startedAt: ctx.now(),
      boxers: boxers.map((c) => ({ conn: c.id, playerId: c.playerId, name: c.name, hp: 100, last: 0, inRing: false })),
      book: createBook(ctx.ledger, id),
    };
    for (const b of round.boxers) boxedPlayers.add(b.playerId);
    boxers.forEach((c, i) => {
      ctx.release(c.id); // out of any basket first
      ctx.teleport(c.id, { ...walkoutSpot(i, boxers.length), yaw: Math.PI / 2, objective: 'boxing' });
    });
    const spectators = all.filter((c) => !round.boxers.some((b) => b.conn === c.id));
    spectators.forEach((c, i) => { ctx.release(c.id); ctx.teleport(c.id, standSpot(i, spectators.length)); });
    ctx.announce(`Combat session open: ${round.boxers.map((b) => b.name).join(' vs ')}. Positions are open at equal pricing.`);
    ctx.changed();
    return view();
  }

  function finish(reason) {
    if (!round || round.phase !== 'active') return null;
    const standing = round.boxers.filter((b) => b.hp > 0);
    let winner = null;
    if (standing.length === 1) winner = standing[0];
    else if (standing.length > 1) {
      const top = Math.max(...standing.map((b) => b.hp)), lead = standing.filter((b) => b.hp === top);
      winner = lead.length === 1 ? lead[0] : null; // a level card is void: every stake goes back
    }
    const settled = round.book.settle(winner ? new Set([winner.conn]) : null);
    round.phase = 'ended'; round.winner = winner ? winner.conn : null;
    round.result = { reason, winner: winner?.name || null, void: !winner };
    for (const p of settled) ctx.notify(p.playerId, p.status === 'gain' ? `Realised gain: ¤${(p.payout / 100).toFixed(2)} on ${p.label}` : p.status === 'void' ? `Position on ${p.label} returned (level card).` : `Strategic contribution to the Treasury Reserve: ¤${(p.stake / 100).toFixed(2)}.`);
    for (const pid of new Set(settled.map((p) => p.playerId))) ctx.balance(pid);
    ctx.announce(winner ? `Combat session closed (${reason}). ${winner.name} takes the decision.` : `Combat session closed (${reason}). Level card: all positions returned.`);
    ctx.changed();
    return view();
  }

  function punch(conn, yaw) {
    if (!round || round.phase !== 'active') return null;
    const me = round.boxers.find((b) => b.conn === conn.id);
    if (!me || me.hp <= 0) return null;
    const now = ctx.now();
    if (now - me.last < COOLDOWN_MS) return { cooldown: true };
    me.last = now;
    if (!me.inRing) return { miss: true, reason: 'Walk into the ring first.' };
    ctx.broadcast({ t: 'swing', by: conn.id }); // every spectator sees the punch thrown (kit punch animation)
    const poses = round.boxers.filter((b) => b.inRing).map((b) => { const p = ctx.poseOf(b.conn); return p && { id: b.conn, x: p.x, z: p.z, hp: b.hp, b }; }).filter(Boolean);
    const mine = ctx.poseOf(conn.id);
    if (!mine) return null;
    const hit = resolvePunch({ id: conn.id, x: mine.x, z: mine.z, yaw: Number(yaw) || 0 }, poses);
    if (!hit) return { miss: true };
    const dmg = DMG[0] + Math.floor(Math.random() * (DMG[1] - DMG[0] + 1));
    hit.b.hp = Math.max(0, hit.b.hp - dmg);
    ctx.broadcast({ t: 'hit', by: conn.id, to: hit.b.conn, dmg, hp: hit.b.hp });
    if (hit.b.hp <= 0) ctx.announce(`${hit.b.name} is down!`);
    if (round.boxers.filter((b) => b.hp > 0).length <= 1) finish('knockout');
    else ctx.changed();
    return { hit: hit.b.conn, dmg };
  }

  function stake(conn, boxerConn, amount) {
    if (!round || round.phase !== 'active') throw Object.assign(new Error('No combat session is open.'), { status: 409 });
    if (round.boxers.some((b) => b.conn === conn.id)) throw Object.assign(new Error('Competitors may not hold positions on their own session.'), { status: 403 });
    const i = round.boxers.findIndex((b) => b.conn === boxerConn);
    if (i < 0) throw Object.assign(new Error('Unknown competitor.'), { status: 400 });
    const price = fightPrices(round.boxers.map((b) => b.hp))[i];
    if (!price) throw Object.assign(new Error('That competitor is no longer standing.'), { status: 409 });
    const p = round.book.open({ playerId: conn.playerId, pick: boxerConn, stake: Math.round(amount), price, label: round.boxers[i].name });
    ctx.balance(conn.playerId); ctx.changed();
    return { id: p.id, price, stake: p.stake, label: p.label };
  }

  /** called every server tick: ring entry, disconnects, the host leaving the room */
  function tick() {
    if (!round || round.phase !== 'active') return;
    let dirty = false;
    for (const b of round.boxers) {
      const p = ctx.poseOf(b.conn);
      if (!p) { if (b.hp > 0) { b.hp = 0; dirty = true; ctx.announce(`${b.name} has left the building.`); } continue; }
      const r = inRing(p);
      if (r !== b.inRing) { b.inRing = r; dirty = true; }
    }
    const host = ctx.poseOf(round.hostConn);
    if (host && host.floor !== 'VT-03') return finish('the host left the pavilion');
    if (round.boxers.filter((b) => b.hp > 0).length <= 1) return finish('knockout');
    if (dirty) ctx.changed();
  }

  return {
    start, finish, punch, stake, tick, view,
    active: () => Boolean(round && round.phase === 'active'),
    isBoxer: (connId) => Boolean(round && round.phase === 'active' && round.boxers.some((b) => b.conn === connId)),
    hasBoxed: (playerId) => boxedPlayers.has(playerId),
  };
}
