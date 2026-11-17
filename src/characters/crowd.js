// In-game crowd: hundreds of the approved caricature characters at a handful of draw calls.
// How it works:
//  · each outfit "archetype" is built ONCE as a kit Character and baked into one geometry whose
//    vertices carry the index of the bone they ride on (aBone) and which per-person colour slot they
//    take (aSlot: top / pants / skin / hair, or -1 = the part's own colour);
//  · every person is a bone-only rig (kit makeBones/animateRig): poses, walk cycle, IK arms;
//  · per frame the rigs' bone matrices + colours + expression go into one float texture
//    (one row per person); the vertex shader fetches its bone matrix by (bone, row) — GPU skinning;
//  · one draw call per archetype, per hair style, plus one for all the painted faces.
// Shadows: the game's shadow map is static (autoUpdate off), so crowds do not cast shadows.
import * as THREE from 'three';
import { makeBones, animateRig, EXPRESSIONS, drawFace, D, HC, HEAD_SY, mat, cylC, Character, rifle, LOD } from './kit.js';
import { A, SKINS } from './roster.js';

const NB = 13;
const bonesOf = (c) => [c.torso, c.head, c.armR.upper, c.armR.elbow, c.armR.grip, c.armL.upper, c.armL.elbow, c.armL.grip, c.legR.hip, c.legR.knee, c.legL.hip, c.legL.knee, c.body];
const COL0 = NB * 3, MISC = COL0 + 4, W = MISC + 1; // texels per row: 13 bones x 3 rows, 4 colours, 1 misc (face)

// sentinel colours: parts drawn in these take the person's own colours
const SENT = { top: 0xfe00a1, pants: 0xfe00a2, skin: 0xfe00a3, hair: 0xfe00a4 };
const SLOT_OF = new Map([[SENT.top, 0], [SENT.pants, 1], [SENT.skin, 2], [SENT.hair, 3]]);
const T = () => mat(SENT.top, { rough: 0.6 }), P = () => mat(SENT.pants, { rough: 0.7 });
const UNDER = () => mat(0x1b1d22, { rough: 0.95 });

// ---------------------------------------------------------------- archetypes (department uniforms)
const baton = (c) => { add2(c.armR.grip, cylC(0.022, 0.022, 0.62, 8, 'z'), mat(0x111111, { rough: 0.4, metal: 0.5 }), 0, -0.02, 0.27); add2(c.armR.grip, cylC(0.026, 0.026, 0.06, 8, 'z'), mat(0x000000, { emissive: 0x39d0ff, ei: 2.5 }), 0, -0.02, 0.56); };
function add2(parent, geo, m, x, y, z) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; }
export const ARCHETYPES = {
  suit: () => ({ top: T(), pants: P(), shoes: mat(0x0c0c0c, { rough: 0.3 }), extras: [(c) => A.shirtV(c, 0xf2f2f2), (c) => A.tie(c, 0x6b1f2e), (c) => A.lapels(c, SENT.top), (c) => A.buttons(c, mat(0x111111))] }),
  trader: () => ({ top: T(), pants: P(), shoes: mat(0x111111, { rough: 0.4 }), extras: [(c) => A.shirtV(c, 0xdfe9f5, 0.4, 0.16), (c) => A.tie(c, 0x1a1a1a, 0.15), (c) => c.onChest(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.062), mat(0xffe14d, { rough: 0.5 })), 0.14, 0.42), (c) => A.phone(c, 'armL')] }),
  casual: () => ({ top: T(), pants: P(), shoes: mat(0xf2f2f2, { rough: 0.6 }), extras: [A.headset, (c) => A.hood(c, SENT.top), (c) => A.lanyard(c, 0xd62b2b), (c) => A.phone(c, 'armR')] }),
  shirt: () => ({ top: T(), pants: P(), shoes: mat(0x2b1d14, { rough: 0.5 }), extras: [(c) => A.collar(c, 0xffffff), (c) => A.lanyard(c, 0x1a6bd6), (c) => A.glasses(c)] }),
  host: () => ({ top: mat(0x111114, { rough: 0.5 }), sleeves: T(), pants: P(), shoes: mat(0x0b0b0b, { rough: 0.25 }), extras: [(c) => A.shirtV(c, SENT.top, 0.26, 0.24), (c) => A.bowTie(c, 0x9e1b2b), A.garters, (c) => A.buttons(c, mat(0xd9ad3c, { rough: 0.3, metal: 0.9 }), [0.2, 0.12, 0.04])] }),
  guard: () => ({ build: 'broad', helmet: true, top: UNDER(), pants: UNDER(), armor: { visor: 0xff2a2a }, extras: [rifle] }),
  guardFront: () => ({ build: 'broad', helmet: true, top: UNDER(), pants: UNDER(), armor: { trim: true, visor: 0xfff0c0 }, extras: [rifle] }),
  guardBaton: () => ({ build: 'broad', helmet: true, top: UNDER(), pants: UNDER(), armor: { visor: 0xff2a2a }, extras: [baton] }),
};
const HELMETED = new Set(['guard', 'guardFront', 'guardBaton']);
const DEFAULT_POSE = { guard: 'rifle', guardFront: 'rifle', guardBaton: 'idle' };
export const GUARD_SUITS = new Set([0x050505, 0x0b0d12, 0x111418, 0x141518]);
const HAIRS = ['slick', 'short', 'short', 'buzz', 'bob', 'long', 'bun', 'pony', 'afro', 'curly', 'bald'];

