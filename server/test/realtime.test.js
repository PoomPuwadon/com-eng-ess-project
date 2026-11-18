import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { VAULT } from '../ledger.js';
import { slotOffset, memberPose, dropPoint, BASKET_Y } from '../realtime/basket.js';
import { fightPrices, racePrices, payoutFor, priceFromProb, MARGIN, speedFromTps, MAX_TPS } from '../realtime/pricing.js';
import { resolvePunch, inRing, RING, PAVILION_Y, COOLDOWN_MS, DMG } from '../realtime/boxing.js';
import { pickRacers, TRACK_LEN, grandstandSpot } from '../realtime/race.js';

const quiet = { log() {}, warn() {}, error() {} };
const mkApp = () => createApp({ dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, allowClosedFills: true, lotteryBackfillFrom: '2020-01-01', adminPassword: 'sesame', maxPlayers: 50 }, quiet);

/** a fake socket: records every message the hub sends */
function client(app, name, device = 'pc') {
  const { token, player } = app.auth.register(name, 'pw-' + name);
  const inbox = [];
  let closed = null;
  const c = app.hub.connect({ send: (m) => inbox.push(typeof m === 'string' ? JSON.parse(m) : m), close: (code) => { closed = code; } });
  let rid = 0;
  const api = {
    c, player, inbox, get closed() { return closed; },
    say: (m) => app.hub.message(c, JSON.stringify(m)),
    /** send with a request id; returns the ack */
    ask: (m) => { const id = ++rid; app.hub.message(c, JSON.stringify({ ...m, rid: id })); return inbox.find((x) => x.t === 'ack' && x.rid === id); },
    last: (t) => [...inbox].reverse().find((x) => x.t === t),
    pose: (f, x, y, z, yaw = 0, r = null) => app.hub.message(c, JSON.stringify({ t: 'pose', f, x, y, z, yaw, r, s: 0 })),
  };
  api.say({ t: 'hello', token, device });
  return api;
}

// ---------------------------------------------------------------- auth
test('auth: register, sign in, wrong password, duplicate names, admin console password', () => {
  const app = mkApp();
  const a = app.auth.register('Gordon', 'greed-is-good');
  assert.ok(a.token && a.player.id);
  assert.equal(a.player.balance, 1_000_000, 'new accounts get the starting balance through the ledger');
  const b = app.auth.login('gordon', 'greed-is-good'); // names are case-insensitive
  assert.equal(b.player.id, a.player.id);
  assert.notEqual(b.token, a.token, 'each sign-in gets its own device token');
  assert.equal(app.players.auth(a.token).id, app.players.auth(b.token).id, 'both tokens stay valid');
  assert.throws(() => app.auth.login('Gordon', 'nope'), /not recognised/);
  assert.throws(() => app.auth.login('Nobody', 'x'), /not recognised/);
  assert.throws(() => app.auth.register('GORDON', 'other'), /already/);
  assert.equal(app.auth.enter('Gordon', 'greed-is-good').player.id, a.player.id);
  assert.equal(app.auth.enter('Bud', 'blue-horseshoe').created, true);
  assert.equal(app.auth.verifyAdmin('sesame'), true);
  assert.equal(app.auth.verifyAdmin('admin123'), false);
  assert.equal(app.auth.verifyAdmin(''), false);
  assert.ok(app.ledger.reconcile().ok);
});

