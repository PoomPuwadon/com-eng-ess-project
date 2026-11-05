import { CH } from '../world/screens.js';

// Lift halls (rev 10). Each tower floor opens with ONE big hall: the full-depth strip between the
// lift shafts and the floor's portal wall (20 m deep, 80 m long in the Office Tower, 120 m in the
// Wellness Tower). Passenger, freight and private-lift landings all open into it. The portal wall
// runs floor-to-ceiling like the rest of the floor and carries one big themed portal.
//
// Coordinates: d = distance from the tower's atrium facade (x = ±30) into the tower.
//   d 0..4 shafts · 4..12 landings · 12.6 call kiosks · 13..15.5 runner · 16.5 props · 20 portal wall

const GOLD = 0xc9a23a;
const THEMES = {
  trading: { floor: 0x1f3b2c, accent: GOLD, runner: 0x14281e, pil: 0x1f3b2c, light: 0xfff0c8 },
  quant: { floor: 0xe8eef5, accent: 0x1b2a6b, runner: 0xc9d4e3, pil: 0xffffff, light: 0xffffff },
  sky: { floor: 0xcfd8e3, accent: 0x8fb8de, runner: 0xaebfd3, pil: 0x9aa7b8, light: 0xf0f8ff },
  thai: { floor: 0x7a4a24, accent: 0xd8a02a, runner: 0x8a1b1b, pil: 0xc0262d, light: 0xffe2a8 },
  security: { floor: 0x3a3f47, accent: 0xffd400, runner: 0x2a2e35, pil: 0x2a2e35, light: 0xdde6ff },
  executive: { floor: 0xf2efe8, accent: GOLD, runner: 0x2b1d4a, pil: 0xf7f3ea, light: 0xfff6e0 },
  portal: { floor: 0xe9dcc0, accent: GOLD, runner: 0xb3171f, pil: 0xc9a23a, light: 0xffe9a8 },
  concourse: { floor: 0x1b2438, accent: 0x2f7bff, runner: 0x10172a, pil: 0x1b2438, light: 0xffc65a },
  shrine: { floor: 0x6b4a2a, accent: 0xc0262d, runner: 0x3b2414, pil: 0xc0262d, light: 0xffe2a8 },
  paddock: { floor: 0x2f5d34, accent: 0xffffff, runner: 0x8a6a3a, pil: 0xffffff, light: 0xf2ffe8 },
};

