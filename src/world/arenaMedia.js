// VT-02 Arena Media (client): what staff attached to the fixture that is "on the screens" — previous
// head-to-head results and highlights — drawn onto the Arena's side screens (broadcast.js MEDIA).
//   h2h screens  : one CanvasTexture, the head-to-head card (pages through the meetings, 1 Hz redraw).
//   reel screens : (the side screens by the wall signs, the back faces of the big hanging screens and the
//                  middle ring of the centre-hung stack) they alternate between two feeds so two clips run side by side;
//                  each uploaded mp4/webm plays muted through ONE <video> + ONE VideoTexture shared by
//                  all of its feed's screens (threejs-performance §4: one decode per clip, at most two). YouTube clips cannot be
//                  drawn into WebGL (cross-origin frames): the clip plays in a muted embed laid exactly over
//                  the nearest reel screen (arenaYoutube.js, CSS3D); the other reel screens show its card.
// State comes from GET /api/arena-media and live 'arenaMedia' pushes from the hub.
import * as THREE from 'three';
import { setMediaScreens, MEDIA } from './broadcast.js';
import { api } from '../net/api.js';
import { arenaFeedData } from './arenaFeed.js';
import { ARENA } from '../floors/arena.js';
const BOWL = { cx: ARENA.cx, cz: ARENA.cz, r: ARENA.RWALL - 0.6 };
import { setArenaYoutube, updateArenaYoutube, arenaYoutubeState } from './arenaYoutube.js';

const W = 1024, H = 576;
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return { c, g: c.getContext('2d'), t }; };
const H2H = mk(), REEL = mk();
const images = new Map();
let media = null, t = 0, acc = 1, page = 0, pageT = 0;
let wasVisible = false;
const listeners = new Set();

const img = (src) => {
  if (!src) return null;
  const c = images.get(src);
  if (c instanceof HTMLImageElement) return c;
  if (!c) { images.set(src, 'loading'); const i = new Image(); i.onload = () => images.set(src, i); i.onerror = () => images.set(src, 'failed'); i.src = src; }
  return null;
};
const crestSrc = (team) => (team?.crest ? `/api/football/crest?u=${encodeURIComponent(team.crest)}` : null);
function fit(g, text, maxW, px, weight = 800) { do { g.font = `${weight} ${px}px "Segoe UI", system-ui, sans-serif`; px -= 2; } while (g.measureText(text).width > maxW && px > 10); }
function frame(g, title, right) {
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#0a1530'); grd.addColorStop(1, '#22103a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d6b25e'; g.fillRect(0, 0, W, 64);
  g.fillStyle = '#120c02'; g.textBaseline = 'middle'; g.textAlign = 'left'; fit(g, title, 700, 30, 900); g.fillText(title, 28, 33);
  g.textAlign = 'right'; g.font = '800 20px system-ui'; g.fillText(right, W - 28, 33);
}

