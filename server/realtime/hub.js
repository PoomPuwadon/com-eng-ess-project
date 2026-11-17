// Authoritative real-time presence (up to 50 players): who is connected, where they stand, their
// role and device; the executive console (roles, kick), Tour Mode with Teleport All and the CEO's
// basket, and the live arena sessions (VT-03 bouts, VT-04 races).
//
// Transport-agnostic: a connection is { send(obj), close(code, reason) }. server/realtime/ws.js binds
// it to WebSockets; the tests drive it with fake connections.
//
// Roles: 'player' (default) | 'admin' | 'ceo'. Many CEOs may exist at once (no single-CEO lock).
// Elevation needs the console password (ADMIN_PASSWORD) once per player; it lasts until the server restarts.
import { memberPose, dropPoint } from './basket.js';
import { createBoxing } from './boxing.js';
import { createRace, pickRacers } from './race.js';

export const SNAPSHOT_HZ = 10;
const KICK_BAN_MS = 30_000;
const STAFF = new Set(['admin', 'ceo']);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const short = (s, n) => String(s ?? '').slice(0, n);

export function createHub({ players, auth, ledger, config, log = console }) {
  const conns = new Map(); // connId -> conn
  const elevated = new Map(); // playerId -> 'admin' | 'ceo' (passed the console password)
  const banned = new Map(); // playerId -> until (ms) after a kick
  const attempts = new Map(); // connId -> [timestamps] of console password attempts
  const baskets = new Map(); // hostConnId -> [memberConnIds]
  let seq = 0;
  let tour = { on: false, host: null, hostName: null, floor: null, room: null, since: null };
  let dirtyMeta = true;

  const list = () => [...conns.values()].filter((c) => c.ready);
  const send = (c, msg) => { try { c.send(msg); } catch { /* socket gone */ } };
  const broadcast = (msg) => { for (const c of list()) send(c, msg); };
  const err = (status, message) => Object.assign(new Error(message), { status });
  const staff = (c) => STAFF.has(c.role);
  const needStaff = (c) => { if (!staff(c)) throw err(403, 'Executive clearance required.'); };
  const needCeo = (c) => { if (c.role !== 'ceo') throw err(403, 'Only a Chief Executive may do that.'); };
  const basketOf = (connId) => { for (const [h, m] of baskets) if (m.includes(connId)) return h; return null; };

  function poseOf(connId) {
    const c = conns.get(connId);
    if (!c || !c.ready || !c.pose) return null;
    const host = basketOf(connId);
    if (host) {
      const hp = conns.get(host)?.pose, m = baskets.get(host);
      if (hp) return { ...memberPose(hp, m.indexOf(connId), m.length), yaw: c.pose.yaw, floor: hp.floor, room: hp.room, spd: 0 };
    }
    return c.pose;
  }

  // ---------------------------------------------------------------- game contexts
  let skew = 0; // tests fast-forward the game clock
  const gameCtx = {
    conns: list, ledger, poseOf, broadcast, now: () => Date.now() + skew,
    send: (id, msg) => { const c = conns.get(id); if (c) send(c, msg); },
    teleport: (id, dest) => { const c = conns.get(id); if (c) send(c, { t: 'teleport', ...dest }); },
    release: (id) => { const h = basketOf(id); if (h) { baskets.set(h, baskets.get(h).filter((m) => m !== id)); if (!baskets.get(h).length) baskets.delete(h); pushBasket(h); sendBasket(id, null); } },
    notify: (playerId, text) => { for (const c of list()) if (c.playerId === playerId) send(c, { t: 'toast', text }); },
    balance: (playerId) => { const bal = ledger.balance(`PLAYER:${playerId}`); for (const c of list()) if (c.playerId === playerId) send(c, { t: 'balance', balance: bal }); },
    announce: (text) => broadcast({ t: 'announce', text }),
    changed: () => { dirtyMeta = true; },
  };
  const boxing = createBoxing(gameCtx);
  const race = createRace(gameCtx);

  // ---------------------------------------------------------------- basket
  function sendBasket(memberId, host) {
    const c = conns.get(memberId);
    if (!c) return;
    if (!host) { send(c, { t: 'basket', host: null }); return; }
    const m = baskets.get(host);
    send(c, { t: 'basket', host, slot: m.indexOf(memberId), n: m.length });
  }
  function pushBasket(host) { for (const m of baskets.get(host) || []) sendBasket(m, host); dirtyMeta = true; }

  function gather(host) {
    needCeo(host);
    const taken = new Set([...baskets.values()].flat());
    const members = list().filter((c) => c.id !== host.id && !baskets.has(c.id) && !taken.has(c.id) && !boxing.isBoxer(c.id) && !race.isRacer(c.id)).map((c) => c.id);
    const prev = baskets.get(host.id) || [];
    const all = [...new Set([...prev, ...members])];
    if (!all.length) throw err(409, 'Nobody else is available to gather.');
    baskets.set(host.id, all);
    pushBasket(host.id);
    gameCtx.announce(`${host.name} has gathered ${all.length} guest${all.length === 1 ? '' : 's'} into the Executive Basket.`);
    return { members: all.length };
  }

  /** put the basket down: everyone lands on the host's floor in a ring round the host */
  function putDown(hostId) {
    const m = baskets.get(hostId);
    if (!m) return { released: 0 };
    const hp = conns.get(hostId)?.pose;
    baskets.delete(hostId);
    m.forEach((id, i) => {
      sendBasket(id, null);
      if (hp) gameCtx.teleport(id, { ...dropPoint(hp, i, m.length), safe: true });
    });
    dirtyMeta = true;
    return { released: m.length };
  }

  // ---------------------------------------------------------------- tour
  function setTour(c, on) {
    needCeo(c);
    tour = on ? { on: true, host: c.id, hostName: c.name, floor: c.pose?.floor || null, room: c.pose?.room || null, since: Date.now() } : { on: false, host: null, hostName: null, floor: null, room: null, since: null };
    gameCtx.announce(on ? `Executive Tour now in session, hosted by ${c.name}.` : 'The Executive Tour has concluded. Thank you for your continued confidence.');
    dirtyMeta = true;
    return tour;
  }
  function teleportAll(c) {
    needStaff(c);
    if (!c.pose) throw err(409, 'Your position is not known yet.');
    let n = 0;
    for (const o of list()) {
      if (o.id === c.id || basketOf(o.id) || boxing.isBoxer(o.id) || race.isRacer(o.id)) continue;
      send(o, { t: 'teleport', floor: c.pose.floor, x: c.pose.x, y: c.pose.y, z: c.pose.z, yaw: c.pose.yaw, safe: true, by: c.name }); n++;
    }
    gameCtx.announce(`${c.name} has convened everyone at ${c.pose.floor}.`);
    return { moved: n };
  }

  // ---------------------------------------------------------------- connection lifecycle
  function connect(transport, meta = {}) {
    const c = { id: `c${(++seq).toString(36)}`, ready: false, send: transport.send, close: transport.close, ip: meta.ip, pose: null, role: 'player', device: 'pc', joinedAt: Date.now() };
    conns.set(c.id, c);
    return c;
  }

  function hello(c, msg) {
    const p = players.auth(msg.token);
    if (!p) { send(c, { t: 'error', code: 'auth', text: 'Session not recognised. Please sign in again.' }); c.close(4001, 'auth'); return; }
    const ban = banned.get(p.id);
    if (ban && ban > Date.now()) { send(c, { t: 'kicked', text: 'You have been kicked by an admin' }); c.close(4003, 'kicked'); return; }
    if (list().length >= (config.maxPlayers || 50)) { send(c, { t: 'error', code: 'full', text: 'The building is at capacity (50 guests). Please try again shortly.' }); c.close(4002, 'full'); return; }
    Object.assign(c, { ready: true, playerId: p.id, name: p.name, device: msg.device === 'mobile' ? 'mobile' : 'pc', role: elevated.get(p.id) || 'player', account: auth?.accountOf?.(p.id) ? 'member' : 'guest' });
    send(c, { t: 'welcome', id: c.id, name: c.name, role: c.role, elevated: elevated.has(p.id), hz: SNAPSHOT_HZ, meta: meta() });
    gameCtx.announce(`${c.name} has entered the building.`);
    dirtyMeta = true;
  }

  function disconnect(c) {
    if (!conns.has(c.id)) return;
    conns.delete(c.id);
    if (baskets.has(c.id)) putDown(c.id); // a host leaving drops the basket safely
    else gameCtx.release(c.id);
    if (tour.host === c.id) { const next = list().find((o) => o.role === 'ceo'); tour = next ? { ...tour, host: next.id, hostName: next.name } : { on: false, host: null, hostName: null, floor: null, room: null, since: null }; }
    if (c.ready) { broadcast({ t: 'left', id: c.id }); dirtyMeta = true; }
  }

  function kick(by, target) {
    needStaff(by);
    const c = conns.get(target);
    if (!c || !c.ready) throw err(404, 'That guest is no longer connected.');
    if (c.id === by.id) throw err(400, 'You cannot remove yourself.');
    banned.set(c.playerId, Date.now() + KICK_BAN_MS);
    send(c, { t: 'kicked', text: 'You have been kicked by an admin', by: by.name });
    log.log?.(`[hub] ${by.name} (${by.role}) removed ${c.name}`);
    disconnect(c);
    c.close(4003, 'kicked');
    gameCtx.announce(`${c.name} has been escorted from the premises.`);
    return { kicked: c.id };
  }

  function elevate(c, password, role) {
    const now = Date.now(), a = (attempts.get(c.id) || []).filter((t) => now - t < 60_000);
    if (a.length >= 5) throw err(429, 'Too many attempts. Wait a minute.');
    a.push(now); attempts.set(c.id, a);
    if (!auth.verifyAdmin(password)) throw err(401, 'Credential not recognised.');
    const r = role === 'ceo' ? 'ceo' : 'admin';
    elevated.set(c.playerId, r);
    for (const o of list()) if (o.playerId === c.playerId) { o.role = r; send(o, { t: 'role', role: r, elevated: true }); }
    dirtyMeta = true;
    return { role: r };
  }

  function setRole(c, role) {
    if (!elevated.has(c.playerId)) throw err(403, 'Unlock the executive console first (Alt+F2).');
    const r = role === 'ceo' ? 'ceo' : role === 'admin' ? 'admin' : 'player';
    if (r !== 'ceo' && baskets.has(c.id)) putDown(c.id); // only CEOs carry the basket
    if (r === 'player') elevated.delete(c.playerId); else elevated.set(c.playerId, r);
    for (const o of list()) if (o.playerId === c.playerId) { o.role = r; send(o, { t: 'role', role: r, elevated: r !== 'player' }); }
    dirtyMeta = true;
    return { role: r };
  }

  function setPose(c, p) {
    const floor = short(p.f, 12), prevFloor = c.pose?.floor, prevRoom = c.pose?.room;
    c.pose = { x: num(p.x), y: num(p.y), z: num(p.z), yaw: num(p.yaw), floor, room: short(p.r, 40) || null, spd: Math.min(20, Math.abs(num(p.s))) };
    if (tour.on && c.role === 'ceo' && c.id === tour.host && (floor !== prevFloor || c.pose.room !== prevRoom)) {
      tour.floor = floor; tour.room = c.pose.room; dirtyMeta = true; // follow the host; nobody is moved
    }
    if (floor !== prevFloor) dirtyMeta = true;
  }

  // ---------------------------------------------------------------- messages
  const OPS = {
    pose: (c, m) => setPose(c, m),
    device: (c, m) => { c.device = m.device === 'mobile' ? 'mobile' : 'pc'; dirtyMeta = true; },
    elevate: (c, m) => elevate(c, m.password, m.role),
    role: (c, m) => setRole(c, m.role),
    kick: (c, m) => kick(c, m.target),
    tour: (c, m) => setTour(c, Boolean(m.on)),
    teleportAll: (c) => teleportAll(c),
    gather: (c) => gather(c),
    putDown: (c, m) => { if (m.host && m.host !== c.id) needStaff(c); else needCeo(c); return putDown(m.host || c.id); },
    boxStart: (c, m) => { needCeo(c); return boxing.start(c, m.ids || []); },
    boxEnd: (c) => { needStaff(c); return boxing.finish('ended by the host'); },
    punch: (c, m) => boxing.punch(c, m.yaw),
    boxStake: (c, m) => boxing.stake(c, m.boxer, num(m.amount)),
    raceStart: (c, m) => { needCeo(c); return race.start(c, m.ids || []); },
    raceRandom: (c, m) => {
      needCeo(c);
      const cands = list().filter((o) => o.id !== c.id).map((o) => ({ id: o.id, boxed: boxing.hasBoxed(o.playerId) }));
      const ids = pickRacers(cands, num(m.count, 4));
      return m.start ? race.start(c, ids) : { ids };
    },
    raceEnd: (c) => { needStaff(c); return race.finish('ended by the host'); },
    tap: (c, m) => race.tap(c, m.n),
    raceStake: (c, m) => race.stake(c, m.racer, num(m.amount)),
  };

  function message(c, raw) {
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') { if (!c.ready) hello(c, m); return; }
    if (!c.ready) return;
    const fn = OPS[m.t];
    if (!fn) return;
    try {
      const out = fn(c, m);
      if (m.rid) send(c, { t: 'ack', rid: m.rid, ok: true, data: out ?? null });
    } catch (e) {
      if (!e.status) log.warn?.('[hub]', m.t, e.message);
      if (m.rid) send(c, { t: 'ack', rid: m.rid, ok: false, error: e.status ? e.message : 'Internal error' });
    }
  }

  // ---------------------------------------------------------------- outbound state
  function meta() {
    return {
      tour, baskets: Object.fromEntries(baskets), boxing: boxing.view(), race: race.view(),
      boxed: [...new Set(list().filter((c) => boxing.hasBoxed(c.playerId)).map((c) => c.id))],
    };
  }
  /** compact per-player rows: [id, name, role, device, x, y, z, yaw, floor, room, spd] */
  function snapshot() {
    return list().map((c) => {
      const p = poseOf(c.id);
      return [c.id, c.name, c.role, c.device, ...(p ? [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), p.floor, p.room, +p.spd.toFixed(1)] : [0, 0, 0, 0, null, null, 0])];
    });
  }
  let last = Date.now();
  function tick() {
    const now = Date.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
    boxing.tick(dt); race.tick(dt);
    const ps = list();
    if (!ps.length) return;
    const raceView = race.active() ? race.view() : null;
    const frame = JSON.stringify({ t: 'snap', at: now, p: snapshot(), ...(raceView ? { race: raceView.racers.map((r) => [r.conn, r.d, r.tps, r.v]) } : {}) });
    for (const c of ps) { try { c.send(frame); } catch { /* gone */ } }
    if (dirtyMeta) { dirtyMeta = false; broadcast({ t: 'meta', meta: meta() }); }
  }

  return {
    connect, message, disconnect, tick, meta, snapshot, poseOf, kick,
    conns: list, get tour() { return tour; }, baskets, boxing, race,
    advanceClock: (ms) => { skew += ms; }, // tests only
  };
}
