// ONE canvas-atlas renderer for "decision board" screens (docs/ai-visuals-plan.md §2.2), same pattern as
// world/theatreScreens.js: a single CanvasTexture per board, redrawn ONLY when a new event arrives (dirty) or
// every 2 s while the board is on screen (countdowns), never per frame, never when its floor is hidden.
// MeshBasicMaterial (no lights), one draw call per board. Low graphics mode keeps boards (nothing here uses glow).
import * as THREE from 'three';
import { COL, chip, outcomeColor, countdown, agoShort } from './feed.js';

const FAM = '"Segoe UI", Inter, Arial, sans-serif';

export const font = (g, px, w = 700) => { g.font = `${w} ${px}px ${FAM}`; };
export function rrect(g, x, y, w, h, r, fill, stroke, lw = 3) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
/** word-wrap to at most maxLines lines of maxW px (ellipsis on overflow) */
export function wrap(g, text, maxW, maxLines = 2) {
  const words = String(text || '').split(/\s+/), lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const t = cur ? `${cur} ${words[i]}` : words[i];
    if (g.measureText(t).width <= maxW) { cur = t; continue; }
    if (lines.length === maxLines - 1) { let rest = [cur, ...words.slice(i)].join(' '); while (rest.length > 1 && g.measureText(`${rest}…`).width > maxW) rest = rest.slice(0, -1); lines.push(`${rest}…`); return lines; }
    lines.push(cur); cur = words[i];
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}
/** a provider chip (CLAUDE / GEMINI / RULE BOOK); returns its width */
export function drawChip(g, ev, x, y, px = 26) {
  const c = chip(ev); font(g, px, 900);
  const w = g.measureText(c.label).width + px * 0.9;
  rrect(g, x, y, w, px * 1.35, px * 0.3, c.hex);
  g.fillStyle = '#0a0c12'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(c.label, x + px * 0.45, y + px * 0.68);
  return w;
}

export class Board {
  /** w,h in metres; px = canvas pixels per metre; draw(g, W, H, board) paints the whole canvas */
  constructor({ w, h, px = 230, draw, bg = '#070a10', name = 'board' }) {
    this.name = name; this.w = w; this.h = h; this.drawFn = draw;
    this.cv = document.createElement('canvas'); this.cv.width = Math.round(w * px); this.cv.height = Math.round(h * px);
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.mesh.name = name; this.mesh.frustumCulled = true;
    this.bg = bg; this.dirty = true; this.acc = 0; this.shakeT = 0; this.redraws = 0; this.base = null;
  }
  touch() { this.dirty = true; }
  /** slam: shake only the board (never the camera) for ~0.45 s */
  shake() { this.shakeT = 0.45; }
  redraw() {
    const g = this.g, { width: W, height: H } = this.cv;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = this.bg; g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    try { this.drawFn(g, W, H, this); } catch (e) { console.error(`[ai board ${this.name}]`, e); }
    this.tex.needsUpdate = true; this.dirty = false; this.acc = 0; this.redraws++;
  }
  /** call every frame with the floor's visibility; draws only when needed */
  tick(dt, visible) {
    if (!visible) return;
    this.acc += dt;
    if (this.dirty || this.acc >= 2) this.redraw();
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (!this.base) this.base = this.mesh.position.clone();
      const k = Math.max(0, this.shakeT / 0.45);
      this.mesh.position.set(this.base.x + (Math.random() - 0.5) * 0.06 * k, this.base.y + (Math.random() - 0.5) * 0.06 * k, this.base.z + (Math.random() - 0.5) * 0.06 * k);
      if (this.shakeT <= 0) this.mesh.position.copy(this.base);
    }
  }
  dispose() { this.tex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

/**
 * Generic decision-feed rows used by all three rooms: time, agent chip + name, text (2 lines), outcome tag.
 * rows = feed events (newest last); drawn newest first. opts.names maps agent id -> display name.
 */
export function drawRows(g, x, y, w, h, rows, { names = {}, rowH = 118, px = 36, show = 8 } = {}) {
  const list = rows.slice(-show).reverse();
  let yy = y;
  for (const ev of list) {
    if (yy + rowH > y + h) break;
    const veto = ev.outcome === 'vetoed', rej = ev.outcome === 'rejected';
    rrect(g, x, yy, w, rowH - 8, 14, veto ? 'rgba(120,16,16,.55)' : rej ? 'rgba(110,80,10,.4)' : 'rgba(255,255,255,.05)', veto ? COL.bad : null, 3);
    font(g, px * 0.62, 700); g.fillStyle = '#7b8498'; g.textBaseline = 'top'; g.fillText(agoShort(ev.at), x + 14, yy + 12);
    const cw = drawChip(g, ev, x + 14, yy + 12 + px * 0.9, px * 0.7);
    font(g, px * 0.66, 800); g.fillStyle = '#e3c27a'; g.fillText(names[ev.agent] || ev.agent || '', x + 14, yy + 12 + px * 0.9 + px * 1.05);
    const tx = x + Math.max(cw, 360) + 24, tw = w - (tx - x) - 20 - (ev.outcome ? px * 4.6 : 0);
    font(g, px, ev.stage === 'veto' ? 900 : 700); g.fillStyle = veto ? '#ffd0d0' : '#f0f3fa'; g.textBaseline = 'top';
    wrap(g, ev.text, tw, 2).forEach((l, i) => g.fillText(l, tx, yy + 10 + i * px * 1.18));
    if (ev.outcome) {
      font(g, px * 0.7, 900); const t = String(ev.outcome).toUpperCase(), tw2 = g.measureText(t).width + 30;
      rrect(g, x + w - tw2 - 14, yy + 14, tw2, px * 1.15, 10, outcomeColor(ev.outcome)); g.fillStyle = '#0a0c12'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(t, x + w - tw2 / 2 - 14, yy + 14 + px * 0.58); g.textAlign = 'left';
    }
    yy += rowH;
  }
  if (!list.length) { font(g, px, 700); g.fillStyle = '#7b8498'; g.textBaseline = 'top'; g.fillText('Waiting for the first decision. The countdown above is real.', x + 10, y + 20); }
}

/** header strip: title, a real countdown, and a mode line */
export function drawHeader(g, W, title, sub, cdLabel, cdAt, accent = COL.gold, big = 64) {
  g.fillStyle = accent; g.fillRect(0, 0, W, 8);
  font(g, big, 900); g.fillStyle = '#f6efe0'; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillText(title, 40, 28);
  font(g, big * 0.42, 700); g.fillStyle = '#9aa3b2'; g.fillText(sub, 44, 28 + big * 1.05);
  font(g, big * 0.42, 800); g.textAlign = 'right'; g.fillStyle = '#9aa3b2'; g.fillText(cdLabel, W - 40, 30);
  font(g, big * 1.05, 900); g.fillStyle = COL.warn; g.fillText(countdown(cdAt), W - 40, 30 + big * 0.5); g.textAlign = 'left';
}
