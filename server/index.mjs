// PROTOTYPE presence server: serves the built client (dist/) and relays player poses over /ws.
// One port for both, so a single Cloudflare tunnel exposes everything.
//   npm run build && node server/index.mjs      (PORT env, default 8787)
// Not authoritative yet: it trusts client poses (speed-clamped) — fine for a test, not for the real thing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TICK_HZ = 15, MAX_PLAYERS = 50, MAX_SPEED = 14; // m/s (sprint is 9; slack for lifts/teleports below)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(500).end('Run `npm run build` first.'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
const players = new Map(); // id -> { ws, name, role, x,y,z,yaw, floor, moving, t }
let nextId = 1;
const clean = (s, n) => String(s ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').slice(0, n).trim();

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) { ws.close(4000, 'full'); return; }
  const id = nextId++;
  const p = { ws, id, name: `Guest ${id}`, role: 'visitor', x: 0, y: 0, z: 0, yaw: 0, floor: null, moving: 0, t: 0, ready: false };
  players.set(id, p);
  ws.send(JSON.stringify({ t: 'welcome', id, count: players.size }));
  console.log(`+ ${id} (${players.size} online)`);

  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m.t === 'hello') { p.name = clean(m.name, 20) || p.name; p.role = clean(m.role, 12) || 'visitor'; return; }
    if (m.t === 'pose') {
      const now = Date.now(), dt = (now - p.t) / 1000;
      const nx = +m.x, ny = +m.y, nz = +m.z;
      if (![nx, ny, nz, +m.yaw].every(Number.isFinite)) return;
      // light sanity check: big jumps are allowed only when the floor changes (teleport / lift exit)
      const jump = Math.hypot(nx - p.x, nz - p.z);
      if (p.ready && m.floor === p.floor && dt > 0 && jump > MAX_SPEED * dt + 2) return;
      Object.assign(p, { x: nx, y: ny, z: nz, yaw: +m.yaw, floor: clean(m.floor, 10), moving: m.moving ? 1 : 0, role: clean(m.role, 12) || p.role, t: now, ready: true });
      return;
    }
    if (m.t === 'chat') {
      const text = String(m.text ?? '').slice(0, 200).trim();
      if (text) broadcast({ t: 'chat', id, name: p.name, text });
    }
  });
  ws.on('close', () => { players.delete(id); broadcast({ t: 'leave', id }); console.log(`- ${id} (${players.size} online)`); });
});

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s);
}

// Snapshot of everyone, 15x a second. Packed as arrays to keep frames small.
setInterval(() => {
  const list = [];
  for (const p of players.values()) if (p.ready) list.push([p.id, p.name, p.role, p.floor, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), p.moving]);
  broadcast({ t: 'snap', now: Date.now(), p: list });
}, 1000 / TICK_HZ);

server.listen(PORT, () => console.log(`presence server on http://localhost:${PORT}  (ws: /ws)`));
