// Character showcase: a standalone lineup of every character type, walkable in third person
// (hold right-click to orbit, as approved for the game). Not loaded by the game itself.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character, EXPRESSIONS, makeTag, mat, gold, add, cylC, torus, rbox } from './kit.js';
import * as R from './roster.js';
import { CeoMarker } from './ceoMarker.js';

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14121a);
scene.fog = new THREE.Fog(0x14121a, 40, 90);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 200);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2630, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.position.set(14, 24, 18); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 80 });
sun.shadow.camera.position.set(0, 0, 0); sun.target.position.set(0, 0, -15); scene.add(sun, sun.target);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight(0x9fb8ff, 0.7); rim.position.set(-12, 10, -30); scene.add(rim);

// floor: dark marble with gold inlay grid
const floorTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#1d1b21'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.4) * 120; y += (Math.random() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
  g.strokeStyle = '#8a6d2c'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 509, 509);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); t.anisotropy = 8; return t;
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.25, metalness: 0.1 }));
floor.rotation.x = -Math.PI / 2; floor.position.z = -15; floor.receiveShadow = true; scene.add(floor);

const marble = mat(0x101014, { rough: 0.2, metal: 0.2 });
function plinth(x, z, r = 0.85) {
  add(scene, cylC(r, r * 1.04, 0.18, 32), marble, x, 0.09, z);
  add(scene, torus(r * 1.02, 0.025, 6, 40), gold(), x, 0.18, z, Math.PI / 2);
}
function sign(text, sub, x, y, z, ps = 0.0032) {
  const s = makeTag([{ t: text, px: 30 }, ...(sub ? [{ t: sub, px: 19, c: '#b9a46a', w: 600 }] : [])], { bg: 'rgba(10,9,12,.75)', border: '#5a4a22', ps });
  s.position.set(x, y, z); scene.add(s); return s;
}
function rowTitle(text, z) { const s = makeTag([{ t: text, px: 46, c: '#e3c27a', w: 800 }], { ps: 0.011 }); s.position.set(-15.5, 2.2, z); scene.add(s); }

// ---------------------------------------------------------------- lineup
const actors = []; // { label, note, obj, root, x, z, update(dt,t) }
function place(label, note, made, x, z, { yaw = 0, onPlinth = true, plinthR } = {}) {
  const obj = made.char ?? made;
  const root = made.root ?? obj.root;
  if (onPlinth) plinth(x, z, plinthR);
  root.position.set(x, onPlinth ? 0.18 : 0, z); root.rotation.y = yaw; scene.add(root);
  if (label) sign(label, note, x, 0.5, z + (plinthR ?? 0.85) + 0.25);
  const a = { label, note, obj, root, x, z, update: made instanceof Character ? (dt, t) => obj.update(dt, t, 0) : made.update };
  actors.push(a); return a;
}

rowTitle('PRINCIPALS', 0);
const ceo = place('CEO', 'player · 1.25× scale · tracker', R.makeCEO(), -4.5, 0, { plinthR: 1.05 });
place('Admin ("Staff")', 'player · dark suit + gold badge', R.makeAdmin(), 0, 0);
place('Visitor', 'player · one fixed look', R.makeVisitor(), 4.5, 0);

rowTitle('KEY AI AGENTS', -7);
place('Head of Trading', 'OT-01 · hero design', R.makeHeadTrader(), -7.5, -7);
place('Lead Probability Scientist', 'OT-02 · hero design', R.makeLeadQuant(), -2.5, -7);
place('CFO', 'OT-05 · gives the yard speech', R.makeCFO(), 2.5, -7);
place('Head of Asset Protection', 'OT-04 · gold-trim armour', R.makeSecurityChief(), 7.5, -7);

