import * as THREE from 'three';
import { FLOOR_BY_ID, ROLES, findRoom, canAccess, landingZone, BANKS } from './layout/building.js';
import { buildExterior, FloorManager } from './world/world.js';
import { updateScreens, updateTicker } from './world/screens.js';
import { Player } from './player.js';
import { ElevatorSystem, zoneAt, rideCheck } from './elevators.js';
import { Life } from './life.js';
import { HUD } from './ui.js';
import { PerfSampler, findPath, planRoute, roomSpawn, ALL_FLOOR_IDS } from './debug.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SCREEN_CTRL, setScreenMode, playBigScreenVideo } from './world/lobbyScreens.js';


// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('c');
const SHOTS = new URLSearchParams(location.search).has('shots'); // dev: keep frame for screenshots
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: SHOTS });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // the ground floor is static: shadows are re-drawn on demand, not every frame
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);

// Phase 1 look (ground floor only for now): filmic tone mapping, sun shadows, bloom on the lights.
// Greybox floors render exactly as before (no tone mapping, no post-processing).
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 2 }));
const DPR = Math.min(devicePixelRatio, 1.5), LUX_DPR = Math.min(devicePixelRatio, 1.25); // Phase 1 effects run at a capped pixel density
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.35, 1.0);
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const ext = buildExterior(scene, renderer);
const LUX_FLOORS = ['L0', 'PLAZA', 'BRIDGE', 'OT-01', 'VT-01', 'VT-02', 'VT-03'];
const LOOK_OF = { PLAZA: 'outdoor', 'OT-01': 'trading', 'VT-01': 'leisure', 'VT-02': 'arena', 'VT-03': 'pavilion' };
// Lighting profiles: the lobby is lit from inside (reflections, chandeliers, lamps, onyx wall) with
// only a soft sun through the glass roof; the plaza gets daylight. Greybox floors keep the old rig.
const LOOKS = {
  off: { tone: THREE.NoToneMapping, exp: 1, env: 0.75, sun: 1.4, sunCol: 0xffffff, hemi: 1.6, sky: 0xffffff, gnd: 0x777766, shadow: false },
  indoor: { tone: THREE.ACESFilmicToneMapping, exp: 0.82, env: 0.5, sun: 0.15, sunCol: 0xffe9cf, hemi: 0.05, sky: 0xfff4e6, gnd: 0x8a6f52, shadow: true },
  outdoor: { tone: THREE.ACESFilmicToneMapping, exp: 0.9, env: 0.5, sun: 1.1, sunCol: 0xfff0dc, hemi: 0.35, sky: 0xdfeaff, gnd: 0x8a7a62, shadow: true },
  // trading floor (reference: bright, warm, even light from the ceiling panels; no sun inside)
  // leisure suite (reference: warm gold from above, orange glow bouncing off the red carpet onto the ceilings)
  leisure: { tone: THREE.ACESFilmicToneMapping, exp: 0.95, env: 0.45, sun: 0, sunCol: 0xfff0dc, hemi: 0.95, sky: 0xffdcae, gnd: 0xff8a50, shadow: false },
  // sports arena (reference: dark indigo hall; the warm-gold ceiling rings, blue neon bands and the screens
  // carry the light; low cool fill; stronger bloom so the light lines glow)
  arena: { tone: THREE.ACESFilmicToneMapping, exp: 1.0, env: 0.28, sun: 0, sunCol: 0xfff0dc, hemi: 0.34, sky: 0xa8b2ff, gnd: 0x1c1f36, shadow: false, bloom: 0.55 },
  // combat pavilion (reference: a dark stadium under a glowing red-gold dome; warm red fill from above, the
  // crown lamps, beams, towers and screens carry the light)
  pavilion: { tone: THREE.ACESFilmicToneMapping, exp: 1.0, env: 0.22, sun: 0, sunCol: 0xfff0dc, hemi: 0.28, sky: 0xff9a78, gnd: 0x1a0e14, shadow: false, bloom: 0.45 },
  trading: { tone: THREE.ACESFilmicToneMapping, exp: 0.92, env: 0.55, sun: 0, sunCol: 0xfff0dc, hemi: 0.85, sky: 0xfff0d8, gnd: 0xc08850, shadow: false },
};
let luxOn = null, lookName = null;
const PERF_OPT = { glow: true, shadows: true, lights: true }; // Perf tests panel switches
function setLook(name) {
  if (name === lookName) return;
  const L = LOOKS[name], wasTone = renderer.toneMapping;
  lookName = name; luxOn = name !== 'off';
  renderer.toneMapping = L.tone; renderer.toneMappingExposure = L.exp;
  scene.environmentIntensity = L.env;
  ext.sun.castShadow = L.shadow && PERF_OPT.shadows; ext.sun.intensity = L.sun; ext.sun.color.set(L.sunCol);
  bloom.strength = L.bloom ?? 0.22;
  ext.hemi.intensity = L.hemi; ext.hemi.color.set(L.sky); ext.hemi.groundColor.set(L.gnd);
  if (wasTone !== L.tone) scene.traverse((o) => { if (o.material && o.material.isMaterial) o.material.needsUpdate = true; });
  const dpr = luxOn ? LUX_DPR : DPR;
  if (renderer.getPixelRatio() !== dpr) { renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight); }
  renderer.shadowMap.needsUpdate = true;
}
let shadowFloor = null;
function renderFrame(cam = camera) {
  if (floors.current !== shadowFloor) {
    shadowFloor = floors.current; renderer.shadowMap.needsUpdate = true;
    if (!PERF_OPT.lights) scene.traverse((o) => { if (o.isPointLight) o.visible = false; });
  } // re-draw shadows when the loaded floors change
  setLook(!LUX_FLOORS.includes(floors.current) ? 'off' : LOOK_OF[floors.current] || 'indoor');
  if (luxOn) { renderPass.camera = cam; composer.render(); } else renderer.render(scene, cam);
}
const floors = new FloorManager(scene);
const player = new Player(camera, canvas);
const elev = new ElevatorSystem(scene);
const life = new Life(scene, elev);
const perf = new PerfSampler(renderer);
let assigned = null; // car assigned to the player by the last call

