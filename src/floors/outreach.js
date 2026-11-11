import * as THREE from 'three';
import { CH } from '../world/screens.js';
import { instancedBoxes, chunked } from '../world/geom.js';
import { Lux } from '../world/lux.js';
import { kitMaterials } from './luxKit.js';
import { luxLiftHall } from './luxHall.js';
import { buildOps, opsMaterials } from './outreachOps.js';
import { lifeStatic, life } from './outreachLife.js';

// ---------------------------------------------------------------- OT-03 Global Client Outreach Centre
// (Plain name, code comments only: the scam call centre.)
// Greybox from the user's reference images (2026-11-06); desks and sets redesigned 2026-11-09 so the
// floor reads as the actual operation. The floor slab (52 m) is only the lift hall: the whole main
// space (X -109..-50, Z -39..39) is a pit sunk 15 m. From the portal a bridge (Z -6..6) runs onto
// the TOP tier of a four-level operator structure standing in the pit: tiers at 0 / -5 / -10 and the
// pit floor at -15, linked by zig-zag stairs down its east face. All y are relative to 52 m.
//
// Each level is one "desk" of the operation:
//   tier   0  Relationship Development   chat operators, racks of 8 handsets each (romance / investment)
//   tier  -5  Client Outreach (Call Centre 7)   cold-call desks, headsets, scripts + the video-call
//             studio sets (fake regulator office, fake partner bank, "lifestyle" studio)
//   tier -10  Remote Device Assistance   fake security-alert screens + the Objection Handling Lab
//   pit       Liquidity Operations   SIM / handset farm wall, settlement desk, the gong, rest pods

// ---- floor-local screen atlas (4 channels, one draw call each), redrawn at 2 Hz while visible
export const OCH = { CHAT: 0, LEAD: 1, ALERT: 2, WALLET: 3 };
const SCW = 512, SCH = 256;
const sc = document.createElement('canvas');
sc.width = SCW * 2; sc.height = SCH * 2;
const sg = sc.getContext('2d');
const stex = new THREE.CanvasTexture(sc);
stex.colorSpace = THREE.SRGBColorSpace;
const smat = new THREE.MeshBasicMaterial({ map: stex, toneMapped: false });
const phoneMat = new THREE.MeshBasicMaterial({ toneMapped: false }); // lit handset screens (instance colours)
const gongMat = new THREE.MeshLambertMaterial({ color: 0xd4a637, emissive: 0x3a2808 });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false });