export function hall(ctx, rm) {
  const t = THEMES[rm.hall];
  const fl = ctx.floor;
  const ot = fl.tower === 'OT';
  const s = ot ? -1 : 1; // direction into the tower
  const edge = ot ? -30 : 30;
  const D = (d) => edge + s * d;
  const X = (da, db) => [Math.min(D(da), D(db)), Math.max(D(da), D(db))];
  const H = fl.height;
  const z0 = rm.z0 + 1, z1 = rm.z1 - 1;
  const yawHall = s > 0 ? -Math.PI / 2 : Math.PI / 2; // facing back into the hall from the portal wall
  const p = rm.portal;
  const w = p ? p.width : 0, top = p ? p.top : 0;
  // halls are normally 20 m deep; a narrower hall (e.g. VT-03) shifts everything that is placed
  // relative to its portal wall
  const o = (rm.x1 - rm.x0) - 20;
  const W = (d) => D(d + o), XW = (da, db) => X(da + o, db + o);

  // ---- floor, runner along the hall, apron through the portal
  ctx.deco(...X(1, 20 + o), 0.015, 0.03, z0, z1, t.floor);
  if (!rm.narrow) {
    ctx.deco(...XW(13, 15.5), 0.03, 0.045, z0 + 1, z1 - 1, t.runner);
    for (const dd of [13, 15.3]) ctx.deco(...XW(dd, dd + 0.2), 0.045, 0.05, z0 + 1, z1 - 1, t.accent);
  }
  if (p) {
    ctx.deco(...XW(15.5, 20.4), 0.03, 0.045, -w / 2, w / 2, t.runner);
    for (const zz of [-w / 2, w / 2 - 0.2]) ctx.deco(...XW(15.5, 20.4), 0.045, 0.05, zz, zz + 0.2, t.accent);
  }

  // ---- lighting: ceiling coffers on low floors, chandeliers on tall ones
  if (H <= 8) {
    for (let z = z0 + 4; z < z1 - 3; z += 10) ctx.deco(...X(6, 17 + o), H - 0.4, H - 0.28, z, z + 3, t.light);
  } else {
    const cy = Math.min(H - 3, Math.max(6, H * 0.6));
    for (let z = z0 + 8; z < z1 - 6; z += 18) {
      ctx.deco(...XW(13.4, 15.6), cy, cy + 1.6, z - 1.1, z + 1.1, t.light);
      ctx.deco(...XW(13.9, 15.1), cy - 1, cy, z - 0.6, z + 0.6, t.light);
      ctx.deco(...XW(14.45, 14.55), cy + 1.6, H - 0.25, z - 0.05, z + 0.05, GOLD);
    }
  }

  // ---- wainscot + cornice on the portal wall (hall side), interrupted by the portal
  if (p) {
    for (const [za, zb] of [[z0, -w / 2 - 1.4], [w / 2 + 1.4, z1]]) {
      ctx.deco(...XW(19.55, 19.7), 0.9, 1.05, za, zb, t.accent);
      ctx.deco(...XW(19.55, 19.7), H - 0.75, H - 0.6, za, zb, t.accent);
    }
  }

  // ---- destination-dispatch kiosks in front of each passenger landing
  for (const lz of fl.elevators) {
    if (!lz.bank.endsWith('low') && !lz.bank.endsWith('high')) continue;
    const zc = (lz.z0 + lz.z1) / 2;
    const [kx0, kx1] = X(12.3, 12.9);
    ctx.box(kx0, kx1, 0, 1.15, zc - 0.3, zc + 0.3, 0x222831);
    ctx.screen(D(12.3) + (s > 0 ? -0.01 : 0.01), 1.0, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0.5, 0.35, CH.ODDS);
  }

  // ---- the portal: pilasters straddling the wall, lintel, header sign, themed dressing
  if (p) {
    const ph = Math.min(top + 1.2, H - 0.3);
    for (const [za, zb] of [[-w / 2 - 1.4, -w / 2], [w / 2, w / 2 + 1.4]]) {
      ctx.box(...XW(18.9, 21.4), 0, ph, za, zb, t.pil);
      ctx.deco(...XW(18.85, 21.45), ph - 0.35, ph, za - 0.05, zb + 0.05, t.accent);
      ctx.deco(...XW(18.85, 21.45), 0, 0.35, za - 0.05, zb + 0.05, t.accent);
    }
    ctx.deco(...XW(18.9, 21.4), top, ph, -w / 2, w / 2, t.pil);
    ctx.deco(...XW(18.85, 18.9), top + 0.05, top + 0.15, -w / 2, w / 2, t.accent);
    const signY = top + 1.9 <= H - 0.5 ? top + 1.9 : top - 0.55;
    ctx.sign(rm.sign, W(18.6), signY, 0, { size: Math.min(1.6, Math.max(0.7, w / 14)) });
    const S = PORTALS[rm.hall];
    if (S) S(ctx, { D: W, X: XW, s, w, top, ph, H, t, yawHall });
  } else {
    ctx.sign(rm.sign, W(16), Math.min(H - 1, 6), z0 + 10, { size: 1.0 });
  }

  // ---- The Link: glass checkpoint vestibule around the bridge mouth (z -3..3 in the facade)
  if (rm.link) {
    const [ax, bx] = X(1, 8);
    for (const zz of [-6, 6]) ctx.glassBox(ax, bx, 0, 3, zz - 0.15, zz + 0.15, 0xbfe6ff, true);
    const [gx0, gx1] = X(7.85, 8.15);
    ctx.glassBox(gx0, gx1, 0, 3, 3, 5.85, 0xbfe6ff, true);
    ctx.glassBox(gx0, gx1, 0, 3, -5.85, -3, 0xbfe6ff, true);
    ctx.barrier(gx0, gx1, -3, 3, 2.5, 'bridge', ot ? 'ot_bridge_checkpoint' : 'vt_bridge_checkpoint');
    for (const zz of [-3, 3]) ctx.box(gx0 - 0.15, gx1 + 0.15, 0, 3.2, zz - 0.25, zz + 0.25, GOLD);
    ctx.deco(gx0 - 0.1, gx1 + 0.1, 3.0, 3.2, -6.15, 6.15, GOLD);
    ctx.npc(D(9.6), -4.5, 0x050505, yawHall + Math.PI); ctx.npc(D(9.6), 4.5, 0x050505, yawHall + Math.PI);
    ctx.sign(`THE LINK → ${ot ? 'Wellness Tower' : 'Office Tower'}`, D(8.7), 3.9, 0, { size: 0.6, sub: 'Link Access Credential required' });
  }

  // ---- signature objects: near both ends of the hall and either side of the portal
  const clear = (z) => !fl.elevators.some((lz) => z > lz.z0 - 3 && z < lz.z1 + 3 && Math.max(Math.abs(lz.x0 - edge), Math.abs(lz.x1 - edge)) > 13);
  const spots = rm.narrow ? [] : (p ? [z0 + 6, z1 - 6, -(w / 2 + 5.5), w / 2 + 5.5] : [z0 + 6, z1 - 6]).filter(clear).map((z) => ({ x: W(16.5), z }));
  const fn = PROPS[rm.hall];
  for (let i = 0; i + 1 < spots.length; i += 2) fn && fn(ctx, [spots[i], spots[i + 1]], { s, H, t });
  if (spots.length % 2) fn && fn(ctx, [spots[spots.length - 1], spots[spots.length - 1]], { s, H, t });
}