rowTitle('BACKGROUND STAFF', -14);
[['Trader', 'OT-01 · exchange jacket', R.makeTrader], ['Quant', 'OT-02 · shirt + lanyard', R.makeQuant], ['Outreach operator', 'OT-03 · headset', R.makeOperator],
  ['Dealer / host', 'VT-01 · waistcoat', R.makeDealer], ['Offboarded', 'event state · box + tears', R.makeFired], ['Replacement hire', 'event state', R.makeNewHire]]
  .forEach(([l, n, f], i) => place(l, n, f(), -11 + i * 4.4, -14));

rowTitle('ASSET PROTECTION', -21);
place('Guard: front of house', 'lobby · vault · gold trim', R.makeGuard({ frontOfHouse: true }), -6, -21);
place('Guard: corrections', 'yard · escorts · red visor', R.makeGuard(), -1.5, -21);
const alc = new R.Robot(250000);
place('Cash robot (ALC)', 'safe-on-wheels · amount overhead', { root: alc.root, update: (dt, t) => alc.update(dt, t, 0) }, 4, -21, { yaw: -0.5, plinthR: 1.0 });

rowTitle('ARENA TALENT', -28.5);
{ // a small ring for the fighters
  const rx = -5, rz = -28.5, ring = new THREE.Group(); ring.position.set(rx, 0, rz); scene.add(ring);
  add(ring, rbox(5, 0.6, 5, 0.04), mat(0x1f3f8f, { rough: 0.6 }), 0, 0.3, 0);
  add(ring, rbox(4.6, 0.02, 4.6, 0.01), mat(0xe9e4d6, { rough: 0.9 }), 0, 0.61, 0);
  for (const [px, pz, c] of [[-2.3, -2.3, 0xc81e2a], [2.3, 2.3, 0x1f4fd6], [-2.3, 2.3, 0xeeeeee], [2.3, -2.3, 0xeeeeee]]) add(ring, cylC(0.07, 0.07, 1.4, 10), mat(c), px, 1.3, pz);
  for (const h of [0.95, 1.3, 1.65]) for (const [a, b, rot] of [[0, -2.3, 0], [0, 2.3, 0], [-2.3, 0, Math.PI / 2], [2.3, 0, Math.PI / 2]]) add(ring, cylC(0.02, 0.02, 4.6, 6, 'x'), mat(0xd62b2b, { rough: 0.5 }), a, h, b, 0, rot);
  const red = R.makeFighter('red'), blue = R.makeFighter('blue'), ref = R.makeReferee();
  for (const [ch, x, yaw] of [[red, -1.1, Math.PI / 2], [blue, 1.1, -Math.PI / 2], [ref, 0, 0]]) {
    ch.root.position.set(x, 0.62, ch === ref ? -1.2 : 0); ch.root.rotation.y = yaw; ring.add(ch.root);
    actors.push({ obj: ch, root: ch.root, x: rx + x, z: rz, update: (dt, t) => ch.update(dt, t, 0) });
  }
  actors.at(-3).label = 'Muay Thai fighters + referee'; actors.at(-3).note = 'VT-03 · mongkol, prajioud, gloves';
  sign('Muay Thai fighters + referee', 'VT-03 · mongkol, prajioud, gloves', rx, 0.9, rz + 2.8);
}
{ // a parade ring for the horse + jockey
  const cx = 7, cz = -29, r = 3.2, ring = new THREE.Group(); ring.position.set(cx, 0, cz); scene.add(ring);
  add(ring, cylC(r + 1.2, r + 1.2, 0.04, 48), mat(0x2f5a2a, { rough: 0.95 }), 0, 0.02, 0);
  for (const rr of [r - 0.9, r + 0.9]) add(ring, torus(rr, 0.035, 6, 64), mat(0xf2f2f2, { rough: 0.4 }), 0, 0.9, 0, Math.PI / 2);
  const hj = R.makeJockeyOnHorse(); scene.add(hj.root);
  let th = 0;
  const a = { label: 'Jockey + racehorse', note: 'VT-04 · silks, saddle-cloth number', obj: hj.jockey, root: hj.root, x: cx, z: cz,
    update(dt, t) { const sp = 3.2; th += (sp * dt) / r; hj.root.position.set(cx + Math.cos(th) * r, 0.04, cz + Math.sin(th) * r); hj.root.rotation.y = -th; hj.horse.update(dt, t, sp); hj.jockey.update(dt, t, 0); } };
  actors.push(a);
  sign('Jockey + racehorse', 'VT-04 · silks, saddle-cloth number', cx, 0.6, cz + r + 1.6);
}