test('hub: presence, device type, role elevation (many CEOs), staff-only controls', () => {
  const app = mkApp();
  const a = client(app, 'Alpha', 'pc'), b = client(app, 'Bravo', 'mobile'), c = client(app, 'Charlie');
  assert.equal(a.last('welcome').role, 'player');
  a.pose('L0', 1, 0, 2, 0.5, 'grand_lobby'); b.pose('VT-02', 100, 53.5, 0);
  const rows = app.hub.snapshot();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((r) => r[0] === b.c.id).slice(1, 4), ['Bravo', 'player', 'mobile']);
  assert.equal(b.ask({ t: 'kick', target: a.c.id }).ok, false, 'players cannot kick');
  assert.equal(a.ask({ t: 'elevate', password: 'wrong', role: 'ceo' }).ok, false);
  assert.equal(a.ask({ t: 'elevate', password: 'sesame', role: 'ceo' }).ok, true);
  assert.equal(b.ask({ t: 'elevate', password: 'sesame', role: 'ceo' }).ok, true, 'no single-CEO lock');
  assert.equal(app.hub.conns().filter((x) => x.role === 'ceo').length, 2);
  assert.equal(b.ask({ t: 'role', role: 'admin' }).data.role, 'admin', 'switch CEO <-> Admin in the panel');
  assert.equal(c.ask({ t: 'role', role: 'ceo' }).ok, false, 'switching needs the console password first');
  assert.equal(b.ask({ t: 'tour', on: true }).ok, false, 'admins cannot toggle Tour Mode');
  assert.equal(a.ask({ t: 'tour', on: true }).ok, true);
  assert.equal(app.hub.tour.on, true);
  assert.equal(app.hub.tour.floor, 'L0');
  // the host changes floor: the tour floor follows, nobody is teleported
  const before = c.inbox.filter((m) => m.t === 'teleport').length;
  a.pose('VT-03', 120, 67, 30, 0, 'muay_thai_arena');
  assert.equal(app.hub.tour.floor, 'VT-03');
  assert.equal(c.inbox.filter((m) => m.t === 'teleport').length, before);
  // teleport all: admins may
  assert.equal(b.ask({ t: 'teleportAll' }).data.moved, 2);
  const tp = c.last('teleport');
  assert.deepEqual([tp.floor, tp.x, tp.z], ['VT-02', 100, 0]);
});

test('hub: kick disconnects the player, removes them for everyone, and blocks an instant rejoin', () => {
  const app = mkApp();
  const admin = client(app, 'Admin'), target = client(app, 'Target'), watcher = client(app, 'Watcher');
  admin.ask({ t: 'elevate', password: 'sesame', role: 'admin' });
  assert.equal(admin.ask({ t: 'kick', target: admin.c.id }).ok, false, 'no self-kick');
  const r = admin.ask({ t: 'kick', target: target.c.id });
  assert.equal(r.ok, true);
  assert.equal(target.last('kicked').text, 'You have been kicked by an admin');
  assert.equal(target.closed, 4003);
  assert.equal(watcher.last('left').id, target.c.id, 'everyone drops the avatar');
  assert.ok(!app.hub.snapshot().some((row) => row[0] === target.c.id));
  // reconnecting straight away with the same account is refused
  const again = app.hub.connect({ send: () => {}, close: () => {} });
  const token = app.auth.login('Target', 'pw-Target').token;
  const box = [];
  again.send = (m) => box.push(m);
  app.hub.message(again, JSON.stringify({ t: 'hello', token }));
  assert.equal(box[0].t, 'kicked');
});

// ---------------------------------------------------------------- basket
test('basket geometry: members ride above the host, in distinct slots, and land round the host', () => {
  for (const n of [1, 2, 5, 7, 12, 30, 49]) {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const o = slotOffset(i, n);
      assert.equal(o.dy, BASKET_Y);
      const k = `${o.dx.toFixed(2)},${o.dz.toFixed(2)}`;
      assert.ok(!seen.has(k), `slot ${i}/${n} collides`); seen.add(k);
    }
  }
  const host = { x: 10, y: 15, z: -4, floor: 'OT-01' };
  const p = memberPose(host, 0, 1);
  assert.deepEqual([p.x, p.y, p.z], [10, 15 + BASKET_Y, -4]);
  const d = dropPoint(host, 3, 6);
  assert.equal(d.floor, 'OT-01'); assert.equal(d.y, 15);
  assert.ok(Math.hypot(d.x - 10, d.z + 4) > 1.5, 'nobody lands on the host');
});