/** the fixture on the screens (with its live fixture data when the server still lists it) */
export function currentMedia() {
  const id = media?.onScreens;
  const f = id != null && media.fixtures[id];
  if (!f) return null;
  const live = (arenaFeedData()?.fixtures || []).concat(arenaFeedData()?.marquee || []).find((x) => x.id === f.matchId);
  return { ...f, home: live?.homeTeam || f.home, away: live?.awayTeam || f.away, competition: live?.competition?.name || f.competition };
}
export const arenaMediaState = () => media;
export const onArenaMedia = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function drawH2H(f) {
  const g = H2H.g, rows = f.h2h;
  const hn = f.home?.shortName || f.home?.name || f.label.split(' v ')[0], an = f.away?.shortName || f.away?.name || f.label.split(' v ')[1] || '';
  const pages = Math.max(1, Math.ceil(rows.length / 5));
  frame(g, `HEAD-TO-HEAD · ${String(f.competition || 'FIXTURE DOSSIER').toUpperCase()}`, pages > 1 ? `${(page % pages) + 1} / ${pages}` : 'PERFORMANCE HISTORY');
  // the record, from the home side's point of view (matched by name, wherever they played)
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isHome = (n) => { const a = norm(n), b = norm(hn), c = norm(f.home?.name); return a && (a === b || a === c || b.includes(a) || a.includes(b)); };
  let w = 0, d = 0, l = 0;
  for (const r of rows) { const hw = isHome(r.home) ? r.hs - r.as : r.as - r.hs; hw > 0 ? w++ : hw < 0 ? l++ : d++; }
  for (const [team, x, col] of [[f.home, 120, '#1d4ed8'], [f.away, W - 120, '#b91c1c']]) {
    const im = img(crestSrc(team)), s = 92;
    if (im) { const r = Math.min(s / im.naturalWidth, s / im.naturalHeight) || 1; g.drawImage(im, x - (im.naturalWidth * r) / 2, 128 - (im.naturalHeight * r) / 2, im.naturalWidth * r, im.naturalHeight * r); }
    else { g.fillStyle = col; g.beginPath(); g.arc(x, 128, 42, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 24px system-ui'; g.fillText(team?.tla || '?', x, 129); }
  }
  g.textAlign = 'center'; g.fillStyle = '#fff'; fit(g, `${hn.toUpperCase()}  v  ${an.toUpperCase()}`, 600, 34, 900); g.fillText(`${hn.toUpperCase()}  v  ${an.toUpperCase()}`, W / 2, 108);
  g.font = '800 24px ui-monospace, monospace'; g.fillStyle = '#f0d18a';
  g.fillText(rows.length ? `${w} W · ${d} D · ${l} L  (${hn}, last ${rows.length})` : 'No previous meetings on file', W / 2, 152);
  const list = rows.slice((page % pages) * 5, (page % pages) * 5 + 5);
  list.forEach((r, i) => {
    const y = 214 + i * 62;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.09)'; g.fillRect(40, y - 26, W - 80, 54);
    g.textAlign = 'left'; g.fillStyle = '#b9c3e6'; g.font = '700 18px system-ui';
    g.fillText(new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 60, y - 7);
    fit(g, r.competition, 220, 15, 600); g.fillStyle = '#8a93b8'; g.fillText(r.competition, 60, y + 14);
    g.textAlign = 'right'; g.fillStyle = '#fff'; fit(g, r.home, 250, 24, 800); g.fillText(r.home, W / 2 + 40, y);
    g.textAlign = 'center'; g.fillStyle = r.hs === r.as ? '#f0d18a' : '#3ddc84'; g.font = '900 30px ui-monospace, monospace'; g.fillText(`${r.hs} – ${r.as}`, W / 2 + 120, y);
    g.textAlign = 'left'; g.fillStyle = '#fff'; fit(g, r.away, 250, 24, 800); g.fillText(r.away, W / 2 + 200, y);
  });
  g.fillStyle = '#6b7394'; g.font = '600 13px system-ui'; g.textAlign = 'center';
  g.fillText(`${rows.some((r) => r.src === 'auto') ? 'Results: football-data.org · ' : ''}Curated by Arena Media · pricing on every other screen`, W / 2, H - 22);
  H2H.t.needsUpdate = true;
}

function drawReelCard(slot, f, v) {
  const g = slot.card.g;
  frame(g, 'MATCH HIGHLIGHTS · ARENA MEDIA', f.label.toUpperCase());
  const th = v?.kind === 'youtube' ? img(v.thumb) : null;
  const bx = 112, by = 92, bw = 800, bh = 360;
  g.fillStyle = '#000'; g.fillRect(bx, by, bw, bh);
  if (th) { const r = Math.max(bw / th.naturalWidth, bh / th.naturalHeight); g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip(); g.drawImage(th, bx + bw / 2 - (th.naturalWidth * r) / 2, by + bh / 2 - (th.naturalHeight * r) / 2, th.naturalWidth * r, th.naturalHeight * r); g.restore(); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(bx, by, bw, bh);
  const pulse = 1 + Math.sin(t * 3) * 0.06;
  g.save(); g.translate(W / 2, by + bh / 2); g.scale(pulse, pulse);
  g.fillStyle = '#d6b25e'; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#120c02'; g.beginPath(); g.moveTo(-18, -28); g.lineTo(30, 0); g.lineTo(-18, 28); g.closePath(); g.fill(); g.restore();
  g.strokeStyle = '#d6b25e'; g.lineWidth = 3; g.strokeRect(bx, by, bw, bh);
  g.textAlign = 'center'; g.fillStyle = '#fff'; fit(g, v?.title || 'Highlights', W - 120, 30, 800); g.fillText(v?.title || 'Highlights', W / 2, 488);
  g.fillStyle = (Math.floor(t * 2) % 2) ? '#f0d18a' : '#fff'; g.font = '900 24px system-ui';
  g.fillText('NOW SHOWING ON THE ARENA HIGHLIGHTS REEL', W / 2, 530);
  slot.card.t.needsUpdate = true;
}

// Two slots, one per feed. Slot k plays clips k, k+2, k+4… (each slot cycles through its share: files
// advance when they end, YouTube cards every 2 minutes). A single clip runs on both feeds from ONE decode.
const SLOTS = [{ kind: 'reel', card: REEL }, { kind: 'reel2', card: mk() }].map((sl) => ({ ...sl, video: null, tex: null, idx: 0, t: 0, cur: null }));
const shareOf = (f, k) => f.videos.filter((_, i) => f.videos.length < 2 || i % 2 === k);
function stopVideo(sl) {
  if (!sl.video) return;
  sl.video.pause(); sl.video.removeAttribute('src'); sl.video.load(); sl.video = null; sl.tex?.dispose(); sl.tex = null;
}
const stopAll = () => SLOTS.forEach(stopVideo);
function advance(sl) { sl.idx++; sl.t = 0; stopVideo(sl); apply(); }
// Clips are fetched into memory and played from a blob: URL. Download-manager extensions (e.g. IDM)
// pop a "Download File Info" dialog for any <video> pointed straight at an .mp4 address; they ignore
// in-memory blobs. One fetch per clip, kept for the few clips in rotation.
const blobs = new Map(); // src -> Promise<objectURL>
function clipUrl(src) {
  if (!blobs.has(src)) {
    blobs.set(src, fetch(src).then((r) => { if (!r.ok) throw new Error(`clip ${r.status}`); return r.blob(); }).then((b) => URL.createObjectURL(b)));
    blobs.get(src).catch(() => blobs.delete(src)); // a failed fetch is retried next time
    while (blobs.size > 4) { const [old, p] = blobs.entries().next().value; blobs.delete(old); p.then((u) => setTimeout(() => URL.revokeObjectURL(u), 60_000)).catch(() => {}); }
  }
  return blobs.get(src);
}
function playFile(sl, v) {
  stopVideo(sl);
  const vid = Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'auto' });
  const token = (sl.token = (sl.token || 0) + 1);
  clipUrl(v.src).then((u) => { if (sl.token === token && sl.video === vid) { vid.src = u; vid.play().catch(() => {}); } }).catch(() => { if (sl.video === vid) advance(sl); });
  vid.dataset.id = v.id;
  vid.addEventListener('ended', () => advance(sl));
  vid.addEventListener('error', () => advance(sl));
  sl.video = vid;
  sl.tex = new THREE.VideoTexture(vid); sl.tex.colorSpace = THREE.SRGBColorSpace; sl.tex.generateMipmaps = false; sl.tex.minFilter = THREE.LinearFilter;
}
let ytScreens = [];