player.carrier = (p) => { const c = elev.carAt(p.x, p.y, p.z); return c ? c.y : null; };
player.floorHint = () => { const c = elev.carAt(player.pos.x, player.pos.y, player.pos.z); return c && c.at ? FLOOR_BY_ID[c.at] : null; };
elev.occupied = (c) => elev.inDoorway(c, player.pos.x, player.pos.y, player.pos.z) || life.occupies(c);
const allColliders = () => floors.colliders.concat(elev.colliders(player.pos.y));

// ---------------------------------------------------------------- world tick (shared by frames and scripted sims)
function tick(dt, movePlayer = true) {
  if (movePlayer) player.update(dt, allColliders(), floors.shapes);
  if (player.floor && player.floor.id !== floors.current) floors.ensureAround(player.floor.id);
  floors.update(dt, performance.now() / 1000);
  elev.update(dt, floors.landingSets());
  life.update(dt, floors.visibleIds());
}

// ---------------------------------------------------------------- actions
function setRole(role) {
  if (!ROLES.includes(role)) return false;
  player.role = role;
  floors.applyRole(role);
  hud.setRole(role);
  hud.toast(`Role: ${role.toUpperCase()}`, 1.5);
  return true;
}

function placeOn(floorId, x, z, yaw) {
  const f = FLOOR_BY_ID[floorId];
  floors.ensureAround(floorId);
  const blocked = (px, pz) => floors.colliders.some((c) => c.y1 > f.elevation + 0.45 && c.y0 < f.elevation + 1.8 &&
    !(c.lock && canAccess(player.role, c.lock)) && px > c.x0 - 0.5 && px < c.x1 + 0.5 && pz > c.z0 - 0.5 && pz < c.z1 + 0.5);
  if (blocked(x, z)) {
    search: for (let rr = 1; rr < 40; rr += 0.5) for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * rr, pz = z + Math.sin((a / 16) * Math.PI * 2) * rr;
      if (!blocked(px, pz)) { x = px; z = pz; break search; }
    }
  }
  player.place(x, f.elevation, z, yaw);
}