// ---------------------------------------------------------------- portal dressing per theme
const PORTALS = {
  trading(ctx, { D, w, top, yawHall }) {
    ctx.screen(D(18.8), top + 0.6, 0, yawHall, w, 0.8, CH.TICKER); // live ticker across the lintel
    for (const z of [-w / 2 - 0.7, w / 2 + 0.7]) ctx.screen(D(18.8), top * 0.55, z, yawHall, 1.2, 2.4, CH.CHART);
  },
  quant(ctx, { D, X, w, top, yawHall }) {
    ctx.screen(D(18.8), top + 0.6, 0, yawHall, w * 0.8, 1.0, CH.LOTTO);
    for (const sg of [-1, 1]) {
      const zc = sg * (w / 2 + 5);
      ctx.deco(...X(19.4, 19.55), 1.0, 4.2, zc - 3, zc + 3, 0xffffff); // whiteboards
      ctx.deco(...X(19.35, 19.4), 1.0, 4.2, zc - 3.05, zc - 2.95, 0x1b2a6b);
    }
  },
  thai(ctx, { X, w, top }) {
    // tiered gold gables over each pilaster + a gold naga line along the lintel
    for (const zc of [-w / 2 - 0.7, w / 2 + 0.7]) {
      for (let i = 0; i < 3; i++) ctx.deco(...X(18.7, 18.85), top - 1.6 + i * 0.45, top - 1.25 + i * 0.45, zc - 0.6 + i * 0.2, zc + 0.6 - i * 0.2, 0xd8a02a);
    }
    ctx.deco(...X(18.7, 18.85), top - 0.25, top - 0.05, -w / 2, w / 2, 0xd8a02a);
  },
  security(ctx, { X, w, top }) {
    // hazard-striped jambs, threshold stripe, and the two blast-door leaves parked open
    for (const zc of [-w / 2 - 0.7, w / 2 + 0.7]) for (let y = 0.35; y < top; y += 0.7) ctx.deco(...X(18.85, 18.9), y, y + 0.35, zc - 0.7, zc + 0.7, 0xffd400);
    for (let z = -w / 2; z < w / 2; z += 1) ctx.deco(...X(19.6, 20.6), 0.05, 0.06, z, z + 0.5, 0xffd400);
    for (const sg of [-1, 1]) ctx.box(...X(18.3, 19.0), 0, top, sg > 0 ? w / 2 + 1.5 : -w / 2 - 7.5, sg > 0 ? w / 2 + 7.5 : -w / 2 - 1.5, 0x5a5f68);
  },
  executive(ctx, { X, w, ph }) {
    for (const zc of [-w / 2 - 0.7, w / 2 + 0.7]) for (const o of [-0.45, 0, 0.45]) ctx.deco(...X(18.82, 18.88), 0.4, ph - 0.4, zc + o - 0.04, zc + o + 0.04, GOLD); // fluting
  },
  portal(ctx, { X, w, top, ph }) {
    // marquee bulbs around the arch
    for (const zc of [-w / 2 - 0.7, w / 2 + 0.7]) for (let y = 0.8; y < ph - 0.4; y += 0.8) ctx.deco(...X(18.75, 18.88), y, y + 0.22, zc - 0.11, zc + 0.11, 0xfff3a0);
    for (let z = -w / 2 - 0.6; z <= w / 2 + 0.6; z += 0.8) ctx.deco(...X(18.75, 18.88), top + 0.5, top + 0.72, z - 0.11, z + 0.11, 0xfff3a0);
  },
  sky() {},
  shrine(ctx, { X, w, top }) {
    // red corner / blue corner jambs, three ring ropes across the lintel
    ctx.deco(...X(18.8, 18.9), 0.4, top, -w / 2 - 1.4, -w / 2, 0xc0262d);
    ctx.deco(...X(18.8, 18.9), 0.4, top, w / 2, w / 2 + 1.4, 0x2244cc);
    for (const y of [top + 0.2, top + 0.5, top + 0.8]) ctx.deco(...X(18.7, 18.8), y, y + 0.08, -w / 2, w / 2, 0xffffff);
  },
  paddock(ctx, { D, X, w, top, yawHall }) {
    ctx.screen(D(18.8), top + 0.7, -w / 4, yawHall, w / 2 - 1, 1.2, CH.RACE);
    ctx.screen(D(18.8), top + 0.7, w / 4, yawHall, w / 2 - 1, 1.2, CH.ODDS);
    for (const sg of [-1, 1]) for (const y of [0.5, 1.0]) ctx.deco(...X(18.4, 18.5), y, y + 0.1, sg > 0 ? w / 2 + 1.5 : -w / 2 - 14, sg > 0 ? w / 2 + 14 : -w / 2 - 1.5, 0xffffff); // white rail
  },
  concourse() {},
};

