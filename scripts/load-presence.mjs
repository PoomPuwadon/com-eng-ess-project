// Presence load test: fills the building up to N players (default 50) against a running dev server,
// then reports the server count, the capacity refusal, snapshot rate and size. Usage: node scripts/load-presence.mjs [N] [seconds]
// 50-player presence load test against the running dev server

const base = 'http://localhost:8787';
const N = Number(process.argv[2] || 50);
const socks = [];
const existing = await (await fetch(base + '/api/presence')).json();
const want = N - existing.players;
let snaps = 0, bytes = 0, refused = null;
for (let i = 0; i <= want; i++) {
  const s = await (await fetch(base + '/api/session', { method: 'POST', body: '{}' })).json();
  const ws = new WebSocket('ws://localhost:8787/api/ws');
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const d = e.data; const m = JSON.parse(d); if (m.t === 'snap') { snaps++; bytes += d.length; } if (m.t === 'error') refused = m.text; });
  ws.send(JSON.stringify({ t: 'hello', token: s.token, device: i % 3 ? 'pc' : 'mobile' }));
  socks.push(ws);
}
const t0 = Date.now();
const iv = setInterval(() => socks.forEach((ws, i) => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'pose', f: 'L0', x: -10 + (i % 8) * 2.5 + Math.sin(Date.now() / 1000 + i), y: 0, z: 8 + Math.floor(i / 8) * 2.5, yaw: 0, s: 3 }))), 100);
await new Promise((r) => setTimeout(r, Number(process.argv[3] || 5) * 1000));
clearInterval(iv);
const p = await (await fetch(base + '/api/presence')).json();
console.log({ connectedOnServer: p.players, attempted: want + 1, refusedMessage: refused, snapsPerSecPerClient: +(snaps / socks.length / ((Date.now() - t0) / 1000)).toFixed(1), avgSnapBytes: Math.round(bytes / Math.max(1, snaps)) });
socks.forEach((ws) => ws.close());
process.exit(0);