const landingYaw = (lz) => (lz.side === 'w' ? Math.PI / 2 : -Math.PI / 2); // face away from the doors

function teleport(floorId, roomId = null, yaw = null) {
  const f = FLOOR_BY_ID[floorId];
  if (!f) return { ok: false, reason: `unknown floor ${floorId}` };
  let x, z, y = yaw;
  if (roomId) {
    const hit = findRoom(roomId);
    if (!hit || hit.floor.id !== floorId) return { ok: false, reason: `room ${roomId} not on ${floorId}` };
    const s = roomSpawn(roomId);
    x = s.x; z = s.z;
  } else if (f.spawn) { x = f.spawn.x; z = f.spawn.z; y ??= f.spawn.yaw + Math.PI; }
  else if (f.elevators.length) { const lz = f.elevators[0]; x = (lz.x0 + lz.x1) / 2; z = (lz.z0 + lz.z1) / 2; y ??= landingYaw(lz); }
  else { x = (f.bounds.x0 + f.bounds.x1) / 2; z = (f.bounds.z0 + f.bounds.z1) / 2; y ??= -Math.PI / 2; }
  placeOn(floorId, x, z, y ?? player.yaw);
  hud.update(player, perf.stats, uiState());
  return { ok: true, ...state() };
}

// Destination dispatch (landing kiosk) or in-car floor selection.
function requestLift(bank, stop, car = null) {
  const from = car ? (car.at || player.floor.id) : player.floor.id;
  const chk = rideCheck(player.role, bank, stop, from);
  if (!chk.ok) { hud.toast(chk.reason); return chk; }
  if (car) { elev.send(car, stop); hud.toast(`Car ${car.label} → ${stop}`, 2); return { ok: true, car: car.id }; }
  const c = elev.call(bank, from, stop);
  assigned = { car: c, from, to: stop };
  hud.toast(`Please proceed to car ${c.label} → ${stop} ${FLOOR_BY_ID[stop].sign}`, 4);
  return { ok: true, car: c.id };
}

const hud = new HUD({
  onTeleportFloor: (id) => teleport(id),
  onRole: setRole,
  onRide: (bank, stop, car) => requestLift(bank, stop, car),
});

// ---------------------------------------------------------------- scripted walking (verification)
// Uses the real movement, collision and lifts. In 'sim' mode the whole world is stepped at a
// fixed 1/60 s (independent of rendering, so it works in a hidden tab).
const frameWaiters = [];
const nextFrame = () => new Promise((res) => frameWaiters.push(res));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const trail = [];
let simWalking = false;
const DT = 1 / 60;
let simSteps = 0;
async function step(sim) {
  if (sim) {
    tick(DT);
    if (player.floor && trail[trail.length - 1] !== player.floor.id) trail.push(player.floor.id);
    if (++simSteps % 600 === 0) await sleep(0);
    return DT;
  }
  const t1 = performance.now(); await nextFrame(); return (performance.now() - t1) / 1000;
}

async function walkPoints(points, speed, timeoutS, sim) {
  let t = 0, lastProgress = 0;
  const lastPos = player.pos.clone();
  simWalking = sim;
  try {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      for (;;) {
        const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < (i === points.length - 1 ? 0.5 : 0.9)) break;
        player.auto = { dx, dz, speed: Math.min(speed, Math.max(1.5, d * 6)) };
        t += await step(sim);
        if (player.pos.distanceTo(lastPos) > 0.5) { lastPos.copy(player.pos); lastProgress = t; }
        if (t - lastProgress > 3) return { ok: false, blockedAt: state(), reason: 'stuck (collision)' };
        if (t > timeoutS) return { ok: false, blockedAt: state(), reason: 'timeout' };
      }
    }
    return { ok: true, seconds: +t.toFixed(1) };
  } finally { player.auto = null; simWalking = false; }
}

