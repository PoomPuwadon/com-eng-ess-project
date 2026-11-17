// WebSocket transport for the presence hub, on the game server's HTTP port at /api/ws
// (Vite proxies it in dev). Messages are JSON; the hub's snapshot frames arrive pre-serialised.
import { WebSocketServer } from 'ws';
import { SNAPSHOT_HZ } from './hub.js';

export function attachWs(server, hub, log = console) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/api/ws')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    const c = hub.connect({
      send: (m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); },
      close: (code, reason) => { try { ws.close(code, reason); } catch { /* already closed */ } },
    }, { ip: req.socket.remoteAddress });
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => hub.message(c, data.toString()));
    ws.on('close', () => hub.disconnect(c));
    ws.on('error', (e) => log.warn?.('[ws]', e.message));
  });
  const tick = setInterval(() => { try { hub.tick(); } catch (e) { log.warn?.('[hub tick]', e.message); } }, 1000 / SNAPSHOT_HZ);
  const ping = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20_000);
  return { wss, stop: () => { clearInterval(tick); clearInterval(ping); for (const ws of wss.clients) ws.terminate(); wss.close(); } };
}
