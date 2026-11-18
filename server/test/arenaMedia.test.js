import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApp } from '../app.js';
import { openDb } from '../db.js';
import { createArenaMedia, youtubeId, sniffVideo, parseH2H, cleanRow, H2H_TTL, MAX_UPLOAD } from '../football/arenaMedia.js';

const quiet = { log() {}, warn() {}, error() {} };
const tmp = () => mkdtempSync(join(tmpdir(), 'arena-media-'));
const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps the SQLite file open until exit */ } };
const MATCH = { id: 560645, utcDate: '2026-11-22T16:30:00Z', status: 'TIMED', competition: { code: 'PL', name: 'Premier League' }, homeTeam: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV' }, awayTeam: { id: 66, name: 'Manchester United FC', shortName: 'Man United', tla: 'MUN' } };
const H2H = { matches: [
  { utcDate: '2026-05-03T14:30:00Z', status: 'FINISHED', competition: { name: 'Premier League' }, homeTeam: { shortName: 'Man United' }, awayTeam: { shortName: 'Liverpool' }, score: { fullTime: { home: 3, away: 2 } } },
  { utcDate: '2025-10-19T15:30:00Z', status: 'FINISHED', competition: { name: 'Premier League' }, homeTeam: { shortName: 'Liverpool' }, awayTeam: { shortName: 'Man United' }, score: { fullTime: { home: 1, away: 2 } } },
  { utcDate: '2027-01-01T15:30:00Z', status: 'TIMED', competition: { name: 'Premier League' }, homeTeam: { shortName: 'Liverpool' }, awayTeam: { shortName: 'Man United' }, score: { fullTime: { home: null, away: null } } },
] };
function fakeFootball() {
  const f = { calls: 0, state: { source: 'football-data.org' }, matches: () => [MATCH], request: async (path) => { f.calls++; f.last = path; return H2H; } };
  return f;
}
const mp4 = (n) => { const b = Buffer.alloc(n, 7); b.write('ftypisom', 4, 'latin1'); return b; };

test('arena media: link parsing, container sniffing, row validation, provider parsing', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ']) assert.equal(youtubeId(u), 'dQw4w9WgXcQ', u);
  for (const u of ['https://vimeo.com/123', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', '']) assert.equal(youtubeId(u), null, u);
  assert.equal(sniffVideo(mp4(32)), 'mp4');
  assert.equal(sniffVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), 'webm');
  assert.equal(sniffVideo(Buffer.from('<html><script>…')), null);
  assert.throws(() => cleanRow({ date: '22/11/2026', hs: 1, as: 0, home: 'A', away: 'B' }), /YYYY-MM-DD/);
  assert.throws(() => cleanRow({ date: '2026-11-22', hs: -1, as: 0, home: 'A', away: 'B' }), /scores/);
  assert.throws(() => cleanRow({ date: '2026-11-22', hs: 1, as: 0, home: '', away: 'B' }), /club/);
  assert.equal(cleanRow({ date: '2026-11-22', hs: '2', as: '2', home: 'A', away: 'B' }).competition, 'Friendly');
  const rows = parseH2H(H2H);
  assert.equal(rows.length, 2, 'only finished meetings with a score');
  assert.deepEqual(rows[0], { date: '2026-05-03', competition: 'Premier League', home: 'Man United', away: 'Liverpool', hs: 3, as: 2, src: 'auto' });
});

test('arena media: head-to-head is cached (one provider call per fixture per 12 h) and survives a restart', async () => {
  const dir = tmp(), dbFile = join(dir, 'firm.db');
  let t = 1_000_000;
  const fb = fakeFootball();
  const m1 = createArenaMedia({ db: openDb(dbFile), football: fb, dir: join(dir, 'media'), log: quiet, now: () => t });
  const a = await m1.fetchH2H(MATCH.id);
  assert.equal(fb.calls, 1); assert.equal(a.cached, false); assert.equal(a.rows.length, 2);
  assert.equal(fb.last, `/matches/${MATCH.id}/head2head?limit=10`);
  const [b, c] = await Promise.all([m1.fetchH2H(MATCH.id), m1.fetchH2H(MATCH.id)]);
  assert.equal(fb.calls, 1, 'served from cache'); assert.ok(b.cached && c.cached);
  // a restart keeps the cache (kv table)
  const fb2 = fakeFootball();
  const m2 = createArenaMedia({ db: openDb(dbFile), football: fb2, dir: join(dir, 'media'), log: quiet, now: () => t });
  assert.equal((await m2.fetchH2H(MATCH.id)).cached, true); assert.equal(fb2.calls, 0);
  t += H2H_TTL + 1;
  assert.equal((await m2.fetchH2H(MATCH.id)).cached, false); assert.equal(fb2.calls, 1, 'expired entries are fetched again');
  // concurrent cold requests share one call
  const fb3 = fakeFootball();
  const m3 = createArenaMedia({ db: openDb(':memory:'), football: fb3, dir: join(dir, 'm3'), log: quiet });
  await Promise.all([m3.fetchH2H(MATCH.id), m3.fetchH2H(MATCH.id), m3.fetchH2H(MATCH.id)]);
  assert.equal(fb3.calls, 1, 'in-flight requests are de-duplicated');
  // the provider's budget refusal reads as a pacing message; simulated feeds never call out
  const busy = { ...fakeFootball(), request: async () => { throw Object.assign(new Error('local request budget reached'), { status: 429 }); } };
  const m4 = createArenaMedia({ db: openDb(':memory:'), football: busy, dir: join(dir, 'm4'), log: quiet });
  await assert.rejects(m4.fetchH2H(1), /pacing itself/);
  const sim = createArenaMedia({ db: openDb(':memory:'), football: { ...fakeFootball(), state: { source: 'simulated' } }, dir: join(dir, 'm5'), log: quiet });
  await assert.rejects(sim.fetchH2H(MATCH.id), /by hand/);
  cleanup(dir);
});

test('arena media: settings, edits and uploads persist across a server restart; clear removes files', async () => {
  const dir = tmp(), dbFile = join(dir, 'firm.db'), mdir = join(dir, 'media');
  const yt = { blocked: new Set(['BlockedClip']) };
  const fetchImpl = async (u) => { const id = new URL(new URL(u).searchParams.get('url')).searchParams.get('v'); return yt.blocked.has(id) ? { ok: false, status: 401 } : { ok: true, status: 200, json: async () => ({ title: 'Official clip' }) }; };
  const m1 = createArenaMedia({ db: openDb(dbFile), football: fakeFootball(), dir: mdir, log: quiet, fetchImpl });
  const seen = []; m1.onChange((v) => seen.push(v));
  await m1.autoFill(MATCH.id, 'admin:Ana');
  m1.setH2H(MATCH.id, [...m1.view().fixtures[MATCH.id].h2h, { date: '2019-01-01', competition: 'FA Cup', home: 'Liverpool', away: 'Man United', hs: 4, as: 0 }], 'admin:Ana');
  await m1.addYoutube(MATCH.id, 'https://youtu.be/dQw4w9WgXcQ', 'Classic meeting', 'admin:Ana');
  await assert.rejects(m1.addYoutube(MATCH.id, 'dQw4w9WgXcQ', '', 'admin:Ana'), /already attached/);
  await assert.rejects(m1.addYoutube(MATCH.id, 'https://youtu.be/BlockedClip', '', 'admin:Ana'), /does not allow it to be shown outside YouTube/, 'clips with embedding switched off are refused');
  assert.equal((await m1.addYoutube(MATCH.id, 'https://youtu.be/xxxxxxxxxxx', '', 'admin:Ana')).title, 'Official clip', 'the title comes from oEmbed');
  m1.removeVideo(MATCH.id, m1.view().fixtures[MATCH.id].videos.find((v) => v.yt === 'xxxxxxxxxxx').id, 'admin:Ana');
  const up = await m1.upload(MATCH.id, Readable.from([mp4(4096), Buffer.alloc(4096, 1)]), { title: 'Goals', length: 8192, by: 'ceo:Bo' });
  assert.equal(up.kind, 'file'); assert.equal(up.size, 8192);
  await assert.rejects(m1.upload(MATCH.id, Readable.from([Buffer.from('<html>not a video at all</html>')]), { title: 'x', by: 'ceo:Bo' }), /mp4 or webm/);
  await assert.rejects(m1.upload(MATCH.id, Readable.from([mp4(64)]), { title: 'big', length: MAX_UPLOAD + 1, by: 'ceo:Bo' }), /limited/);
  assert.equal(readdirSync(mdir).filter((n) => n.endsWith('.mp4')).length, 1, 'rejected uploads leave nothing behind');
  assert.ok(!readdirSync(mdir).some((n) => n.endsWith('.part')));
  assert.ok(seen.length >= 4, 'every change is pushed to listeners (the hub broadcast)');
  // restart
  const m2 = createArenaMedia({ db: openDb(dbFile), football: fakeFootball(), dir: mdir, offline: true, log: quiet });
  const f = m2.view().fixtures[MATCH.id];
  assert.equal(m2.view().onScreens, MATCH.id, 'the first fixture with media goes on the screens');
  assert.equal(f.h2h.length, 3); assert.equal(f.h2h[2].competition, 'FA Cup');
  assert.deepEqual(f.videos.map((v) => v.kind), ['youtube', 'file']);
  assert.match(f.videos[1].src, /^\/api\/arena-media\/file\/[a-f0-9]{16}\.mp4$/);
  assert.equal(f.videos[0].thumb, '/api/arena-media/thumb/dQw4w9WgXcQ');
  assert.ok(m2.view().audit.some((a) => /uploaded highlights "Goals"/.test(a.what) && a.by === 'ceo:Bo'));
  m2.show(null, 'admin:Ana'); assert.equal(m2.view().onScreens, null);
  m2.clear(MATCH.id, 'admin:Ana');
  assert.equal(m2.view().fixtures[MATCH.id], undefined);
  assert.equal(readdirSync(mdir).filter((n) => n.endsWith('.mp4')).length, 0, 'clearing deletes the uploaded file');
  assert.throws(() => m2.show(MATCH.id, 'admin:Ana'), /Attach/);
  cleanup(dir);
});

function client(app, name) {
  const { token, player } = app.auth.register(name, 'pw-' + name);
  const inbox = [];
  const c = app.hub.connect({ send: (m) => inbox.push(typeof m === 'string' ? JSON.parse(m) : m), close: () => {} });
  let rid = 0;
  app.hub.message(c, JSON.stringify({ t: 'hello', token }));
  const ask = async (m) => { const id = ++rid; app.hub.message(c, JSON.stringify({ ...m, rid: id })); for (let i = 0; i < 50; i++) { const a = inbox.find((x) => x.t === 'ack' && x.rid === id); if (a) return a; await new Promise((r) => setTimeout(r, 5)); } return null; };
  return { c, token, player, inbox, ask };
}

test('arena media: every write is staff-only on the hub and over HTTP; changes reach every client live', async () => {
  const dir = tmp();
  const app = createApp({ dbFile: ':memory:', mediaDir: join(dir, 'media'), startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, adminPassword: 'sesame', maxPlayers: 50 }, quiet);
  app.football._setMatches([MATCH]);
  const guest = client(app, 'Guest'), boss = client(app, 'Boss');
  for (const op of [{ t: 'mediaSetH2H', matchId: MATCH.id, rows: [] }, { t: 'mediaAddYoutube', matchId: MATCH.id, url: 'dQw4w9WgXcQ' }, { t: 'mediaClear', matchId: MATCH.id }, { t: 'mediaShow', matchId: null }, { t: 'mediaFetchH2H', matchId: MATCH.id }, { t: 'mediaRemoveVideo', matchId: MATCH.id, videoId: 'x' }]) {
    const a = await guest.ask(op);
    assert.equal(a.ok, false, op.t); assert.match(a.error, /Executive clearance/, op.t);
  }
  assert.deepEqual(app.media.view().fixtures, {}, 'nothing changed');
  assert.equal((await boss.ask({ t: 'elevate', password: 'sesame', role: 'admin' })).ok, true);
  const set = await boss.ask({ t: 'mediaSetH2H', matchId: MATCH.id, rows: [{ date: '2025-10-19', competition: 'Premier League', home: 'Liverpool', away: 'Man United', hs: 1, as: 2 }] });
  assert.equal(set.ok, true); assert.equal(set.data.rows.length, 1);
  const bad = await boss.ask({ t: 'mediaSetH2H', matchId: MATCH.id, rows: [{ date: 'yesterday' }] });
  assert.equal(bad.ok, false); assert.match(bad.error, /YYYY-MM-DD/);
  const yt = await boss.ask({ t: 'mediaAddYoutube', matchId: MATCH.id, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Highlights' });
  assert.equal(yt.ok, true, 'async ops are acknowledged when they finish');
  const push = [...guest.inbox].reverse().find((m) => m.t === 'arenaMedia');
  assert.ok(push, 'guests receive the live update'); assert.equal(push.media.fixtures[MATCH.id].videos[0].yt, 'dQw4w9WgXcQ');
  assert.equal(push.media.onScreens, MATCH.id);

  // HTTP upload: a guest is refused, staff are accepted, the file streams back with Range support
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (token, body) => fetch(`${base}/api/arena-media/upload?match=${MATCH.id}&title=Goals`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' }, body });
  const r1 = await post(guest.token, mp4(2048));
  assert.equal(r1.status, 403);
  const r0 = await fetch(`${base}/api/arena-media/upload?match=${MATCH.id}`, { method: 'POST', body: mp4(64) });
  assert.equal(r0.status, 401);
  const r2 = await post(boss.token, mp4(2048));
  assert.equal(r2.status, 200);
  const v = (await r2.json()).video;
  const r3 = await fetch(`${base}/api/arena-media/file/${v.file}`, { headers: { Range: 'bytes=0-11' } });
  assert.equal(r3.status, 206); assert.equal(r3.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await r3.arrayBuffer()).toString('latin1', 4, 8), 'ftyp');
  assert.equal((await fetch(`${base}/api/arena-media/file/..%2Ffirm.db`)).status, 404);
  const state = await (await fetch(`${base}/api/arena-media`)).json();
  assert.equal(state.fixtures[MATCH.id].videos.length, 2);
  await new Promise((r) => app.server.close(r));
  // dropping back to a guest removes the clearance immediately
  await boss.ask({ t: 'role', role: 'player' });
  assert.equal((await boss.ask({ t: 'mediaClear', matchId: MATCH.id })).ok, false);
  assert.ok(existsSync(join(dir, 'media')));
  cleanup(dir);
});

test('arena media: after a redeploy wipes the disk, uploaded clips with no file are dropped (YouTube clips stay)', async () => {
  const dir = tmp(), dbFile = join(dir, 'firm.db'), mdir = join(dir, 'media');
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ title: 'Official clip' }) });
  const m1 = createArenaMedia({ db: openDb(dbFile), football: fakeFootball(), dir: mdir, log: quiet, fetchImpl });
  await m1.addYoutube(MATCH.id, 'https://youtu.be/dQw4w9WgXcQ', 'Classic meeting', 'admin:Ana');
  await m1.upload(MATCH.id, Readable.from([mp4(4096), Buffer.alloc(4096, 1)]), { title: 'Goals', length: 8192, by: 'ceo:Bo' });
  assert.equal(m1.view().fixtures[MATCH.id].videos.length, 2);
  for (const n of readdirSync(mdir)) rmSync(join(mdir, n)); // the host wiped the disk; the database still lists the clip
  const m2 = createArenaMedia({ db: openDb(dbFile), football: fakeFootball(), dir: mdir, offline: true, log: quiet });
  const v = m2.view();
  assert.deepEqual(v.fixtures[MATCH.id].videos.map((x) => x.kind), ['youtube'], 'the missing upload is no longer advertised');
  assert.ok(v.audit.some((a) => a.by === 'system' && /no longer on the server/.test(a.what)), 'and the audit log says so');
  cleanup(dir);
});