async function waitUntil(cond, timeoutS, sim) {
  let t = 0;
  simWalking = sim;
  try {
    while (!cond()) { t += await step(sim); if (t > timeoutS) return false; }
    return true;
  } finally { simWalking = false; }
}

const clusterIds = () => floors.loadedIds().filter((id) => Math.abs(FLOOR_BY_ID[id].elevation - player.floor.elevation) < 0.1);

async function walkToPoint(target, { speed = 5, sim = true, force = false } = {}) {
  const pts = findPath(clusterIds(), floors.colliders, player.role, player.pos, target, force, floors.shapes);
  if (!pts) return { ok: false, reason: `no path on ${player.floor.id} for role ${player.role}`, blockedAt: state() };
  return walkPoints(pts, speed, 600, sim);
}

async function walkToLift(bank, opts = {}) {
  const lz = landingZone(bank, player.floor.id);
  if (!lz) return { ok: false, reason: `${bank} does not stop at ${player.floor.id}` };
  const w = await walkToPoint({ x: (lz.x0 + lz.x1) / 2, z: (lz.z0 + lz.z1) / 2 }, opts);
  return w.ok ? { ok: true, at: state() } : w;
}

// Ride a real car: call it from the landing, board, ride, step out.
async function ride(bank, to, { speed = 5, sim = true } = {}) {
  const from = player.floor.id;
  const chk = rideCheck(player.role, bank, to, from);
  if (!chk.ok) return { ok: false, reason: chk.reason, blockedAt: state() };
  if (!zoneAt(player.floor, player.pos.x, player.pos.z)) { const w = await walkToLift(bank, { speed, sim }); if (!w.ok) return w; }
  const car = elev.call(bank, from, to);
  const log = [`called ${bank} at ${from} → car ${car.label}`];
  if (!await waitUntil(() => car.at === from && car.door > 0.95, 240, sim)) return { ok: false, reason: `car ${car.label} never arrived`, log };
  const inP = elev.doorPoints(car, from);
  let w = await walkPoints([inP.outside, inP.centre], speed, 60, sim);
  if (!w.ok || !elev.carAt(player.pos.x, player.pos.y, player.pos.z)) return { ok: false, reason: `could not board ${car.label}: ${w.reason || 'outside car'}`, blockedAt: state(), log };
  log.push(`boarded ${car.label}`);
  const y0 = car.y;
  if (!await waitUntil(() => car.at === to && car.door > 0.95, 300, sim)) return { ok: false, reason: `car ${car.label} never reached ${to}`, log, at: state() };
  log.push(`travelled ${Math.abs(car.y - y0).toFixed(1)} m ${car.y > y0 ? 'up' : 'down'} to ${to}`);
  const outP = elev.doorPoints(car, to);
  const lz = landingZone(bank, to);
  w = await walkPoints([outP.outside, { x: (lz.x0 + lz.x1) / 2, z: (lz.z0 + lz.z1) / 2 }], speed, 60, sim);
  if (!w.ok) return { ...w, log };
  log.push(`stepped out at ${player.floor.id}`);
  return { ok: player.floor.id === to, log, at: state() };
}