const CHAT = [
  ['l', 'Good morning dear, did you sleep well?'], ['r', 'Yes! Thinking of you'],
  ['l', "My uncle's platform did +38% again today"], ['l', 'I only share this with people I trust'],
  ['r', 'Is it safe?'], ['l', 'Of course. Minimum to start is only 500'],
  ['l', 'You deserve financial freedom too'], ['r', 'OK I will try a small amount'],
  ['l', 'Send me the screenshot when it is done'], ['l', "I'm so proud of you. Our future!"],
];
const NAMES = ['Michael', 'Jessica', 'Daniel', 'Sophie', 'Ryan', 'Mei'];
function cellXY(ch) { return [(ch % 2) * SCW, Math.floor(ch / 2) * SCH]; }
function drawOutreach(t) {
  const k = Math.floor(t * 2);
  // CHAT
  let [x, y] = cellXY(OCH.CHAT);
  sg.fillStyle = '#0d1611'; sg.fillRect(x, y, SCW, SCH);
  sg.fillStyle = '#1f8a5a'; sg.fillRect(x, y, SCW, 38);
  sg.fillStyle = '#fff'; sg.font = 'bold 22px sans-serif';
  sg.fillText(`${NAMES[Math.floor(k / 9) % NAMES.length]}  ♡  online`, x + 14, y + 26);
  for (let i = 0; i < 4; i++) {
    const [side, txt] = CHAT[(Math.floor(k / 3) + i) % CHAT.length];
    const by = y + 50 + i * 46;
    sg.font = '18px sans-serif';
    const w = Math.min(SCW - 60, sg.measureText(txt).width + 24);
    const bx = side === 'l' ? x + 12 : x + SCW - 12 - w;
    sg.fillStyle = side === 'l' ? '#2b3a33' : '#2fa36a'; sg.fillRect(bx, by, w, 34);
    sg.fillStyle = '#f2fff6'; sg.fillText(txt, bx + 12, by + 23);
  }
  sg.fillStyle = '#7fd7a8'; sg.font = 'italic 16px sans-serif'; sg.fillText('typing' + '.'.repeat(k % 4), x + 14, y + SCH - 10);
  // LEAD (CRM client card + call timer)
  [x, y] = cellXY(OCH.LEAD);
  sg.fillStyle = '#0a1330'; sg.fillRect(x, y, SCW, SCH);
  sg.fillStyle = '#3e6aa8'; sg.fillRect(x, y, SCW, 34);
  sg.fillStyle = '#fff'; sg.font = 'bold 20px monospace'; sg.fillText(`CLIENT PROFILE #${48213 + (Math.floor(k / 7) % 97)}`, x + 12, y + 24);
  sg.font = '18px monospace'; sg.fillStyle = '#c8d6ff';
  ['Age: 67  ·  Retired', 'Savings band: HIGH', 'Trust score: 82%', 'Status: WARM → HOT'].forEach((s, i) => sg.fillText(s, x + 14, y + 66 + i * 30));
  const sec = (k * 0.5) % 600;
  sg.fillStyle = '#2fe07a'; sg.font = 'bold 34px monospace';
  sg.fillText(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`, x + 350, y + 100);
  sg.font = 'bold 16px monospace'; sg.fillText('● ON CALL', x + 360, y + 128);
  sg.fillStyle = '#ffd34d'; sg.fillRect(x, y + SCH - 34, SCW, 34);
  sg.fillStyle = '#111'; sg.font = 'bold 17px monospace'; sg.fillText(`SCRIPT p.${1 + (Math.floor(k / 11) % 9)} — Build urgency. Never hang up first.`, x + 10, y + SCH - 11);
  // ALERT (the fake device-security pop-up)
  [x, y] = cellXY(OCH.ALERT);
  sg.fillStyle = k % 2 ? '#b00020' : '#0038b8'; sg.fillRect(x, y, SCW, SCH);
  sg.fillStyle = '#fff'; sg.fillRect(x + 20, y + 20, SCW - 40, SCH - 40);
  sg.fillStyle = '#b00020'; sg.font = 'bold 30px sans-serif'; sg.fillText('⚠ SECURITY WARNING', x + 40, y + 62);
  sg.fillStyle = '#111'; sg.font = '19px sans-serif';
  ['Your device has been locked for your protection.', 'Do NOT restart or close this window.', 'Call Remote Device Assistance now:'].forEach((s, i) => sg.fillText(s, x + 40, y + 98 + i * 28));
  sg.font = 'bold 26px monospace'; sg.fillStyle = '#0038b8'; sg.fillText('+00 000 0000 000', x + 40, y + 206);
  sg.font = '14px monospace'; sg.fillStyle = '#666'; sg.fillText(`Error 0x80${(k * 37) % 255 + 16}AF`, x + 360, y + 206);
  // WALLET (inbound settlement)
  [x, y] = cellXY(OCH.WALLET);
  sg.fillStyle = '#0f0f18'; sg.fillRect(x, y, SCW, SCH);
  sg.fillStyle = '#9aa0b8'; sg.font = 'bold 18px monospace'; sg.fillText('INBOUND LIQUIDITY · DIGITAL ASSETS', x + 14, y + 30);
  sg.fillStyle = '#2fe0a0'; sg.font = 'bold 44px monospace'; sg.fillText(`+${(12400 + ((k * 731) % 88000)).toLocaleString('en-US')}.00`, x + 14, y + 100);
  sg.font = 'bold 18px monospace'; sg.fillText('✓ CONFIRMED  ·  6/6 blocks', x + 14, y + 136);
  sg.fillStyle = '#fff'; sg.fillRect(x + 380, y + 120, 112, 112);
  sg.fillStyle = '#000';
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (((i * 7 + j * 13 + (k >> 3)) * 2654435761 >>> 28) & 1) sg.fillRect(x + 386 + i * 10, y + 126 + j * 10, 10, 10);
  sg.fillStyle = '#ff7ad0'; sg.font = '16px monospace'; sg.fillText('Next: route via 4 intermediary wallets', x + 14, y + 220);
  stex.needsUpdate = true;
}
drawOutreach(0);

function localScreens() {
  const items = [[], [], [], []];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    add(ch, x, y, z, yaw, w, h) { items[ch].push({ x, y, z, yaw, w, h }); },
    build(ctx) {
      items.forEach((list, ch) => {
        if (!list.length) return;
        const geo = new THREE.PlaneGeometry(1, 1);
        const uv = geo.attributes.uv;
        const [cx, cy] = [ch % 2, Math.floor(ch / 2)];
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 2, (1 - (cy + 1) / 2) + uv.getY(i) / 2);
        const mesh = new THREE.InstancedMesh(geo, smat, list.length);
        list.forEach((it, i) => { q.setFromAxisAngle(up, it.yaw); mesh.setMatrixAt(i, m.compose(p.set(it.x, ctx.e + it.y, it.z), q, s.set(it.w, it.h, 1))); });
        mesh.computeBoundingSphere();
        ctx.add(mesh, geo);
      });
    },
  };
}

// ---- OT-03 redesign (2026-11-09, user-approved spec): the descending oval bowl. Step 1 = the
// architecture (outreachBowl.js); desks, people and animation (step 2) and the map, studios,
// support areas and the airlock lobby (step 3) follow.
export function outreach(ctx0) {
  kitMaterials(); opsMaterials();
  const L = new Lux(ctx0);
  hallOT03(ctx0, L);
  const { seats } = buildOps(ctx0, L);
  lifeStatic(ctx0, L); // queues, reception staff, guards, waiting partners
  L.build();
  deskScreens(ctx0, seats);
  life(ctx0, seats); // the live map, ribbon screens, calls, celebrations, the offboarding escort
}

// ---- the desks' twin monitors (floor-local animated atlas, 4 draw calls) and the handsets
const PH = [0xd8ffe8, 0xbfe0ff, 0xffffff, 0x9ff0c8, 0xffd0e8, 0x2fa36a];
const SCREENS_BY_SECTOR = { police: [OCH.LEAD, OCH.WALLET], romance: [OCH.CHAT, OCH.CHAT], tech: [OCH.ALERT, OCH.LEAD], sup: [OCH.WALLET, OCH.LEAD] };
function deskScreens(ctx, seats) {
  const scr = localScreens(), phones = [];
  seats.forEach((s, i) => {
    const [a, b] = SCREENS_BY_SECTOR[s.sector];
    const d = s.dir, yaw = d > 0 ? -Math.PI / 2 : Math.PI / 2; // monitors face the operator
    scr.add(a, s.x + d * 0.947, s.y + 1.03, s.z - 0.265, yaw, 0.47, 0.31);
    scr.add(b, s.x + d * 0.947, s.y + 1.03, s.z + 0.265, yaw, 0.47, 0.31);
    if (s.sector === 'romance') { // a rack of handsets, one per persona, standing up facing the operator
      for (let k = 0; k < 4; k++) phones.push({ x: s.x + d * 0.82, y: ctx.e + s.y + 0.83, z: s.z - d * (0.23 + k * 0.085), sx: 0.012, sy: 0.15, sz: 0.072, color: PH[(i + k) % PH.length] });
    } else {
      for (let k = 0; k < (s.sector === 'police' ? 2 : 1); k++) phones.push({ x: s.x + d * 0.6, y: ctx.e + s.y + 0.756, z: s.z - d * (0.28 + k * 0.1), sx: 0.15, sy: 0.012, sz: 0.072, color: PH[(i + k) % PH.length] });
    }
  });
  scr.build(ctx);
  for (const m of chunked(phones, 24, (list) => instancedBoxes(list, phoneMat))) ctx.add(m, m.geometry);
  let t = 0, acc = 0;
  ctx.onUpdate((dt) => { if (!ctx.group.visible) return; t += dt; acc += dt; if (acc >= 0.5) { acc = 0; drawOutreach(t); } });
}

// ---------------------------------------------------------------- Phase 1 lift hall (shared design)
// Dark slate core with gunmetal portals, neon cyan caps and glowing coffer panels, resin floor;
// the 12 x 6 m portal opens onto the Arrival Bridge.
const OUTP = { wall: 'panelGrey', wallDeep: 'panelMid', panel: 'coveWarm', frame: 'gunDarkO', frameDark: 'gunDarkO', dado: 'panelMid', cap: 'ledBlue',
  floor: 'woodDeck', floorTile: 4, runner: 'floorPanel', edge: 'ledBlue', liner: 'steel', ink: '#e8eef4', kioskBg: '#0b1626', kioskBtn: '#163a66', kioskEdge: '#3fa9ff', hostSuit: 0x1f2a44 };
function hallOT03(ctx, L) {
  luxLiftHall(ctx, L, {
    s: -1, H: ctx.floor.height, P: OUTP, ceo: 'ceo',
    banks: [['ot_high', 'OFFICE HIGH-RISE · L · 3–5', false], ['freight_ot', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [], host: false, // the arrivals hall (outreachOps.js) puts immigration booths where the kiosks would stand
    portal: { half: 6, top: 6 },
    portalText: 'GLOBAL CLIENT OUTREACH CENTRE', portalSub: 'Relationship Development · Client Outreach · Remote Device Assistance',
  });
  // neon jambs either side of the portal and a neon band across the lintel
  for (const z of [-7.1, 7.1]) L.box(-49.75, -49.55, 0.3, 6.4, z - 0.06, z + 0.06, 'ledBlue');
  L.box(-49.75, -49.55, 6.45, 6.52, -7.2, 7.2, 'ledBlue');
}