test('hub: gather into the basket parents players to the CEO (incl. lift rides); put down releases them', () => {
  const app = mkApp();
  const ceo = client(app, 'Ceo'), p1 = client(app, 'One'), p2 = client(app, 'Two'), adm = client(app, 'Adm');
  ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' });
  adm.ask({ t: 'elevate', password: 'sesame', role: 'admin' });
  assert.equal(adm.ask({ t: 'gather' }).ok, false, 'admins carry no basket');
  ceo.pose('L0', 0, 0, 0); p1.pose('B1', 50, -10, 3); p2.pose('VT-01', 90, 37, 1); adm.pose('L0', 3, 0, 3);
  assert.equal(ceo.ask({ t: 'gather' }).data.members, 3);
  assert.equal(p1.last('basket').host, ceo.c.id);
  // the CEO rides a lift up 15 m and walks: members follow, whatever they send
  ceo.pose('OT-01', 4, 15, 2);
  p1.pose('B1', 999, -10, 999);
  const m = app.hub.poseOf(p1.c.id);
  assert.equal(m.floor, 'OT-01');
  assert.ok(Math.abs(m.y - (15 + BASKET_Y)) < 1e-9);
  assert.ok(Math.hypot(m.x - 4, m.z - 2) < 3);
  const row = app.hub.snapshot().find((r) => r[0] === p2.c.id);
  assert.equal(row[8], 'OT-01', 'everyone else sees the member in the basket');
  // put down: everyone gets a safe landing on the CEO's floor
  assert.equal(ceo.ask({ t: 'putDown' }).data.released, 3);
  const tp = p1.last('teleport');
  assert.equal(tp.floor, 'OT-01'); assert.equal(tp.y, 15); assert.equal(tp.safe, true);
  assert.equal(p1.last('basket').host, null);
  assert.equal(app.hub.baskets.size, 0);
  // a host disconnecting also puts the basket down
  ceo.ask({ t: 'gather' });
  app.hub.disconnect(ceo.c);
  assert.equal(app.hub.baskets.size, 0);
  assert.equal(p2.last('basket').host, null);
});

// ---------------------------------------------------------------- pricing + payouts
test('pricing: equal at the bell; low health / trailing pays more; payouts round down', () => {
  assert.deepEqual(fightPrices([100, 100]), [1.88, 1.88]);
  const [hi, lo] = fightPrices([100, 10]);
  assert.ok(lo > 8 * hi, `comeback pricing ${hi} vs ${lo}`);
  assert.equal(fightPrices([100, 0])[1], null, 'a knocked-out boxer cannot be backed');
  const r = racePrices([0, 0, 0]);
  assert.ok(r.every((x) => x === r[0]));
  const [lead, trail] = racePrices([200, 100]);
  assert.ok(trail > lead * 2);
  assert.equal(priceFromProb(0.5), +(Math.floor(((1 - MARGIN) / 0.5) * 100) / 100).toFixed(2));
  assert.equal(payoutFor(333, 1.88), 626); // 626.04 -> 626
  assert.equal(speedFromTps(100), speedFromTps(MAX_TPS), 'tap rate is capped');
  // a fast clicker (10-14 taps/s) needs 25-40 s for the lap (user, 2026-11-18)
  for (const tps of [10, 12, MAX_TPS]) { const secs = TRACK_LEN / speedFromTps(tps); assert.ok(secs >= 25 && secs <= 40, `${tps} tps -> ${secs.toFixed(1)} s`); }
});