// ---------------------------------------------------------------- baking
function avgColor(tex) {
  const img = tex.image, c = document.createElement('canvas'); c.width = c.height = 4;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 4, 4);
  const d = g.getImageData(0, 0, 4, 4).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < 64; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  return new THREE.Color().setRGB(r / 4080, gg / 4080, b / 4080, THREE.SRGBColorSpace);
}
function bake(char, keep) {
  char.root.updateMatrixWorld(true);
  const bones = bonesOf(char), inv = bones.map((b) => b.matrixWorld.clone().invert());
  const P = [], B = [], S = [], C = [], RM = [], E = [];
  const rel = new THREE.Matrix4(), col = new THREE.Color(), em = new THREE.Color();
  char.root.traverse((m) => {
    if (!m.isMesh || m === char.faceMesh || m.isSprite) return;
    const mt = m.material;
    if (mt.transparent && mt.opacity < 1) return;
    let p = m.parent, bi = -1;
    while (p && (bi = bones.indexOf(p)) < 0) p = p.parent;
    if (bi < 0) return;
    const hex = mt.color ? mt.color.getHex() : 0xffffff, slot = SLOT_OF.has(hex) ? SLOT_OF.get(hex) : -1;
    if (!keep(slot)) return;
    rel.multiplyMatrices(inv[bi], m.matrixWorld);
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(rel);
    if (mt.map) col.copy(avgColor(mt.map)); else col.copy(mt.color ?? new THREE.Color(1, 1, 1));
    em.setRGB(0, 0, 0);
    if (mt.isMeshBasicMaterial) { em.copy(col); col.multiplyScalar(0.2); } else if (mt.emissive) em.copy(mt.emissive).multiplyScalar(mt.emissiveIntensity ?? 1);
    const rough = mt.roughness ?? 1, metal = mt.metalness ?? 0, pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      P.push(pa.getX(i), pa.getY(i), pa.getZ(i)); B.push(bi); S.push(slot);
      C.push(col.r, col.g, col.b); RM.push(rough, metal); E.push(em.r, em.g, em.b);
    }
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aBone', new THREE.Float32BufferAttribute(B, 1));
  geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(S, 1));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aRM', new THREE.Float32BufferAttribute(RM, 2));
  geo.setAttribute('aEmis', new THREE.Float32BufferAttribute(E, 3));
  return geo;
}
// baked at kit LOD 1 (near: plain boxes, fewer segments) and LOD 2 (far: minimum segments)
const GEO = new Map();
function atLod(level, make) { const prev = LOD.level; LOD.level = level; try { return make(); } finally { LOD.level = prev; } }
function archGeo(kind, level) {
  const key = `a:${kind}:${level}`;
  if (!GEO.has(key)) GEO.set(key, atLod(level, () => bake(new Character({ skin: SENT.skin, ...(ARCHETYPES[kind] || ARCHETYPES.suit)() }), (s) => s !== 3)));
  return GEO.get(key);
}
function hairGeo(style, level) {
  const key = `h:${style}:${level}`;
  if (!GEO.has(key)) GEO.set(key, atLod(level, () => bake(new Character({ skin: SENT.skin, hair: style, hairColor: SENT.hair }), (s) => s === 3)));
  return GEO.get(key);
}
// distance bands: < 20 m detailed figure + painted face · < 45 m simplified figure · beyond: box impostor
const BAND1 = 20 * 20, BAND2 = 45 * 45, RR_BUDGET = 120;
// the far impostor: ~12 boxes riding the same bones (so it still walks, sits and cheers), ~150 triangles
function impostorGeo(kind) {
  const key = `i:${kind}`;
  if (GEO.has(key)) return GEO.get(key);
  const helmet = HELMETED.has(kind), DARK = 0x15161a;
  const parts = [ // [bone, slot, w, h, d, x, y, z, fixedColour?, emissive?]
    [0, 0, 0.46, 0.64, 0.3, 0, 0.31, 0], [12, 1, 0.36, 0.2, 0.25, 0, D.hipY - 0.06, 0],
    [1, helmet ? -1 : 2, 0.3, 0.36, 0.31, 0, HC.y, 0, DARK],
    [2, 0, 0.13, D.upper, 0.13, 0, -D.upper / 2, 0], [5, 0, 0.13, D.upper, 0.13, 0, -D.upper / 2, 0],
    [3, 0, 0.11, D.fore + 0.07, 0.11, 0, -(D.fore + 0.07) / 2, 0], [6, 0, 0.11, D.fore + 0.07, 0.11, 0, -(D.fore + 0.07) / 2, 0],
    [8, 1, 0.17, D.thigh, 0.17, 0, -D.thigh / 2, 0], [10, 1, 0.17, D.thigh, 0.17, 0, -D.thigh / 2, 0],
    [9, 1, 0.14, D.shin, 0.14, 0, -D.shin / 2, 0], [11, 1, 0.14, D.shin, 0.14, 0, -D.shin / 2, 0],
    [9, -1, 0.13, 0.08, 0.26, 0, -D.shin - 0.02, 0.05, 0x111111], [11, -1, 0.13, 0.08, 0.26, 0, -D.shin - 0.02, 0.05, 0x111111],
    helmet ? [1, -1, 0.27, 0.07, 0.02, 0, HC.y + 0.01, 0.16, 0x050505, 0xff2a2a] : [1, 3, 0.33, 0.12, 0.33, 0, HC.y + 0.15, -0.01],
  ];
  const P = [], B = [], S = [], C = [], RM = [], E = [], c = new THREE.Color(), em = new THREE.Color();
  for (const [bone, slot, w, h, d, x, y, z, fixed = 0xffffff, emis = 0] of parts) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(), pa = g.attributes.position;
    c.set(fixed); em.set(emis).multiplyScalar(emis ? 2 : 0);
    for (let i = 0; i < pa.count; i++) { P.push(pa.getX(i), pa.getY(i), pa.getZ(i)); B.push(bone); S.push(slot); C.push(c.r, c.g, c.b); RM.push(0.7, 0); E.push(em.r, em.g, em.b); }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aBone', new THREE.Float32BufferAttribute(B, 1));
  geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(S, 1));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aRM', new THREE.Float32BufferAttribute(RM, 2));
  geo.setAttribute('aEmis', new THREE.Float32BufferAttribute(E, 3));
  GEO.set(key, geo);
  return geo;
}
let FACE_GEO = null, ATLAS = null;
function faceGeo() {
  if (!FACE_GEO) {
    const g = new THREE.SphereGeometry(D.headR * 1.012, 12, 9).scale(1, HEAD_SY, 1).translate(HC.x, HC.y, HC.z).toNonIndexed();
    g.deleteAttribute('normal');
    g.setAttribute('aBone', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    FACE_GEO = g;
  }
  return FACE_GEO;
}
function faceAtlas() {
  if (!ATLAS) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256 * EXPRESSIONS.length;
    const g = c.getContext('2d');
    EXPRESSIONS.forEach((e, k) => { g.save(); g.translate(0, k * 256); drawFace(g, e); g.restore(); });
    ATLAS = new THREE.CanvasTexture(c); ATLAS.colorSpace = THREE.SRGBColorSpace; ATLAS.anisotropy = 4;
  }
  return ATLAS;
}