async function walkTo(floorId, roomId, { speed = 5, force = false, sim = true } = {}) {
  const target = roomSpawn(roomId);
  if (!target || target.floor.id !== floorId) return { ok: false, reason: `room ${roomId} not on ${floorId}` };
  const log = [];
  const legs = planRoute(player.floor.id, floorId, force ? 'ceo' : player.role);
  if (!legs) return { ok: false, reason: `no route for role ${player.role} from ${player.floor.id} to ${floorId}`, path: log };
  for (const leg of legs) {
    const zc = { x: (leg.zone.x0 + leg.zone.x1) / 2, z: (leg.zone.z0 + leg.zone.z1) / 2 };
    const w = await walkToPoint(zc, { speed, sim, force });
    if (!w.ok) return { ...w, path: log };
    log.push(`${player.floor.id}: walked to ${leg.bank} landing`);
    const r = await ride(leg.bank, leg.to, { speed, sim });
    if (!r.ok) return { ok: false, reason: r.reason, blockedAt: r.blockedAt || state(), path: [...log, ...(r.log || [])] };
    log.push(...r.log);
  }
  const w = await walkToPoint(target, { speed, sim, force });
  if (!w.ok) return { ...w, path: log };
  log.push(`${player.floor.id}: walked to ${roomId}`);
  return { ok: player.floor.id === floorId, arrived: state(), path: log };
}

function state() {
  const car = elev.carAt(player.pos.x, player.pos.y, player.pos.z);
  return {
    floorId: player.floor?.id, roomId: player.room?.id || null,
    position: player.pos.toArray().map((v) => +v.toFixed(2)), yaw: +player.yaw.toFixed(2),
    role: player.role, inCar: car ? car.label : null, loadedFloors: floors.loadedIds(),
  };
}

function uiState() {
  const car = elev.carAt(player.pos.x, player.pos.y, player.pos.z);
  const zn = zoneAt(player.floor, player.pos.x, player.pos.z);
  return { car, zone: zn, assigned };
}