// random kit row (no plinths)
rowTitle('RANDOM KIT', -36);
let randoms = [];
function rollRandoms() {
  for (const a of randoms) { scene.remove(a.root); actors.splice(actors.indexOf(a), 1); }
  randoms = [];
  for (let i = 0; i < 12; i++) randoms.push(place(null, null, R.makeRandomStaff(), -13.2 + i * 2.4, -36, { onPlinth: false }));
}
rollRandoms();
sign('Random kit: department uniform + random body, skin, hair', 'reroll from the panel', 0, 0.35, -34.6);

// convoy: a cash robot escorted by two corrections guards, looping round everything
const convoy = { robot: new R.Robot(1200000), guards: [R.makeGuard(), R.makeGuard()], th: 0 };
scene.add(convoy.robot.root, ...convoy.guards.map((g) => g.root));
const LOOP = { cx: 0, cz: -18, rx: 18.5, rz: 25 };
const loopAt = (th) => new THREE.Vector3(LOOP.cx + Math.sin(th) * LOOP.rx, 0, LOOP.cz + Math.cos(th) * LOOP.rz);
function updateConvoy(dt, t) {
  const sp = 1.5, d = Math.hypot(Math.cos(convoy.th) * LOOP.rx, Math.sin(convoy.th) * LOOP.rz);
  convoy.th += (sp * dt) / d;
  const set = (root, th) => { const p = loopAt(th), q = loopAt(th + 0.01); root.position.copy(p); root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); };
  set(convoy.robot.root, convoy.th); convoy.robot.update(dt, t, sp);
  convoy.guards.forEach((g, i) => { set(g.root, convoy.th + (i ? -1 : 1) * (2.0 / d)); g.update(dt, t, sp); });
}

// ---------------------------------------------------------------- walls test + CEO tracker
const walls = new THREE.Group(); scene.add(walls); walls.visible = false;
{ const wm = mat(0x3a3640, { rough: 0.8 }); for (const [x, z, w, d] of [[0, -1.5, 3.2, 0.25], [0, 1.5, 3.2, 0.25], [-1.5, 0, 0.25, 3.2], [1.5, 0, 0.25, 3.2]]) { const m = add(walls, new THREE.BoxGeometry(w, 3.4, d), wm, ceo.x + x, 1.7, ceo.z + z); } }
const tracker = new CeoMarker(); // the same green through-walls marker as the game

// ---------------------------------------------------------------- the player (third person)
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const player = { pos: new THREE.Vector3(0, 0, 9), yaw: Math.PI, role: 'visitor', char: null };
const cam = { yaw: 0, pitch: 0.28, dist: 5.5, drag: false };
function setRole(role) {
  if (player.char) scene.remove(player.char.root);
  player.role = role;
  player.char = role === 'ceo' ? R.makeCEO() : role === 'admin' ? R.makeAdmin('You (admin)') : R.makeVisitor('you');
  if (role === 'ceo') player.char.tag.userData.set([{ t: '♛ YOU · CHIEF EXECUTIVE OFFICER', px: 24, c: '#1a1305', w: 800 }]);
  player.char.pose = role === 'ceo' ? 'cigar' : role === 'admin' ? 'admin' : 'drink';
  scene.add(player.char.root);
  document.querySelectorAll('#playAs button').forEach((b) => b.classList.toggle('on', b.dataset.role === role));
}
const el = renderer.domElement;
el.addEventListener('contextmenu', (e) => e.preventDefault());
el.addEventListener('pointerdown', (e) => { if (e.button === 2) { cam.drag = true; el.setPointerCapture(e.pointerId); } });
el.addEventListener('pointerup', (e) => { if (e.button === 2) { cam.drag = false; el.releasePointerCapture(e.pointerId); } });
el.addEventListener('pointermove', (e) => { if (!cam.drag) return; cam.yaw -= e.movementX * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.004, -0.35, 1.35); });
el.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 1.8, 16); }, { passive: true });