/** choose what each screen group shows for the current state */
function apply() {
  const f = currentMedia();
  if (!f) { stopAll(); setArenaYoutube(null); for (const k of ['h2h', 'reel', 'reel2']) setMediaScreens(k, null); return; }
  setMediaScreens('h2h', f.h2h.length ? H2H.t : null);
  if (!f.videos.length) { stopAll(); setArenaYoutube(null); for (const sl of SLOTS) setMediaScreens(sl.kind, f.h2h.length ? H2H.t : null); return; } // a dossier but no clips
  const solo = f.videos.length === 1;
  let yt = null;
  ytScreens = [];
  SLOTS.forEach((sl, k) => {
    if (solo && k === 1) { sl.cur = SLOTS[0].cur; stopVideo(sl); setMediaScreens(sl.kind, SLOTS[0].cur?.kind === 'file' ? SLOTS[0].tex : SLOTS[0].card.t); return; } // same clip, same decode
    const share = shareOf(f, k), v = share[sl.idx % share.length];
    sl.cur = v;
    if (v.kind === 'file') { if (sl.video?.dataset.id !== v.id) playFile(sl, v); setMediaScreens(sl.kind, sl.tex); }
    else { stopVideo(sl); drawReelCard(sl, f, v); setMediaScreens(sl.kind, sl.card.t); if (!yt) { yt = v.yt; ytScreens = solo ? [...MEDIA.items.reel, ...MEDIA.items.reel2] : MEDIA.items[sl.kind]; } }
  });
  setArenaYoutube(yt);
}

