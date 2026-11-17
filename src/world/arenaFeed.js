// VT-02 feature feed: ONE texture shared by every big screen in the Sports Analytics Arena
// (broadcast.js setFeature). Default: an animated marquee preview card drawn from the server's
// live fixture data (real crests via the same-origin proxy). A preview video/stream can replace it:
// one <video>, one VideoTexture, every big screen (threejs-performance §4 — one decode, many screens).
import * as THREE from 'three';
import { setFeature } from './broadcast.js';
import { api } from '../net/api.js';

const W = 1024, H = 576;
const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const g = canvas.getContext('2d');
const cardTex = new THREE.CanvasTexture(canvas); cardTex.colorSpace = THREE.SRGBColorSpace; cardTex.minFilter = THREE.LinearFilter; cardTex.generateMipmaps = false;
const crests = new Map(); // url -> HTMLImageElement | 'loading' | 'failed'
let data = null, t = 0, acc = 0, video = null, videoTex = null, polled = 0;

function crest(url) {
  if (!url) return null;
  const c = crests.get(url);
  if (c && c !== 'loading' && c !== 'failed') return c;
  if (!c) {
    crests.set(url, 'loading');
    const img = new Image();
    img.onload = () => crests.set(url, img); img.onerror = () => crests.set(url, 'failed');
    img.src = `/api/football/crest?u=${encodeURIComponent(url)}`;
  }
  return null;
}
function shield(x, y, s, tla, col) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.moveTo(-s / 2, -s / 2); g.lineTo(s / 2, -s / 2); g.lineTo(s / 2, s * 0.1); g.quadraticCurveTo(s / 2, s * 0.45, 0, s / 2); g.quadraticCurveTo(-s / 2, s * 0.45, -s / 2, s * 0.1); g.closePath();
  g.fillStyle = col; g.fill(); g.lineWidth = 6; g.strokeStyle = '#f0d18a'; g.stroke();
  g.fillStyle = '#fff'; g.font = `900 ${s * 0.26}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tla || '???', 0, 0);
  g.restore();
}
function fitText(text, maxW, px, weight = 800) { do { g.font = `${weight} ${px}px "Segoe UI", system-ui, sans-serif`; px -= 2; } while (g.measureText(text).width > maxW && px > 10); }

function draw() {
  const m = data?.marquee;
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#071330'); grd.addColorStop(1, '#1a0b33');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // sweeping light
  const sx = ((t * 160) % (W + 600)) - 300;
  const sw = g.createLinearGradient(sx - 160, 0, sx + 160, 0); sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, 'rgba(255,255,255,0.07)'); sw.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sw; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d6b25e'; g.fillRect(0, 0, W, 64);
  g.fillStyle = '#120c02'; g.textAlign = 'left'; g.textBaseline = 'middle';
  fitText(m ? `MARQUEE FIXTURE · ${m.competition.name.toUpperCase()}` : 'SPORTS ANALYTICS ARENA', 640, 30, 900); g.fillText(m ? `MARQUEE FIXTURE · ${m.competition.name.toUpperCase()}` : 'SPORTS ANALYTICS ARENA', 28, 33);
  g.textAlign = 'right'; g.font = '800 22px system-ui'; g.fillStyle = (Math.floor(t * 2) % 2) ? '#7a0d0d' : '#120c02';
  g.fillText(data?.simulated ? '● SIMULATED FEED' : '● LIVE PREVIEW', W - 28, 33);
  if (!m) {
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 36px system-ui';
    g.fillText(data ? 'The Fixture Scout is reviewing the calendar…' : 'Connecting to the fixture feed…', W / 2, H / 2);
  } else {
    const pulse = 1 + Math.sin(t * 3) * 0.03, cs = 190 * pulse;
    for (const [side, team, x] of [['home', m.homeTeam, 230], ['away', m.awayTeam, W - 230]]) {
      g.save(); g.shadowColor = side === 'home' ? '#3b82f6' : '#ef4444'; g.shadowBlur = 40 + Math.sin(t * 3) * 14;
      const img = crest(team.crest);
      if (img) { const r = Math.min(cs / img.naturalWidth, cs / img.naturalHeight) || 1; g.drawImage(img, x - (img.naturalWidth * r) / 2, 205 - (img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r); }
      else shield(x, 205, cs, team.tla, side === 'home' ? '#1d4ed8' : '#b91c1c');
      g.restore();
      g.fillStyle = '#fff'; g.textAlign = 'center'; fitText((team.shortName || team.name).toUpperCase(), 380, 40, 900); g.fillText((team.shortName || team.name).toUpperCase(), x, 335);
    }
    g.fillStyle = '#f0d18a'; g.font = '900 64px system-ui'; g.textAlign = 'center'; g.fillText('VS', W / 2, 200);
    const ms = Date.parse(m.utcDate) - Date.now();
    const cd = ms > 0 ? `${Math.floor(ms / 86400000) ? `${Math.floor(ms / 86400000)}d ` : ''}${String(Math.floor((ms % 86400000) / 3600000)).padStart(2, '0')}:${String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` : 'KICK-OFF';
    g.font = '700 22px system-ui'; g.fillStyle = '#b9c3e6'; g.fillText('KICK-OFF IN', W / 2, 252);
    g.font = '900 40px ui-monospace, monospace'; g.fillStyle = '#fff'; g.fillText(cd, W / 2, 292);
    // house pricing row
    const pr = m.pricing?.prices?.['1X2'];
    if (pr) {
      const cells = [['HOME', pr.H], ['DRAW', pr.D], ['AWAY', pr.A]];
      cells.forEach(([l, v], i) => {
        const x = W / 2 + (i - 1) * 190, y = 395;
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x - 85, y - 34, 170, 68); g.strokeStyle = '#d6b25e'; g.lineWidth = 2; g.strokeRect(x - 85, y - 34, 170, 68);
        g.fillStyle = '#b9c3e6'; g.font = '700 16px system-ui'; g.fillText(l, x, y - 15);
        g.fillStyle = '#3ddc84'; g.font = '900 30px ui-monospace, monospace'; g.fillText(`${v.toFixed(2)}x`, x, y + 14);
      });
      g.fillStyle = '#8a93b8'; g.font = '600 14px system-ui'; g.fillText('HOUSE PRICING · ANALYTICS DESK GOALS MODEL · OPEN A POSITION AT ANY TERMINAL', W / 2, 446);
    }
    g.fillStyle = '#fff'; g.textAlign = 'center'; fitText(m.preview || '', W - 80, 24, 600); g.fillText(m.preview || '', W / 2, 482);
  }
  // ticker of the other fixtures
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 50, W, 50);
  const items = (data?.fixtures || []).filter((f) => f.id !== m?.id).slice(0, 14).map((f) => `${f.competition.code}  ${f.homeTeam.tla || f.homeTeam.shortName} v ${f.awayTeam.tla || f.awayTeam.shortName}  ${new Date(f.utcDate).toUTCString().slice(5, 22)}${f.pricing ? `  ${f.pricing.prices['1X2'].H.toFixed(2)} / ${f.pricing.prices['1X2'].D.toFixed(2)} / ${f.pricing.prices['1X2'].A.toFixed(2)}` : ''}`);
  const line = items.join('     ◆     ') || 'Fixture list loading…';
  g.font = '700 20px system-ui'; g.textAlign = 'left'; g.fillStyle = '#f0d18a';
  const lw = g.measureText(line).width + 120, off = (t * 90) % lw;
  g.fillText(line, 20 - off, H - 25); g.fillText(line, 20 - off + lw, H - 25);
  g.fillStyle = '#6b7394'; g.font = '600 12px system-ui'; g.textAlign = 'right'; g.fillText(data?.attribution || '', W - 12, H - 58);
  cardTex.needsUpdate = true;
}

async function poll() {
  try { data = await api('/api/football/state'); } catch { /* server offline: keep the last card */ }
}

/** play a preview video/stream on every big screen (null = back to the preview card) */
export function playArenaVideo(url) {
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; videoTex?.dispose(); videoTex = null; }
  if (!url) { setFeature(true, cardTex); return; }
  video = Object.assign(document.createElement('video'), { src: url, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous' });
  videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace; videoTex.generateMipmaps = false; videoTex.minFilter = THREE.LinearFilter;
  video.play().catch(() => {});
  setFeature(true, videoTex);
}

/** per frame: only draws while VT-02 is loaded and visible (4 Hz card, data every 60 s) */
export function updateArenaFeed(dt, visible) {
  if (!visible) { if (video && !video.paused) video.pause(); return; }
  if (video && video.paused) video.play().catch(() => {});
  t += dt; acc += dt; polled -= dt;
  if (polled <= 0) { polled = 60; poll(); }
  if (!video && acc >= 0.25) { acc = 0; draw(); }
}
export const arenaFeedData = () => data;
setFeature(true, cardTex);
draw();