// ---------------------------------------------------------------- signature objects per theme
const face = (s) => (s > 0 ? -Math.PI / 2 : Math.PI / 2);
const PROPS = {
  trading(ctx, sp, { s }) {
    const { x, z } = sp[0];
    ctx.box(x - 0.6, x + 0.6, 0, 0.6, z - 1.6, z + 1.6, 0x3b2a1a); // bronze charging bull on a plinth
    ctx.deco(x - 0.5, x + 0.5, 0.6, 1.5, z - 1.2, z + 0.9, 0x8c5a2b);
    ctx.deco(x - 0.35, x + 0.35, 1.0, 1.6, z - 1.8, z - 1.2, 0x8c5a2b);
    ctx.deco(x - 0.7, x + 0.7, 1.55, 1.65, z - 1.7, z - 1.55, 0xd8b06a);
    ctx.screen(sp[1].x + s * 2.9, 2.6, sp[1].z, face(s), 4, 1.4, CH.TICKER);
    ctx.npc(sp[1].x - s * 1.5, sp[1].z, 0x1f2a44);
  },
  quant(ctx, sp, { s }) {
    for (const { x, z } of sp) {
      ctx.box(x - 0.5, x + 0.5, 0, 0.75, z - 1.2, z + 1.2, 0x444b55);
      ctx.screen(x + s * 0.2, 1.15, z, face(s), 1.8, 0.6, CH.LOTTO);
      ctx.npc(x - s * 1.0, z, 0x2b3a55);
    }
  },
  sky(ctx, sp) {
    for (const { x, z } of sp) { ctx.box(x - 0.6, x + 0.6, 0, 0.9, z - 0.6, z + 0.6, 0x4f7a3a); ctx.deco(x - 0.5, x + 0.5, 0.9, 2.0, z - 0.5, z + 0.5, 0x5f9a4a); }
  },
  thai(ctx, sp) {
    const { x, z } = sp[0]; // spirit house on a post
    ctx.box(x - 0.15, x + 0.15, 0, 1.4, z - 0.15, z + 0.15, 0xd8c8a8);
    ctx.deco(x - 0.6, x + 0.6, 1.4, 2.1, z - 0.6, z + 0.6, 0xe8d8b0);
    ctx.deco(x - 0.75, x + 0.75, 2.1, 2.3, z - 0.75, z + 0.75, 0xc0262d);
    ctx.deco(x - 0.4, x + 0.4, 2.3, 2.6, z - 0.4, z + 0.4, 0xd8a02a);
    const o = sp[1]; // orchid planter
    ctx.box(o.x - 0.5, o.x + 0.5, 0, 0.6, o.z - 1.5, o.z + 1.5, 0x5a3a20);
    for (let i = 0; i < 4; i++) ctx.deco(o.x - 0.2, o.x + 0.2, 0.6, 1.2, o.z - 1.2 + i * 0.8, o.z - 0.9 + i * 0.8, 0xd86ab0);
  },
  security(ctx, sp, { s }) {
    const { x, z } = sp[0];
    for (const o of [-1.25, 1.25]) ctx.box(x - 0.5, x + 0.5, 0, 2.6, z + o - 0.15, z + o + 0.15, 0x707a88); // body scanner
    ctx.deco(x - 0.5, x + 0.5, 2.4, 2.6, z - 1.4, z + 1.4, 0xffd400);
    for (let i = 0; i < 4; i++) ctx.screen(sp[1].x + s * 2.9, 1.4 + (i % 2) * 1.1, sp[1].z - 1 + Math.floor(i / 2) * 2, face(s), 1.8, 1, i % 8);
    ctx.npc(x - s * 1.2, z, 0x050505);
  },
  executive(ctx, sp, { s }) {
    const { x, z } = sp[0];
    ctx.box(x - 0.6, x + 0.6, 0, 1.1, z - 2, z + 2, 0xf3efe6); // reception desk
    ctx.deco(x - 0.6, x + 0.6, 1.1, 1.18, z - 2, z + 2, GOLD);
    ctx.npc(x + s * 1.1, z, 0x111111);
    ctx.deco(sp[1].x + s * 2.95, sp[1].x + s * 3.05, 1.2, 3.6, sp[1].z - 1.5, sp[1].z + 1.5, 0xa33b3b); // artwork
  },
  portal(ctx, sp) {
    const { x, z } = sp[0]; // fountain
    ctx.box(x - 1.4, x + 1.4, 0, 0.5, z - 1.4, z + 1.4, 0xd9d2c3);
    ctx.deco(x - 1.2, x + 1.2, 0.5, 0.52, z - 1.2, z + 1.2, 0x3d8fd6);
    ctx.deco(x - 0.15, x + 0.15, 0.5, 2.6, z - 0.15, z + 0.15, GOLD);
    const o = sp[1]; // gold lantern on a stand
    ctx.box(o.x - 0.3, o.x + 0.3, 0, 1.2, o.z - 0.3, o.z + 0.3, GOLD);
    ctx.deco(o.x - 0.6, o.x + 0.6, 1.2, 2.6, o.z - 0.6, o.z + 0.6, 0xffe9a8);
  },
  concourse(ctx, sp, { s }) {
    for (const { x, z } of sp) {
      ctx.box(x - 0.35, x + 0.35, 0, 1.3, z - 0.35, z + 0.35, 0x222831); // position terminal
      ctx.screen(x - s * 0.36, 1.1, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0.55, 0.4, CH.ODDS);
      ctx.deco(x - 0.5, x + 0.5, 0, 6, z + 3, z + 3.3, 0x2f7bff); // light blades
      ctx.deco(x - 0.5, x + 0.5, 0, 6, z - 3.3, z - 3, 0xffc65a);
    }
  },
  shrine(ctx, sp, { s }) {
    const { x, z } = sp[0];
    ctx.box(x - 0.7, x + 0.7, 0, 1.0, z - 1.2, z + 1.2, 0x5a3a20); // shrine table
    ctx.deco(x - 0.5, x + 0.5, 1.0, 1.9, z - 0.5, z + 0.5, 0xd8a02a);
    for (let i = 0; i < 5; i++) ctx.deco(x - 0.1, x + 0.1, 1.0, 1.25, z - 1 + i * 0.5, z - 0.85 + i * 0.5, 0xffe066);
    ctx.deco(sp[1].x + s * 2.95, sp[1].x + s * 3.05, 1.0, 4.0, sp[1].z - 2.6, sp[1].z - 0.1, 0xc0262d); // red / blue corner posters
    ctx.deco(sp[1].x + s * 2.95, sp[1].x + s * 3.05, 1.0, 4.0, sp[1].z + 0.1, sp[1].z + 2.6, 0x2244cc);
  },
  paddock(ctx, sp, { s }) {
    const { x, z } = sp[0]; // horse statue
    ctx.box(x - 0.5, x + 0.5, 0, 0.5, z - 1.4, z + 1.4, 0x3b2a1a);
    ctx.deco(x - 0.35, x + 0.35, 0.5, 2.0, z - 1.0, z + 0.9, 0x6b4a2a);
    ctx.deco(x - 0.25, x + 0.25, 1.6, 2.6, z - 1.5, z - 0.9, 0x6b4a2a);
    ctx.screen(sp[1].x + s * 2.9, 2.4, sp[1].z, face(s), 3.6, 2, CH.RACE);
  },
};