// ---------------------------------------------------------------- dev hooks
window.__perf = perf.stats;
window.__debug = {
  teleport, setRole, state, walkTo, walkToLift, ride, walkToPoint,
  walkStraight: (x, z, speed = 3) => walkPoints([{ x, z }], speed, 30, true), // no path-finding: tests that walls/doors stop you
  call: (bank, to) => requestLift(bank, to),
  lifts: () => elev.status(),
  trail: () => [...trail], clearTrail: () => { trail.length = 0; },
  look: (yaw, pitch = 0) => { player.yaw = yaw; player.pitch = pitch; player.update(0, allColliders()); hud.update(player, perf.stats, uiState()); return state(); },
  place: (x, z, yaw, pitch = 0, y = 0) => { placeOn(player.floor.id, x, z, yaw); player.pos.y += y; player.pitch = pitch; player.update(0, allColliders()); hud.update(player, perf.stats, uiState()); return state(); },
  robots: () => life.status(),
  floors: () => ALL_FLOOR_IDS,
  buildTimes: () => Object.fromEntries([...floors.loaded].map(([id, c]) => [id, Math.round(c.buildMs)])),
  seatCounts: () => Object.fromEntries([...floors.loaded].filter(([, c]) => c.seatCount).map(([id, c]) => [id, c.seatCount])),
  setHud: (v) => document.body.classList.toggle('nohud', !v),
  // advance the world N steps of 1/60 s without rendering (player stays put), then render one frame
  _three: { scene, renderer, floors, elev, composer }, // dev-only profiling access
  bigScreenVideo: (url) => playBigScreenVideo(url), // dev: play a video on the lobby's big screen (null = dashboard)
  // dev: render one frame from an arbitrary camera and hold it on screen (for screenshots)
  shot: (pos, look, fov = 70, holdMs = 4000) => {
    const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 1500);
    cam.position.set(...pos); cam.lookAt(...look);
    updateScreens(0.2); renderFrame(cam); shotHold = performance.now() + holdMs; shotCam = cam;
    return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  },
  simTick: (n = 1) => { for (let i = 0; i < n; i++) tick(DT); return state(); },
  advance: (n = 60) => { for (let i = 0; i < n; i++) tick(DT, false); return window.__debug.render(); },
  render: () => {
    updateScreens(0.2); renderFrame();
    Object.assign(perf.stats, { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
    hud.update(player, perf.stats, uiState()); return state();
  },
};

async function bench(secs) {
  const out = [];
  const views = {
    B1: ['vault', Math.PI / 2], L0: ['grand_lobby', 0], 'OT-01': ['trading_floor', Math.PI / 2], 'OT-02': ['lottery_institute', Math.PI / 2],
    'OT-03': ['outreach_centre', Math.PI / 2], 'OT-04': ['security_hq', Math.PI / 2], 'OT-05': ['master_dashboards', Math.PI],
    BRIDGE: ['glass_bridge', -Math.PI / 2], 'VT-01': ['leisure_suite', -Math.PI / 2],
    'VT-02': ['football_arena', -Math.PI / 2], 'VT-03': ['muay_thai_arena', -Math.PI / 2], 'VT-04': ['racing_hall', -Math.PI / 2],
  };
  for (const id of ALL_FLOOR_IDS) {
    const [room, yaw] = views[id];
    setRole('ceo');
    teleport(id, room, yaw);
    if (id === 'VT-02' || id === 'VT-04') player.place(45, FLOOR_BY_ID[id].elevation, 0, -Math.PI / 2);
    await sleep(800);
    perf.reset();
    await sleep(secs * 1000);
    out.push({ floor: id, ...JSON.parse(JSON.stringify(perf.stats)) });
  }
  window.__benchResult = out;
  console.log('BENCH', JSON.stringify(out));
  return out;
}
window.__debug.bench = bench;

// ---------------------------------------------------------------- keys
// ---------------------------------------------------------------- Perf tests panel (dev): F4 or the button
const perfPanel = (() => {
  const btn = document.createElement('button');
  btn.textContent = 'Perf tests (F4)';
  btn.style.cssText = 'position:fixed;left:16px;top:104px;z-index:30;font:600 12px system-ui;padding:5px 10px;border-radius:6px;border:1px solid #b8924a;background:#14110dcc;color:#e3c27a;cursor:pointer';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:16px;top:138px;z-index:30;display:none;width:236px;padding:12px 14px;border-radius:10px;border:1px solid #b8924a;background:#14110de6;color:#eee;font:13px system-ui;line-height:1.5';
  const opt = PERF_OPT;
  const row = (label, html) => `<div style="margin:6px 0"><div style="color:#b8a27a;font-size:11px;text-transform:uppercase;letter-spacing:.06em">${label}</div>${html}</div>`;
  const seg = ['live', 'frozen', 'hidden'].map((m) => `<button data-screen="${m}" style="margin:2px 3px 0 0;padding:3px 8px;border-radius:5px;border:1px solid #6b5a3a;background:#221c14;color:#ddd;cursor:pointer">${m}</button>`).join('');
  const chk = (k, l) => `<label style="display:block;cursor:pointer"><input type="checkbox" data-opt="${k}" checked> ${l}</label>`;
  box.innerHTML = `<div style="font-weight:700;color:#e3c27a">Perf tests (ground floor)</div>
    <div id="pt-fps" style="font:600 15px ui-monospace,monospace;margin:4px 0 2px">— fps</div>
    ${row('Screens', seg)}${row('Effects', chk('glow', 'Glow (bloom)') + chk('shadows', 'Sun shadows') + chk('lights', 'Chandelier / desk lights'))}
    <div style="color:#8a8070;font-size:11px">Press Esc to free the mouse, then click.</div>`;
  document.body.append(btn, box);
  const paint = () => box.querySelectorAll('[data-screen]').forEach((b) => { const on = b.dataset.screen === SCREEN_CTRL.mode; b.style.background = on ? '#b8924a' : '#221c14'; b.style.color = on ? '#111' : '#ddd'; });
  const apply = () => {
    bloom.enabled = opt.glow;
    ext.sun.castShadow = opt.shadows && luxOn; renderer.shadowMap.needsUpdate = true;
    scene.traverse((o) => { if (o.isPointLight) o.visible = opt.lights; });
  };
  box.addEventListener('click', (e) => { const m = e.target.dataset && e.target.dataset.screen; if (m) { setScreenMode(m); paint(); } });
  box.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.opt; if (k) { opt[k] = e.target.checked; apply(); } });
  const toggle = () => { box.style.display = box.style.display === 'none' ? 'block' : 'none'; paint(); };
  btn.addEventListener('click', toggle);
  return { toggle, opt, apply, fps: (st) => { const el = box.querySelector('#pt-fps'); if (el && box.style.display !== 'none') el.textContent = `${st.fps.toFixed(0)} fps · 1% low ${st.fps1Low.toFixed(0)} · ${st.frameMs.toFixed(1)} ms`; } };
})();