function ingest(m) {
  const prev = media?.onScreens;
  media = m; if (prev !== m?.onScreens) { for (const sl of SLOTS) { sl.idx = 0; sl.t = 0; } page = 0; }
  apply();
  for (const fn of listeners) { try { fn(m); } catch (e) { console.error(e); } }
}
export async function refreshArenaMedia() { try { ingest(await api('/api/arena-media')); } catch { /* offline */ } }
export function bindArenaMedia(rt) { rt.on('arenaMedia', (m) => ingest(m.media)); rt.on('status', (s) => { if (s.connected) refreshArenaMedia(); }); refreshArenaMedia(); }


/** per frame from main.js: draws only while VT-02 is visible; the video pauses when you leave */
export function updateArenaMedia(dt, visible, camera, scene) {
  if (camera) { try { updateArenaYoutube(camera, visible, ytScreens, scene, dt, BOWL); } catch (e) { console.warn('[arena media]', e.message); } }
  if (!visible) { for (const sl of SLOTS) if (sl.video && !sl.video.paused) sl.video.pause(); wasVisible = false; return; }
  if (!wasVisible) { wasVisible = true; apply(); }
  const f = currentMedia();
  if (!f) return;
  for (const sl of SLOTS) { if (sl.video?.paused) sl.video.play().catch(() => {}); sl.t += dt; }
  t += dt; acc += dt; pageT += dt;
  if (pageT > 8) { pageT = 0; page++; }
  const solo = f.videos.length === 1;
  SLOTS.forEach((sl, k) => { if (!(solo && k === 1) && sl.cur?.kind === 'youtube' && sl.t > 120 && shareOf(f, k).length > 1) advance(sl); }); // YouTube cards rotate; files advance on 'ended'
  if (acc >= 0.5) { acc = 0; if (f.h2h.length) drawH2H(f); SLOTS.forEach((sl, k) => { if (!(solo && k === 1) && sl.cur?.kind === 'youtube') drawReelCard(sl, f, sl.cur); }); }
}
export const arenaMediaDebug = () => ({ canvases: { h2h: H2H.c, reel: REEL.c, reel2: SLOTS[1].card.c }, youtube: arenaYoutubeState(), onScreens: media?.onScreens ?? null,
  slots: SLOTS.map((sl) => ({ kind: sl.kind, clip: sl.cur?.title || null, video: sl.video ? { src: sl.video.currentSrc.split('/').pop(), paused: sl.video.paused, t: +sl.video.currentTime.toFixed(1) } : null })) });