function updatePlayer(dt, t) {
  const f = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)), r = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const mv = new THREE.Vector3();
  if (keys.KeyW) mv.add(f); if (keys.KeyS) mv.sub(f); if (keys.KeyD) mv.add(r); if (keys.KeyA) mv.sub(r);
  let speed = 0;
  if (mv.lengthSq() > 0) {
    mv.normalize(); speed = keys.ShiftLeft || keys.ShiftRight ? 5 : 2.2;
    player.pos.addScaledVector(mv, speed * dt);
    const want = Math.atan2(mv.x, mv.z);
    let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += d * Math.min(1, dt * 12);
  }
  const c = player.char; c.root.position.copy(player.pos); c.root.rotation.y = player.yaw; c.update(dt, t, speed);
  const s = c.root.scale.x, target = player.pos.clone().add(new THREE.Vector3(0, 1.55 * s, 0));
  camera.position.set(target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist * s, target.y + Math.sin(cam.pitch) * cam.dist * s, target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist * s);
  camera.position.y = Math.max(0.3, camera.position.y);
  camera.lookAt(target);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
for (const [role, label] of [['visitor', 'Visitor'], ['admin', 'Admin'], ['ceo', 'CEO']]) { const b = document.createElement('button'); b.textContent = label; b.dataset.role = role; b.onclick = () => setRole(role); $('playAs').append(b); }
for (const e of ['auto', ...EXPRESSIONS]) { const b = document.createElement('button'); b.textContent = e; b.onclick = () => { Character.faceOverride = e === 'auto' ? null : e; document.querySelectorAll('#faces button').forEach((x) => x.classList.toggle('on', x === b)); }; if (e === 'auto') b.classList.add('on'); $('faces').append(b); }
$('wall').onclick = () => { walls.visible = !walls.visible; $('wall').classList.toggle('on', walls.visible); };
$('reroll').onclick = rollRandoms;
let paused = false;
$('pause').onclick = () => { paused = !paused; $('pause').classList.toggle('on', paused); };
for (const a of actors.filter((a) => a.label)) {
  const b = document.createElement('button'); b.innerHTML = `${a.label}<br><small>${a.note ?? ''}</small>`;
  b.onclick = () => { player.pos.set(a.x, 0, a.z + 3.6); player.yaw = Math.PI; cam.yaw = 0; cam.pitch = 0.2; cam.dist = 4.5; };
  $('list').append(b);
}
setRole('visitor');

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let t = 0, fpsT = 0, frames = 0, trackT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!paused) t += dt;
  const adt = paused ? 0 : dt;
  for (const a of actors) a.update(adt, t);
  updateConvoy(adt, t);
  updatePlayer(dt, t);
  // CEO tracker: over the (other) CEO's head, visible through walls
  tracker.visible = player.role !== 'ceo';
  if (player.role !== 'ceo') tracker.update(camera, new THREE.Vector3(ceo.x, ceo.root.position.y + ceo.obj.tagY * 1.25 + 0.1, ceo.z), player.pos);
  renderer.render(scene, camera);
  frames++; if ((fpsT += dt) > 0.5) { $('hud').textContent = `${Math.round(frames / fpsT)} fps · ${renderer.info.render.calls} draw calls · showcase build (not instanced)`; frames = 0; fpsT = 0; }
});
// debug hook (verification screenshots): step the world and render one frame on demand
window.__showcase = { scene, actors, player, cam, camera, step(n = 1) { for (let i = 0; i < n; i++) { t += 1 / 60; for (const a of actors) a.update(1 / 60, t); updateConvoy(1 / 60, t); updatePlayer(1 / 60, t); } renderer.render(scene, camera); } };