addEventListener('keydown', (e) => {
  if (e.code === 'F4') { e.preventDefault(); perfPanel.toggle(); return; }
  if (e.code === 'Escape' && hud.elevatorOpen) { hud.closeElevator(); return; }
  if (e.code === 'KeyE' && !hud.elevatorOpen) {
    const { car, zone } = uiState();
    if (car) { document.exitPointerLock?.(); hud.openElevator(car.bank, car.at || player.floor.id, player.role, { car }); }
    else if (zone) { document.exitPointerLock?.(); hud.openElevator(zone.bank, player.floor.id, player.role); }
  }
  if (e.code === 'F3') { e.preventDefault(); document.getElementById('perf').classList.toggle('hidden'); }
  if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
  const n = Number(e.key);
  if (n >= 1 && n <= ROLES.length && !hud.elevatorOpen) setRole(ROLES[n - 1]);
});

// ---------------------------------------------------------------- start
const params = new URLSearchParams(location.search);
setRole(params.get('role') || 'visitor');
if (params.get('floor')) teleport(params.get('floor'), params.get('room'), params.has('yaw') ? Number(params.get('yaw')) : null);
else teleport('PLAZA'); // the journey starts outside
if (params.get('hud') === '0') document.body.classList.add('nohud');

let last = performance.now();
let shotHold = 0, shotCam = null; // dev screenshots: render from a custom camera for a moment
let hudAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawMs = now - last;
  const dt = Math.min(0.05, rawMs / 1000);
  last = now;
  const t0 = performance.now();
  if (!simWalking) tick(dt);
  updateScreens(dt);
  updateTicker(dt);
  renderFrame(shotHold && performance.now() < shotHold ? shotCam : camera);
  const ui = uiState();
  if (ui.car) {
    const c = ui.car;
    const dir = c.state === 'closed' && c.queue.length ? (FLOOR_BY_ID[c.queue[0]].elevation > c.y ? '▲' : '▼') : '';
    hud.prompt(`Car ${c.label} · ${c.at || `${c.y.toFixed(0)} m`} ${dir} ${c.queue.length ? `→ ${c.queue.join(' → ')}` : ''} · E: choose floor`);
  } else if (ui.zone && !hud.elevatorOpen) {
    const b = BANKS[ui.zone.bank];
    const a = assigned && assigned.car.bank === ui.zone.bank && assigned.from === player.floor.id ? ` · your car: ${assigned.car.label} (${assigned.car.at === assigned.from ? 'doors open' : 'arriving'})` : '';
    hud.prompt(`E — ${b.name} (${b.label})${a}`);
  } else hud.prompt('');
  const stats = perf.tick(now, rawMs, performance.now() - t0);
  hudAcc += dt;
  if (hudAcc > 0.15) { hudAcc = 0; hud.update(player, stats, ui); perfPanel.fps(stats); }
  while (frameWaiters.length) frameWaiters.shift()();
}
requestAnimationFrame(frame);

if (params.get('bench')) bench(Number(params.get('bench')) || 10);