test('boxing: server hit detection (reach, facing, cooldown), KO ends the bout and settles the book', () => {
  const app = mkApp();
  const ceo = client(app, 'Host'), red = client(app, 'Red'), blue = client(app, 'Blue'), fan = client(app, 'Fan'), fan2 = client(app, 'Fan2');
  ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' });
  ceo.pose('VT-03', 140, 67, 20);
  assert.equal(fan.ask({ t: 'boxStart', ids: [red.c.id, blue.c.id] }).ok, false);
  const st = ceo.ask({ t: 'boxStart', ids: [red.c.id, blue.c.id] });
  assert.equal(st.ok, true);
  assert.equal(red.last('teleport').objective, 'boxing');
  assert.equal(fan.last('teleport').floor, 'VT-03');
  const vault0 = app.ledger.balance(VAULT);
  // positions at equal pricing
  const s1 = fan.ask({ t: 'boxStake', boxer: blue.c.id, amount: 10_000 });
  assert.equal(s1.ok, true); assert.equal(s1.data.price, 1.88);
  assert.equal(red.ask({ t: 'boxStake', boxer: blue.c.id, amount: 10_000 }).ok, false, 'competitors cannot hold positions');
  assert.equal(app.ledger.balance(`PLAYER:${fan.player.id}`), 990_000);
  // punches outside the ring miss
  const y = PAVILION_Y + RING.top;
  red.pose('VT-03', 170, 67, 0); blue.pose('VT-03', 171, 67, 0);
  app.hub.tick();
  assert.equal(red.ask({ t: 'punch', yaw: 0 }).data.miss, true);
  // in the ring, facing each other (yaw PI/2 faces -x)
  red.pose('VT-03', 120.5, y, 0); blue.pose('VT-03', 119.5, y, 0);
  app.hub.tick();
  assert.ok(inRing(app.hub.poseOf(red.c.id)));
  const cool = () => { app.hub.boxing.view(); }; void cool;
  let r = blue.ask({ t: 'punch', yaw: -Math.PI / 2 }); // blue at 119.5 faces +x towards red
  assert.ok(r.data.hit === red.c.id, JSON.stringify(r));
  r = blue.ask({ t: 'punch', yaw: -Math.PI / 2 });
  assert.equal(r.data.cooldown, true, 'cooldown between punches');
  // facing away: miss
  assert.equal(resolvePunch({ id: 'a', x: 0, z: 0, yaw: -Math.PI / 2 }, [{ id: 'b', x: -1, z: 0, hp: 50 }]), null);
  assert.equal(resolvePunch({ id: 'a', x: 0, z: 0, yaw: Math.PI / 2 }, [{ id: 'b', x: -1, z: 0, hp: 50 }]).id, 'b');
  assert.equal(resolvePunch({ id: 'a', x: 0, z: 0, yaw: Math.PI / 2 }, [{ id: 'b', x: -3, z: 0, hp: 50 }]), null, 'out of reach');
  // red is hurt: the comeback price on red is now higher than blue's
  const prices = app.hub.boxing.view().prices;
  assert.ok(prices[0] > prices[1]);
  const s2 = fan2.ask({ t: 'boxStake', boxer: red.c.id, amount: 10_000 });
  assert.ok(s2.data.price > 1.88);
  // knock red out (fast-forward the clock past each cooldown)
  const box = app.hub.boxing;
  let landed = 1;
  for (let i = 0; i < 60 && box.active(); i++) { app.hub.advanceClock(COOLDOWN_MS + 10); if (blue.ask({ t: 'punch', yaw: -Math.PI / 2 }).data?.hit) landed++; }
  assert.ok(landed >= Math.ceil(100 / DMG[1]), `a knockout takes many clean hits (${landed})`);
  const v = box.view();
  assert.equal(v.phase, 'ended');
  assert.equal(v.winner, blue.c.id);
  assert.equal(app.ledger.balance(`PLAYER:${fan.player.id}`), 990_000 + payoutFor(10_000, 1.88));
  assert.equal(app.ledger.balance(`PLAYER:${fan2.player.id}`), 990_000);
  assert.equal(app.ledger.balance(VAULT), vault0 - (payoutFor(10_000, 1.88) - 10_000) + 10_000);
  assert.ok(app.ledger.reconcile().ok);
});

