// Client side of the presence hub (server/realtime/hub.js) over a WebSocket at /api/ws.
// Sends this player's pose ~10 Hz; receives snapshots of everyone, meta (tour / basket / arena
// sessions) and direct messages (teleport, basket, kicked, role, balance, toast).
import { getToken, startSession, onSignIn } from './api.js';

/** PC vs Mobile: a touch-first device (coarse pointer + touch points, or a mobile user agent) */
export function detectDevice() {
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini/i.test(ua) || navigator.userAgentData?.mobile === true;
  const touch = (navigator.maxTouchPoints || 0) > 0 && matchMedia?.('(pointer: coarse)').matches;
  return mobileUa || touch ? 'mobile' : 'pc';
}

export class Realtime {
  constructor() {
    this.ws = null; this.id = null; this.role = 'player'; this.elevated = false; this.connected = false;
    this.kicked = false; this.device = detectDevice();
    this.handlers = new Map(); this.pending = new Map(); this.rid = 0; this.retry = 1000;
    this.meta = { tour: { on: false }, baskets: {}, boxing: null, race: null, boxed: [] };
    this.players = []; // latest snapshot rows, decoded
    onSignIn(() => this.reconnect());
  }
  on(t, fn) { if (!this.handlers.has(t)) this.handlers.set(t, new Set()); this.handlers.get(t).add(fn); return () => this.handlers.get(t).delete(fn); }
  emit(t, m) { for (const fn of this.handlers.get(t) || []) { try { fn(m); } catch (e) { console.error(e); } } }

  async start() {
    if (!getToken()) { try { await startSession(); } catch { /* the api retries by itself */ } }
    this.open();
  }
  reconnect() { this.kicked = false; if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; } this.connected = false; this.open(); }
  open() {
    if (this.kicked) return;
    const token = getToken();
    if (!token) { setTimeout(() => this.open(), 1500); return; }
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`);
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', token, device: this.device })); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
    ws.onclose = (e) => {
      this.connected = false; this.ws = null; this.emit('status', { connected: false, code: e.code });
      if (this.kicked || e.code === 4003) return; // removed by an admin: stay out
      setTimeout(() => this.open(), this.retry); this.retry = Math.min(15000, this.retry * 1.6);
    };
  }
  handle(m) {
    switch (m.t) {
      case 'welcome':
        Object.assign(this, { id: m.id, role: m.role, elevated: m.elevated, connected: true, retry: 1000 });
        if (m.meta) this.meta = m.meta;
        this.emit('status', { connected: true }); this.emit('role', { role: m.role, elevated: m.elevated }); this.emit('meta', this.meta);
        break;
      case 'snap':
        this.players = m.p.map((r) => ({ id: r[0], name: r[1], role: r[2], device: r[3], x: r[4], y: r[5], z: r[6], yaw: r[7], floor: r[8], room: r[9], spd: r[10] }));
        this.emit('snap', { at: m.at, players: this.players, race: m.race });
        break;
      case 'meta': this.meta = m.meta; this.emit('meta', m.meta); break;
      case 'role': this.role = m.role; this.elevated = m.elevated; this.emit('role', m); break;
      case 'kicked': this.kicked = true; this.emit('kicked', m); break;
      case 'ack': { const p = this.pending.get(m.rid); if (p) { this.pending.delete(m.rid); m.ok ? p.resolve(m.data) : p.reject(new Error(m.error)); } break; }
      default: this.emit(m.t, m);
    }
  }
  send(t, data = {}) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t, ...data })); }
  /** request/response: resolves with the server's data, rejects with its message */
  ask(t, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) { reject(new Error('Not connected to the building server.')); return; }
      const rid = ++this.rid;
      this.pending.set(rid, { resolve, reject });
      this.ws.send(JSON.stringify({ t, rid, ...data }));
      setTimeout(() => { if (this.pending.has(rid)) { this.pending.delete(rid); reject(new Error('The server did not answer.')); } }, 8000);
    });
  }
  get isStaff() { return this.role === 'admin' || this.role === 'ceo'; }
}