// ---------------------------------------------------------------- materials (GPU skinning by bone texture)
const BONE_GLSL = /* glsl */ `
attribute float aBone;
attribute float aRow;
uniform highp sampler2D uBones;
mat4 crowdBone(int b, int r) {
  vec4 r0 = texelFetch(uBones, ivec2(b * 3, r), 0), r1 = texelFetch(uBones, ivec2(b * 3 + 1, r), 0), r2 = texelFetch(uBones, ivec2(b * 3 + 2, r), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}`;
function bodyMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${BONE_GLSL}
attribute float aSlot; attribute vec3 aCol; attribute vec2 aRM; attribute vec3 aEmis;
varying vec3 vCrowdCol; varying vec2 vRM; varying vec3 vEmis;`)
      .replace('#include <begin_vertex>', `int cRow = int(aRow + 0.5);
vec3 transformed = (crowdBone(int(aBone + 0.5), cRow) * vec4(position, 1.0)).xyz;
vCrowdCol = aSlot < -0.5 ? aCol : texelFetch(uBones, ivec2(${COL0} + int(aSlot + 0.5), cRow), 0).rgb;
vRM = aRM; vEmis = aEmis;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrowdCol; varying vec2 vRM; varying vec3 vEmis;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vCrowdCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmis;');
  };
  m.customProgramCacheKey = () => 'crowd-body';
  return m;
}
function faceMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: faceAtlas(), alphaTest: 0.5, roughness: 0.6, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${BONE_GLSL}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
{ float fI = texelFetch(uBones, ivec2(${MISC}, int(aRow + 0.5)), 0).x; vMapUv.y = (vMapUv.y + (${EXPRESSIONS.length - 1}.0 - fI)) / ${EXPRESSIONS.length}.0; }`)
      .replace('#include <begin_vertex>', 'vec3 transformed = (crowdBone(1, int(aRow + 0.5)) * vec4(position, 1.0)).xyz;');
  };
  m.customProgramCacheKey = () => 'crowd-face';
  return m;
}

// ---------------------------------------------------------------- the crowd
const OFF = new THREE.Matrix4().makeTranslation(0, -0.85, 0); // capsule-centre convention of the old API
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
let seedCounter = 1;
const rngOf = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export class Crowd {
  static viewer = new THREE.Vector3(); // set every frame by the game (the camera): drives the animation LOD
  constructor(ctx) { this.ctx = ctx; this.people = []; this.built = false; this.t = 0; this.frame = 0; this.rr = 0; this.r = rngOf(seedCounter++ * 7919); }
  /**
   * Add a person. o: { x, y, z, yaw, kind, suit, pants, skin, hair, hairStyle, face, pose, walk, speed, fidget, sit, external }
   * kind: suit | trader | casual | shirt | host | guard | guardFront | guardBaton (inferred from the suit colour if omitted)
   */
  add(o = {}) {
    const r = this.r, p = { x: 0, y: 0, z: 0, yaw: 0, speed: 1.25, fidget: 0, ...o };
    p.kind = o.kind || (GUARD_SUITS.has(o.suit) ? 'guard' : o.fidget > 0 && !o.sit ? 'trader' : 'suit');
    p.top = o.suit ?? 0x1f2a44;
    p.pants = o.pants ?? ({ trader: 0x22242a, casual: 0x2c3e5a, shirt: 0x3a3f4a, host: 0x111114 }[p.kind] ?? p.top);
    p.skin = SKINS[Math.floor(r() * SKINS.length)]; // even international mix (user decision 2026-11-18)
    p.hair = o.hair ?? 0x1b1b1b;
    this.hairs ??= [...HAIRS].sort(() => r() - 0.5).slice(0, 6); // 6 styles per crowd: fewer draw calls
    p.hairStyle = HELMETED.has(p.kind) ? null : o.hairStyle || this.hairs[Math.floor(r() * this.hairs.length)];
    p.width = 0.93 + r() * 0.18;
    p.pose = o.pose || (o.sit ? 'sit' : o.fidget > 0 ? 'shout' : DEFAULT_POSE[p.kind] || 'idle');
    p.face = o.face || (o.sit ? 'focus' : ['neutral', 'smug', 'happy', 'neutral'][Math.floor(r() * 4)]);
    if (p.walk) { p.seg = Math.floor(r() * p.walk.length); p.u = r(); }
    p.ph = r() * 100; p.rate = 0.6 + r() * 1.4;
    p.m4 = new THREE.Matrix4().makeScale(0, 0, 0); p.prev = new THREE.Vector3(); p.v = 0;
    this.people.push(p);
    return this.people.length - 1;
  }
  setRoot(i, m4) { this.people[i].m4.copy(m4); }
  pose(i, name) { const p = this.people[i]; p.pose = name; if (p.rig) p.rig.pose = name; }
  expr(i, name) { const p = this.people[i]; p.face = name; if (p.rig) p.rig.expr = name; }
  writeColors(i) {
    const p = this.people[i], d = this.data, c = new THREE.Color();
    [p.top, p.pants, p.skin, p.hair].forEach((hex, k) => { c.set(hex); const o = (i * W + COL0 + k) * 4; d[o] = c.r; d[o + 1] = c.g; d[o + 2] = c.b; d[o + 3] = 1; });
  }
  build() {
    if (this.built) return;
    this.built = true;
    const n = this.people.length;
    if (!n) return;
    const tex = (this.tex = new THREE.DataTexture(new Float32Array(W * n * 4), W, n, THREE.RGBAFormat, THREE.FloatType));
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
    this.data = tex.image.data;
    this.people.forEach((p, i) => {
      p.row = i;
      p.rig = makeBones({}, { pose: p.pose, face: p.face });
      p.rig.torso.scale.x = p.width; p.rig.head.scale.x = 1 / p.width;
      for (const a of [p.rig.armR, p.rig.armL]) a.upper.scale.x = 1 / p.width;
      this.writeColors(i);
    });
    const body = (this.bodyMat = bodyMaterial(tex)), hair = bodyMaterial(tex), face = (this.faceMat = faceMaterial(tex));
    hair.side = THREE.DoubleSide; // open hair shells are seen from below too
    // one bounding sphere for the whole crowd (frustum culling); crowds whose figures are driven from outside are never culled
    let sphere = null;
    if (!this.people.some((p) => p.external)) {
      const pts = [], e = this.ctx.e ?? 0;
      for (const p of this.people) { pts.push(new THREE.Vector3(p.x, e + p.y + 1, p.z)); for (const w of p.walk || []) pts.push(new THREE.Vector3(w[0], e + p.y + 1, w[1])); }
      sphere = new THREE.Box3().setFromPoints(pts).getBoundingSphere(new THREE.Sphere());
      sphere.radius += 2.5;
    }
    this.lods = [];
    const group = (list, key) => { const m = new Map(); for (const p of list) { const k = key(p); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(p); } return m; };
    for (const [kind, list] of group(this.people, (p) => p.kind)) this.lodSet(list, [archGeo(kind, 1), archGeo(kind, 2), impostorGeo(kind)], body, sphere);
    for (const [style, list] of group(this.people, (p) => p.hairStyle)) if (style !== 'bald') this.lodSet(list, [hairGeo(style, 1), hairGeo(style, 2), null], hair, sphere);
    const faced = this.people.filter((p) => !HELMETED.has(p.kind));
    if (faced.length) this.lodSet(faced, [faceGeo(), null, null], face, sphere); // painted faces only up close
    this.ctx.disposables?.push(tex, body, hair, face);
    this.update(1 / 60, true);
    this.ctx.onUpdate((dt) => { if (this.ctx.group.visible) this.update(dt); });
  }
  /** one mesh per distance band (null = nothing drawn in that band) */
  lodSet(list, srcs, material, sphere) {
    this.lods.push({ list, bands: srcs.map((s) => (s ? this.mesh(s, material, list.length, sphere) : null)) });
  }
  mesh(src, material, n, sphere) {
    const g = new THREE.InstancedBufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
    g.setAttribute('aRow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    g.instanceCount = 0;
    if (sphere) g.boundingSphere = sphere;
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = !!sphere; m.castShadow = false; m.receiveShadow = true;
    this.ctx.add(m, g);
    return m;
  }
  /** split each archetype's instances between its distance-band meshes */
  partition() {
    const cnt = [0, 0, 0];
    for (const { list, bands } of this.lods) {
      cnt[0] = cnt[1] = cnt[2] = 0;
      for (const p of list) { const m = bands[p.band]; if (m) m.geometry.attributes.aRow.array[cnt[p.band]++] = p.row; }
      bands.forEach((m, k) => { if (m) { m.geometry.instanceCount = cnt[k]; m.visible = cnt[k] > 0; m.geometry.attributes.aRow.needsUpdate = true; } }); // empty bands issue no draw call
    }
  }
  update(dt, all = false) {
    if (!this.built || !this.people.length) return;
    this.t += dt; this.frame++;
    const n = this.people.length, e = this.ctx.e ?? 0, V = globalThis.__crowdViewer || Crowd.viewer, fr = this.frame;
    // Animation budget (CPU): people within 10 m every frame; moving / externally driven figures within
    // 25 m every frame, else every 2nd; everyone else round-robin, at most RR_BUDGET per frame.
    let rr = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      const px = p.external ? p.m4.elements[12] : p.x, pz = p.external ? p.m4.elements[14] : p.z;
      const py = p.external ? p.m4.elements[13] - 0.85 : e + p.y;
      const d2 = (px - V.x) ** 2 + (pz - V.z) ** 2 + (py - V.y) ** 2;
      p.band = d2 < BAND1 ? 0 : d2 < BAND2 ? 1 : 2;
      const moving = p.external || p.walk;
      p.due = all || d2 < 100 || (moving && (d2 < 625 || (fr + i) % 2 === 0));
      if (p.due) this.animate(i, dt);
    }
    if (!all) {
      for (let k = 0; k < n && rr < RR_BUDGET; k++) {
        const i = (this.rr + k) % n;
        if (!this.people[i].due) { this.animate(i, dt); rr++; }
      }
      this.rr = (this.rr + Math.max(rr, 1)) % n;
    }
    this.tex.needsUpdate = true;
    if (all || fr % 8 === 0) this.partition();
  }
  animate(i, dt) {
    const p = this.people[i], rig = p.rig, root = rig.root, t = this.t, d = this.data, e = this.ctx.e ?? 0;
    const first = p.last == null, sdt = Math.min(1, first ? dt : t - p.last);
    p.last = t;
    let speed = 0;
    if (p.external) {
      _m.multiplyMatrices(p.m4, OFF); _m.decompose(root.position, root.quaternion, root.scale);
      if (root.scale.x < 1e-3) { root.updateMatrixWorld(true); this.write(i, rig); return; }
      const v = Math.hypot(root.position.x - p.prev.x, root.position.z - p.prev.z) / Math.max(sdt, 1e-3);
      p.v += (Math.min(v, 6) - p.v) * Math.min(1, sdt * 8); p.prev.copy(root.position); speed = p.v > 0.35 ? p.v : 0;
    } else if (p.walk) {
      const pts = p.walk;
      let a = pts[p.seg % pts.length], b = pts[(p.seg + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      p.u += (sdt * p.speed) / len;
      while (p.u >= 1) { p.u -= 1; p.seg = (p.seg + 1) % pts.length; a = pts[p.seg % pts.length]; b = pts[(p.seg + 1) % pts.length]; len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; }
      p.x = a[0] + (b[0] - a[0]) * p.u; p.z = a[1] + (b[1] - a[1]) * p.u; p.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      root.position.set(p.x, e + p.y, p.z); root.quaternion.setFromAxisAngle(UP, p.yaw); speed = p.speed;
    } else {
      const yaw = p.yaw + (p.fidget ? Math.sin(t * p.rate + p.ph) * 0.45 * p.fidget : 0);
      root.position.set(p.x, e + p.y, p.z); root.quaternion.setFromAxisAngle(UP, yaw);
    }
    const f = animateRig(rig, sdt, t, speed, first || sdt > 0.5);
    if (f !== p.shown) { p.shown = f; d[(i * W + MISC) * 4] = Math.max(0, EXPRESSIONS.indexOf(f)); }
    root.updateMatrixWorld(true);
    this.write(i, rig);
  }

  write(i, rig) {
    const d = this.data, bones = rig._bones || (rig._bones = bonesOf(rig));
    for (let b = 0; b < NB; b++) {
      const m = bones[b].matrixWorld.elements, o = (i * W + b * 3) * 4;
      d[o] = m[0]; d[o + 1] = m[4]; d[o + 2] = m[8]; d[o + 3] = m[12];
      d[o + 4] = m[1]; d[o + 5] = m[5]; d[o + 6] = m[9]; d[o + 7] = m[13];
      d[o + 8] = m[2]; d[o + 9] = m[6]; d[o + 10] = m[10]; d[o + 11] = m[14];
    }
  }
}

/** Old `peopleInstanced` API, now backed by a Crowd: callers drive each person's root with set(i, capsuleMatrix). */
export function crowdInstanced(ctx, n, sit = false) {
  const crowd = new Crowd(ctx);
  for (let i = 0; i < n; i++) crowd.add({ external: true, sit });
  const lazy = () => { if (!crowd.built) crowd.build(); };
  return {
    crowd, meshes: [],
    color(i, suit, skin, hair, kind) {
      const p = crowd.people[i];
      if (!crowd.built) { p.kind = kind || (GUARD_SUITS.has(suit) ? 'guard' : p.kind); if (HELMETED.has(p.kind)) { p.hairStyle = null; p.pose = DEFAULT_POSE[p.kind] || p.pose; } }
      p.top = suit; if (!['trader', 'casual', 'shirt', 'host'].includes(p.kind)) p.pants = suit;
      if (hair != null) p.hair = hair;
      if (crowd.built) crowd.writeColors(i);
    },
    set(i, m4) { crowd.setRoot(i, m4); },
    commit: lazy,
    pose(i, name) { crowd.pose(i, name); },
    expr(i, name) { crowd.expr(i, name); },
  };
}