test('race: randomise prefers non-boxers; click speed drives the horse; the leader takes the line and pays out', () => {
  const ids = pickRacers([{ id: 'a', boxed: true }, { id: 'b', boxed: false }, { id: 'c', boxed: false }, { id: 'd', boxed: true }], 2);
  assert.deepEqual(ids.sort(), ['b', 'c']);
  assert.equal(pickRacers([{ id: 'a', boxed: true }, { id: 'b', boxed: false }], 2).length, 2, 'falls back to boxers when too few');
  assert.equal(pickRacers([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 9).length, 3);

  const app = mkApp();
  const ceo = client(app, 'Host'), fast = client(app, 'Fast'), slow = client(app, 'Slow'), fan = client(app, 'Fan');
  ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' });
  ceo.pose('VT-04', 60, 92, 0); fast.pose('VT-04', 60, 92, 0); slow.pose('VT-04', 60, 92, 0); fan.pose('VT-04', 60, 92, 0);
  assert.equal(ceo.ask({ t: 'raceStart', ids: [fast.c.id, slow.c.id] }).ok, true);
  const st = fan.ask({ t: 'raceStake', racer: slow.c.id, amount: 5_000 });
  assert.equal(st.ok, true);
  const race = app.hub.race;
  const view0 = race.view(); assert.equal(view0.phase, 'countdown');
  app.hub.advanceClock(3100); // past the gate
  race.tick(0.1);
  assert.equal(race.view().phase, 'running');
  // simulate 10 Hz: fast taps 10/s, slow taps 2/s
  for (let k = 0; k < 900 && race.active(); k++) {
    fast.say({ t: 'tap', n: 1 });
    if (k % 5 === 0) slow.say({ t: 'tap', n: 1 });
    app.hub.advanceClock(100);
    race.tick(0.1);
  }
  const v = race.view();
  assert.equal(v.phase, 'ended');
  assert.equal(v.winner, fast.c.id);
  assert.ok(v.racers.find((r) => r.conn === fast.c.id).d >= TRACK_LEN - 1e-6);
  assert.equal(app.ledger.balance(`PLAYER:${fan.player.id}`), 995_000, 'backing the trailing horse was a strategic contribution');
  assert.ok(app.ledger.reconcile().ok);
});

// ---------------------------------------------------------------- treasury (CEO money controls)
test('hub: a CEO adds, removes and sets any guest\'s money through the ledger; nobody else can', () => {
  const app = mkApp();
  const ceo = client(app, 'Boss'), adm = client(app, 'Staffer'), g1 = client(app, 'Guest1'), g2 = client(app, 'Guest2');
  const bal = (x) => app.ledger.balance(`PLAYER:${x.player.id}`);
  assert.equal(ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' }).ok, true);
  assert.equal(adm.ask({ t: 'elevate', password: 'sesame', role: 'admin' }).ok, true);
  assert.equal(g1.ask({ t: 'money', target: g2.c.id, op: 'add', amount: 50 }).ok, false, 'guests cannot');
  assert.equal(adm.ask({ t: 'money', target: g2.c.id, op: 'add', amount: 50 }).ok, false, 'admins cannot (CEO only)');
  assert.equal(adm.ask({ t: 'balances' }).ok, false);

  assert.equal(ceo.ask({ t: 'money', target: g1.c.id, op: 'add', amount: 250.5 }).ok, true);
  assert.equal(bal(g1), 1_000_000 + 25_050);
  assert.match(g1.last('toast').text, /added your liquidity: \+¤250\.50/);
  assert.equal(g1.last('balance').balance, 1_025_050, 'the guest\'s wallet updates live');

  ceo.ask({ t: 'money', target: g1.c.id, op: 'remove', amount: 99_999_999 });
  assert.equal(bal(g1), 0, 'remove never takes a balance below zero');
  ceo.ask({ t: 'money', target: g2.c.id, op: 'set', amount: 42 });
  assert.equal(bal(g2), 4_200);

  const all = ceo.ask({ t: 'money', target: 'all', op: 'set', amount: 1000 });
  assert.equal(all.ok, true);
  for (const x of [ceo, adm, g1, g2]) assert.equal(bal(x), 100_000, 'set applies to every connected guest');
  assert.equal(all.data.balances.length, 4);
  ceo.ask({ t: 'money', target: 'all', op: 'add', amount: 1 });
  assert.equal(bal(g2), 100_100);

  for (const bad of [{ op: 'add', amount: 0 }, { op: 'add', amount: -5 }, { op: 'add', amount: 'lots' }, { op: 'steal', amount: 5 }, { op: 'set', amount: 1e12 }])
    assert.equal(ceo.ask({ t: 'money', target: g1.c.id, ...bad }).ok, false, JSON.stringify(bad));
  assert.equal(ceo.ask({ t: 'money', target: 'nobody', op: 'add', amount: 5 }).ok, false);
  assert.ok(app.ledger.reconcile().ok, 'the ledger still reconciles');
});

test('race start: riders stay for their horses, every other player goes to the VT-04 grandstand facing the track', () => {
  const app = mkApp();
  const ceo = client(app, 'Host'), r1 = client(app, 'Rider1'), r2 = client(app, 'Rider2'), s1 = client(app, 'Fan1'), s2 = client(app, 'Fan2');
  assert.equal(ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' }).ok, true);
  const tps = (x) => x.inbox.filter((m) => m.t === 'teleport').length;
  const before = [r1, r2].map(tps);
  assert.equal(ceo.ask({ t: 'raceStart', ids: [r1.c.id, r2.c.id] }).ok, true);
  assert.deepEqual([r1, r2].map(tps), before, 'riders are not sent to the stand');
  const spots = [ceo, s1, s2].map((x) => x.last('teleport'));
  for (const t of spots) {
    assert.equal(t.floor, 'VT-04');
    assert.ok(t.z < -50 && t.z > -60 && Math.abs(t.x - 149) < 10, `on the grandstand top walkway (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
    assert.ok(Math.abs(t.y - 99.5) < 0.01);
    assert.ok(Math.abs(Math.atan2(-Math.sin(t.yaw), -Math.cos(t.yaw)) - Math.atan2(149 - t.x, 0 - t.z)) < 1e-6, 'facing the middle of the track');
  }
  assert.ok(new Set(spots.map((t) => t.x.toFixed(2))).size === 3, 'everyone gets their own spot');
  const a = grandstandSpot(0, 40), b = grandstandSpot(39, 40);
  assert.ok(Math.abs(a.x - b.x) < 80, 'a crowd of 40 still fits on the stand');
});

test('tour: a guest who joins while Tour Mode is on arrives on the host\'s floor; admins and non-tour joiners are not moved', () => {
  const app = mkApp();
  const early = client(app, 'Early');
  assert.equal(early.inbox.filter((m) => m.t === 'teleport').length, 0, 'no tour: nobody is moved on join');
  const ceo = client(app, 'Boss');
  ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' });
  ceo.pose('VT-03', 120, 67, 30, 0, 'muay_thai_arena');
  ceo.ask({ t: 'tour', on: true });
  const late = client(app, 'Late');
  const tp = late.last('teleport');
  assert.ok(tp, 'a joiner during a tour is teleported');
  assert.equal(tp.floor, 'VT-03');
  assert.ok(Math.hypot(tp.x - 120, tp.z - 30) < 3.5, 'lands in a ring round the host');
});

test('bring: a CEO can teleport one guest to their position; guests cannot, and you cannot bring yourself', () => {
  const app = mkApp();
  const ceo = client(app, 'Boss'), guest = client(app, 'Guest'), other = client(app, 'Other');
  ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' });
  ceo.pose('VT-02', 100, 53.5, 10, 1.2, 'sports_arena');
  assert.equal(guest.ask({ t: 'bring', target: other.c.id }).ok, false, 'guests cannot bring anyone');
  assert.equal(ceo.ask({ t: 'bring', target: ceo.c.id }).ok, false, 'no self-bring');
  assert.equal(ceo.ask({ t: 'bring', target: 'nobody' }).ok, false, 'unknown target');
  assert.equal(ceo.ask({ t: 'bring', target: guest.c.id }).ok, true);
  const tp = guest.last('teleport');
  assert.equal(tp.floor, 'VT-02');
  assert.ok(Math.hypot(tp.x - 100, tp.z - 10) < 2.5, 'lands beside the CEO');
  assert.equal(other.inbox.filter((m) => m.t === 'teleport').length, 0, 'only the chosen guest moves');
});

test('asset protection: staff call a key AI agent up to Security HQ; guests cannot; it is shared state, can be released, and expires on its own', () => {
  const app = mkApp();
  const ceo = client(app, 'Boss'), guest = client(app, 'Guest');
  ceo.ask({ t: 'elevate', password: 'sesame', role: 'ceo' });
  assert.equal(guest.ask({ t: 'summonAgent', agent: 'head_trader', kind: 'feedback' }).ok, false, 'guests cannot');
  assert.equal(ceo.ask({ t: 'summonAgent', agent: 'nobody', kind: 'feedback' }).ok, false, 'unknown agent');
  assert.equal(ceo.ask({ t: 'summonAgent', agent: 'head_trader', kind: 'nonsense' }).ok, false, 'unknown review');
  assert.equal(ceo.ask({ t: 'summonAgent', agent: 'head_trader', kind: 'feedback' }).ok, true);
  assert.equal(ceo.ask({ t: 'summonAgent', agent: 'risk_officer', kind: 'suite', seconds: 1 }).ok, true);
  const m = app.hub.meta().custody;
  assert.deepEqual(m.map((c) => [c.agent, c.kind, c.by]).sort(), [['head_trader', 'feedback', 'Boss'], ['risk_officer', 'suite', 'Boss']]);
  assert.ok(m.find((c) => c.agent === 'risk_officer').until - m.find((c) => c.agent === 'risk_officer').since >= 15_000, 'durations are clamped to at least 15 s');
  assert.ok(guest.inbox.some((x) => x.t === 'chat' || x.t === 'announce' || JSON.stringify(x).includes('Asset Protection')), 'everyone is told, in the firm\'s own words');
  assert.equal(guest.ask({ t: 'releaseAgent', agent: 'head_trader' }).ok, false, 'guests cannot release');
  assert.equal(ceo.ask({ t: 'releaseAgent', agent: 'head_trader' }).ok, true);
  assert.equal(ceo.ask({ t: 'releaseAgent', agent: 'head_trader' }).ok, false, 'already released');
  assert.deepEqual(app.hub.meta().custody.map((c) => c.agent), ['risk_officer']);
  app.hub.advanceClock(5 * 60_000); app.hub.tick(); // the review runs its course
  assert.deepEqual(app.hub.meta().custody, [], 'agents go back to their desk when the time is up');
});
