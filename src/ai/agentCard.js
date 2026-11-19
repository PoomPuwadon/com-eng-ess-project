// Walk-up card + press-E history panel (owner decision 2). READ-ONLY: visitors cannot talk to agents
// (only the CEO/admins can, via the console); this shows what an agent decided, why, and what happened.
// A DOM overlay, so it stays readable in Low graphics mode and costs no draw calls.
// Owners (aiTraders.js, the VT-02 pods, ...) register people and update their positions each frame.
import { forAgent, thinking, chip, outcomeColor, agoShort, countdown, status, offline } from './feed.js';

const REG = new Map();
const RADIUS = 4;
/** register / refresh a person. p: { id, name, role, room, floor, x, y, z, agent?, pod?, mirrors?, active? } */
export function setPerson(p) { REG.set(p.id, { ...(REG.get(p.id) || {}), ...p }); }
export function setPersonPos(id, floor, x, y, z) { const r = REG.get(id); if (r) { r.floor = floor; r.x = x; r.y = y; r.z = z; } }
export const people = () => [...REG.values()];

let root = null, card = null, panel = null, current = null;
function css() {
  if (document.getElementById('ai-card-css')) return;
  const s = document.createElement('style'); s.id = 'ai-card-css';
  s.textContent = `
  .aic{position:fixed;left:18px;bottom:96px;width:min(420px,calc(100vw - 36px));background:rgba(8,10,16,.93);border:2px solid var(--c,#e3c27a);border-radius:14px;color:#eef1f8;font:600 13px/1.35 "Segoe UI",Inter,Arial,sans-serif;padding:12px 14px;z-index:40;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.5);display:none}
  .aic b.h{display:block;font-size:11px;letter-spacing:.14em;color:var(--c)}
  .aic h3{margin:2px 0 0;font-size:19px;font-weight:800}.aic .r{color:#e3c27a;font-size:12px;margin-bottom:6px}
  .aic .pod{color:#9aa3b2;font-size:11px;margin-bottom:4px}
  .aic ol{list-style:none;margin:6px 0 0;padding:0}.aic li{padding:5px 0;border-top:1px solid rgba(255,255,255,.08)}
  .aic li i{font-style:normal;font-weight:800;font-size:11px;padding:1px 6px;border-radius:5px;color:#0a0c12;margin-left:6px}
  .aic .t{color:#7b8498;font-size:11px;margin-right:6px}.aic .k{margin-top:8px;color:#ffe27a;font-size:12px}
  .aip{position:fixed;inset:0;background:rgba(2,4,8,.72);display:none;align-items:center;justify-content:center;z-index:60}
  .aip>div{width:min(760px,calc(100vw - 32px));max-height:min(80vh,720px);overflow:auto;background:#0a0d14;border:2px solid var(--c,#e3c27a);border-radius:16px;padding:18px 20px;color:#eef1f8;font:600 14px/1.4 "Segoe UI",Inter,Arial,sans-serif}
  .aip h2{margin:0;font-size:24px}.aip .x{float:right;cursor:pointer;color:#9aa3b2;font-size:13px}
  .aip li{list-style:none;padding:9px 0;border-top:1px solid rgba(255,255,255,.1)}.aip ol{margin:10px 0 0;padding:0}
  .aip li i{font-style:normal;font-weight:800;font-size:11px;padding:1px 7px;border-radius:5px;color:#0a0c12;margin-left:6px}.aip .t{color:#7b8498;font-size:12px;margin-right:8px}`;
  document.head.appendChild(css.el = s);
}
function ensure() {
  if (root) return;
  css();
  card = document.createElement('div'); card.className = 'aic'; document.body.appendChild(card);
  panel = document.createElement('div'); panel.className = 'aip'; panel.innerHTML = '<div></div>'; document.body.appendChild(panel);
  panel.addEventListener('pointerdown', (e) => { if (e.target === panel || e.target.classList.contains('x')) closeHistory(); });
  root = true;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const li = (e) => `<li><span class="t">${agoShort(e.at)} ago</span>${esc(e.text)}${e.outcome ? `<i style="background:${outcomeColor(e.outcome)}">${esc(String(e.outcome).toUpperCase())}</i>` : ''}</li>`;

function headOf(p) {
  const ev = forAgent(p.agent || p.id, 1)[0];
  const c = p.pod ? { label: 'ANALYTICS POD', hex: '#9aa3b2' } : chip(ev || { provider: p.provider });
  return { ev, c };
}
function draw(p, n, full) {
  const { c } = headOf(p), list = forAgent(p.agent || p.id, n).reverse();
  const live = !p.pod && thinking(p.agent || p.id);
  const st = status(p.room);
  const head = p.pod
    ? `<b class="h" style="color:#9aa3b2">ANALYTICS POD · NOT A SEPARATE AI</b><h3>${esc(p.name)}</h3><div class="pod">Mirrors ${esc(p.mirrorName || p.agent)}${p.ruleBook ? ' (RULE BOOK)' : ''}: shows only that agent's real decisions.</div>`
    : `<b class="h">◉ ${c.label} · LIVE AI AGENT${live ? ' · THINKING…' : ''}</b><h3>${esc(p.name)}</h3><div class="r">${esc(p.role)}</div>`;
  const body = list.length ? `<ol>${list.map(li).join('')}</ol>` : `<div class="pod">${offline() ? 'AI FEED OFFLINE. Nothing is being shown rather than something invented.' : 'No decision recorded yet.'}${st.nextAt ? ` Next decision in ${countdown(st.nextAt)}.` : ''}</div>`;
  return { head, body, color: c.hex };
}

/** call every frame: shows the nearest person within 4 m on the same floor */
let lastDraw = 0, lastKey = '';
export function updateCards(player, now = performance.now()) {
  ensure();
  const fl = player?.floor?.id; let best = null, bd = RADIUS;
  if (fl && player.pos) for (const p of REG.values()) {
    if (p.floor !== fl || p.active === false || p.x == null) continue;
    const d = Math.hypot(p.x - player.pos.x, (p.z ?? 0) - player.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  current = best;
  if (!best || panel.style.display === 'flex') { card.style.display = 'none'; return; }
  const key = best.id + ':' + forAgent(best.agent || best.id, 1)[0]?.id + ':' + (thinking(best.agent || best.id) ? 1 : 0);
  if (key !== lastKey || now - lastDraw > 2000) {
    const { head, body, color } = draw(best, 5);
    card.style.setProperty('--c', color); card.innerHTML = `${head}${body}<div class="k">E — full decision history</div>`; lastKey = key; lastDraw = now;
  }
  card.style.display = 'block';
}
export const nearest = () => current;
/** staff = the viewer is the CEO or an admin: they get the executive note, visitors the read-only one */
export function openHistory(p = current, { staff = false } = {}) {
  ensure(); if (!p) return false;
  const { head, body, color } = draw(p, 40, true);
  panel.firstChild.style.setProperty('--c', color); panel.style.setProperty('--c', color);
  const note = staff
    ? 'Executive access. Every decision this agent made is below; call it up for a review from the Executive Console (Asset Protection tab).'
    : 'Read-only. Only the CEO and staff can talk to an agent.';
  panel.firstChild.innerHTML = `<span class="x">close · Esc</span>${head.replace('<h3>', '<h2>').replace('</h3>', '</h2>')}<div class="pod" style="margin-top:6px">${note}</div>${body}`;
  panel.style.display = 'flex'; document.exitPointerLock?.();
  return true;
}
export function closeHistory() { if (panel) panel.style.display = 'none'; }
export const historyOpen = () => panel?.style.display === 'flex';
addEventListener('keydown', (e) => { if (e.code === 'Escape' && historyOpen()) closeHistory(); });
