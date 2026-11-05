import { FLOOR_BY_ID, FLOOR_LIST, ROLES, ROLE_LABELS, BANKS, CARS, clusterOf } from './layout/building.js';
import { rideCheck } from './elevators.js';

const TOWER_NAME = { OT: 'Office Tower', VT: 'Wellness Tower (Visitors)', L0: 'Grand Lobby', B1: 'Basement', BRIDGE: 'The Link (Glass Bridge)' };
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor({ onTeleportFloor, onRole, onRide }) {
    this.onTeleportFloor = onTeleportFloor;
    this.onRide = onRide;
    this.onRole = onRole;
    this.mm = $('minimap').getContext('2d');
    this.buildFloorList();
    this.buildRoles();
    this.toastTimer = 0;
    $('help-btn').onclick = () => $('help').classList.toggle('hidden');
  }

  buildFloorList() {
    const el = $('floors');
    const col = (title, ids) => {
      const c = document.createElement('div');
      c.className = 'fcol';
      c.innerHTML = `<div class="ftitle">${title}</div>`;
      for (const id of ids) {
        const b = document.createElement('button');
        b.className = 'fbtn';
        b.dataset.floor = id;
        b.innerHTML = `<b>${id}</b> ${FLOOR_BY_ID[id].short}`;
        b.title = `Review teleport: ${FLOOR_BY_ID[id].sign}`;
        b.onclick = (e) => { e.stopPropagation(); this.onTeleportFloor(id); };
        c.appendChild(b);
      }
      return c;
    };
    el.append(col('Office', FLOOR_LIST.OT), col('Shared', FLOOR_LIST.shared), col('Wellness', FLOOR_LIST.VT));
  }

  buildRoles() {
    const el = $('roles');
    ROLES.forEach((r, i) => {
      const b = document.createElement('button');
      b.dataset.role = r;
      b.textContent = `${i + 1} ${ROLE_LABELS[r]}`;
      b.onclick = (e) => { e.stopPropagation(); this.onRole(r); };
      el.appendChild(b);
    });
  }

  setRole(role) {
    for (const b of document.querySelectorAll('#roles button')) b.classList.toggle('on', b.dataset.role === role);
  }

  toast(msg, secs = 3) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), secs * 1000);
  }

  prompt(text) { const p = $('prompt'); p.textContent = text || ''; p.classList.toggle('hidden', !text); }

  // Destination dispatch kiosk (at a landing) or the in-car panel.
  openElevator(bank, fromFloor, role, { car = null } = {}) {
    const panel = $('elevator');
    const b = BANKS[bank];
    panel.innerHTML = `<h3>${car ? `Car ${car.label}` : b.name}</h3><div class="sub">${car ? 'Select your floor' : `${b.label} · select your destination, a car will be assigned`} · Esc to close</div>`;
    const list = document.createElement('div');
    list.className = 'stops';
    for (const stop of [...b.stops].reverse()) {
      const chk = rideCheck(role, bank, stop, fromFloor);
      const btn = document.createElement('button');
      btn.innerHTML = `<b>${stop}</b> ${FLOOR_BY_ID[stop].sign}${chk.ok ? '' : `<span class="lock">🔒 ${stop === fromFloor ? 'You are here' : chk.reason}</span>`}`;
      btn.disabled = !chk.ok;
      if (stop === fromFloor) btn.classList.add('here');
      btn.onclick = () => { this.closeElevator(); this.onRide(bank, stop, car); };
      list.appendChild(btn);
    }
    panel.appendChild(list);
    panel.classList.remove('hidden');
    this.elevatorOpen = true;
  }

  closeElevator() { $('elevator').classList.add('hidden'); this.elevatorOpen = false; }

  fade(on) { $('fade').classList.toggle('on', on); }

  update(player, perf, ui) {
    const f = player.floor;
    if (!f) return;
    $('loc-tower').textContent = TOWER_NAME[f.tower];
    $('loc-floor').textContent = `${f.id} · ${f.sign}`;
    $('loc-room').textContent = ui && ui.car ? `In lift ${ui.car.label} · ${ui.car.at || `${ui.car.y.toFixed(0)} m`}` : player.room ? player.room.sign : '—';
    $('loc-role').textContent = ROLE_LABELS[player.role];
    for (const b of document.querySelectorAll('.fbtn')) b.classList.toggle('on', b.dataset.floor === f.id);
    if (perf) $('perf').textContent = `${perf.fps.toFixed(0)} fps · 1% low ${perf.fps1Low.toFixed(0)} · ${perf.drawCalls} calls · ${(perf.triangles / 1000).toFixed(0)}k tris`;
    this.drawMinimap(player);
  }

  drawMinimap(player) {
    const g = this.mm;
    const W = g.canvas.width, H = g.canvas.height;
    const ids = clusterOf(player.floor.id);
    const floors = ids.map((id) => FLOOR_BY_ID[id]);
    const bx0 = Math.min(...floors.map((f) => f.bounds.x0)), bx1 = Math.max(...floors.map((f) => f.bounds.x1));
    const bz0 = Math.min(...floors.map((f) => f.bounds.z0)), bz1 = Math.max(...floors.map((f) => f.bounds.z1));
    const s = Math.min((W - 16) / (bx1 - bx0), (H - 16) / (bz1 - bz0));
    const ox = (W - (bx1 - bx0) * s) / 2, oz = (H - (bz1 - bz0) * s) / 2;
    const X = (x) => ox + (x - bx0) * s, Z = (z) => oz + (z - bz0) * s;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,12,18,0.82)'; g.fillRect(0, 0, W, H);
    for (const f of floors) {
      g.fillStyle = f.id === player.floor.id ? '#3b4252' : '#2a2f3a';
      g.fillRect(X(f.bounds.x0), Z(f.bounds.z0), (f.bounds.x1 - f.bounds.x0) * s, (f.bounds.z1 - f.bounds.z0) * s);
      for (const r of f.rooms) {
        if (r.full) continue;
        const here = player.room && player.room.id === r.id;
        g.strokeStyle = here ? '#ffd34d' : r.zone ? '#6a7389' : '#c9cfdb';
        g.lineWidth = here ? 2 : 1;
        g.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
      }
      for (const e of f.elevators) { g.fillStyle = '#ffd34d'; g.fillRect(X(e.x0), Z(e.z0), Math.max(2, (e.x1 - e.x0) * s), Math.max(2, (e.z1 - e.z0) * s)); }
    }
    // lift shafts (all cars whose shaft is within view)
    for (const c of CARS) {
      if (c.x1 < bx0 - 1 || c.x0 > bx1 + 1) continue;
      g.fillStyle = '#111'; g.fillRect(X(c.x0), Z(c.z0), (c.x1 - c.x0) * s, (c.z1 - c.z0) * s);
    }
    // player arrow
    const px = X(player.pos.x), pz = Z(player.pos.z);
    g.save(); g.translate(px, pz); g.rotate(-player.yaw);
    g.fillStyle = '#ff4d5e';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.font = '11px sans-serif';
    g.fillText(`${player.floor.id} — ${player.room ? player.room.short : player.floor.short}`, 8, H - 8);
  }
}
