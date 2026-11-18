// VT-02 Arena Media: staff attach previous head-to-head results and highlight videos to a fixture, and
// the Sports Analytics Arena shows them on its side screens next to the pricing screens.
//
// - Head-to-head: auto-filled from football-data.org's free `/v4/matches/{id}/head2head` endpoint through
//   the football service's shared request budget (6 of the free tier's 10 calls a minute), cached 12 h per
//   fixture in the kv table; staff can then edit, add or delete rows by hand (date, competition, score).
// - Highlights: a YouTube link (stored as its 11-character video id; played in a YouTube embed, never
//   drawn into WebGL, which cross-origin video cannot be) or an uploaded mp4/webm stored under
//   data/arena-media/ (gitignored) and streamed from the game server with HTTP Range support.
// - Everything persists in the kv table (`arena:media:v1`) and is pushed to every client via the hub.
//   Every write is staff-only (Admin or Chief Executive), checked on the server, and lands in an audit list.
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync, readdirSync, createReadStream, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const KEY = 'arena:media:v1', H2H_KEY = 'arena:h2h:v1';
export const H2H_TTL = 12 * 3600_000;
export const MAX_UPLOAD = 80 * 1024 * 1024; // per file
export const MAX_STORE = 1024 * 1024 * 1024; // all uploads together
export const MAX_VIDEOS = 8, MAX_ROWS = 20;
const FILE_RE = /^[a-f0-9]{16}\.(mp4|webm)$/;
const err = (status, message) => Object.assign(new Error(message), { status });
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/** a YouTube watch / share / shorts / embed link (or a bare id) -> its 11-character id, else null */
export function youtubeId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/); if (m) id = m[2]; }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** first bytes of an upload -> 'mp4' | 'webm' | null (never trust the file name or Content-Type alone) */
export function sniffVideo(buf) {
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return null;
}

/** one head-to-head row from staff input; throws a 400 with a readable message */
export function cleanRow(r, i = 0) {
  const date = clip(r?.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw err(400, `Row ${i + 1}: date must be YYYY-MM-DD.`);
  const hs = Number(r?.hs), as = Number(r?.as);
  if (![hs, as].every((v) => Number.isInteger(v) && v >= 0 && v <= 30)) throw err(400, `Row ${i + 1}: scores must be whole numbers from 0 to 30.`);
  const home = clip(r?.home, 40), away = clip(r?.away, 40);
  if (!home || !away) throw err(400, `Row ${i + 1}: both club names are needed.`);
  return { date, competition: clip(r?.competition, 40) || 'Friendly', home, away, hs, as, src: r?.src === 'auto' ? 'auto' : 'manual' };
}

/** football-data.org head2head response -> rows (finished matches with a full-time score), newest first */
export function parseH2H(j) {
  return (j?.matches || []).filter((m) => m.status === 'FINISHED' && m.score?.fullTime?.home != null && m.score?.fullTime?.away != null)
    .map((m) => ({ date: String(m.utcDate).slice(0, 10), competition: clip(m.competition?.name, 40) || '—', home: clip(m.homeTeam?.shortName || m.homeTeam?.name, 40), away: clip(m.awayTeam?.shortName || m.awayTeam?.name, 40), hs: m.score.fullTime.home, as: m.score.fullTime.away, src: 'auto' }))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ROWS);
}

export function createArenaMedia({ db, football, dir, blobs = null, offline = false, log = console, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  mkdirSync(dir, { recursive: true });
  const state = db.kvGet(KEY, { fixtures: {}, onScreens: null, audit: [], v: 1 });
  const h2hCache = db.kvGet(H2H_KEY, {}); // matchId -> { at, rows }
  const inflight = new Map();
  const listeners = new Set();
  const thumbs = new Map();

  // Uploads live on this server's disk; on a host with an ephemeral disk (a redeploy wipes it) the saved list
  // would still name clips whose files are gone, and every viewer's screen went black. Drop such entries.
  let restored = !blobs; // with a durable blob store, files are restored from it first; only then is anything 'missing'
  function pruneMissing() {
    if (!restored) return 0;
    let n = 0;
    for (const f of Object.values(state.fixtures)) {
      const keep = f.videos.filter((v) => v.kind !== 'file' || existsSync(join(dir, v.file)));
      if (keep.length !== f.videos.length) { n += f.videos.length - keep.length; f.videos = keep; }
    }
    if (n) { state.audit.unshift({ at: now(), by: 'system', what: `dropped ${n} uploaded highlight(s) whose file is no longer on the server` }); state.audit.length = Math.min(state.audit.length, 40); db.kvSet(KEY, state); log.warn?.(`[media] dropped ${n} uploaded highlight(s) with no file on disk`); }
    return n;
  }
  const save = () => db.kvSet(KEY, state);
  const changed = () => { save(); const v = view(); for (const fn of listeners) { try { fn(v); } catch (e) { log.warn?.('[media]', e.message); } } };
  const audit = (by, what) => { state.audit.unshift({ at: now(), by, what }); state.audit.length = Math.min(state.audit.length, 40); };
  const matchOf = (id) => football?.matches?.().find((m) => m.id === Number(id)) || null;
  const label = (id) => { const m = matchOf(id); return m ? `${m.homeTeam.shortName || m.homeTeam.name} v ${m.awayTeam.shortName || m.awayTeam.name}` : `fixture ${id}`; };
  function entry(matchId, create = true) {
    const id = Number(matchId);
    if (!Number.isSafeInteger(id) || id <= 0) throw err(400, 'Choose a fixture first.');
    if (!state.fixtures[id] && create) {
      const m = matchOf(id);
      state.fixtures[id] = { matchId: id, label: label(id), home: m?.homeTeam || null, away: m?.awayTeam || null, competition: m?.competition?.name || null, utcDate: m?.utcDate || null, h2h: [], videos: [], updatedAt: now(), updatedBy: null };
    }
    return state.fixtures[id] || null;
  }
  const touch = (f, by) => { f.updatedAt = now(); f.updatedBy = by; if (state.onScreens == null) state.onScreens = f.matchId; };
  const empty = (f) => !f.h2h.length && !f.videos.length;

  /** boot: copy every stored upload that is not on disk back from the durable store, drop orphans, then prune */
  async function restore() {
    if (blobs) {
      try {
        const keep = new Set(Object.values(state.fixtures).flatMap((f) => f.videos.filter((v) => v.kind === 'file').map((v) => v.file)));
        for (const name of await blobs.names()) {
          if (!FILE_RE.test(name)) continue;
          if (!keep.has(name)) { await blobs.del(name).catch(() => {}); continue; } // orphan: its highlight was removed
          if (existsSync(join(dir, name))) continue;
          const data = await blobs.get(name);
          if (data) writeFileSync(join(dir, name), data);
        }
      } catch (e) { log.warn?.('[media] could not restore uploads from the durable store:', e.message); }
      restored = true;
    }
    if (pruneMissing()) changed();
    return view();
  }
  if (!blobs) pruneMissing();

  // ---------------------------------------------------------------- head-to-head
  /** fetch (or serve from cache) the provider's previous meetings for a fixture; does not save them */
  async function fetchH2H(matchId) {
    const id = Number(matchId);
    const hit = h2hCache[id];
    if (hit && now() - hit.at < H2H_TTL) return { rows: hit.rows, cached: true, at: hit.at };
    if (offline || football?.state?.source !== 'football-data.org' || !football.request) throw err(409, 'Auto-fill needs the live football-data.org feed. Add the meetings by hand instead.');
    if (id >= 900000 && id < 900100) throw err(409, 'This is a simulated fixture: add the meetings by hand.');
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      try {
        const j = await football.request(`/matches/${id}/head2head?limit=10`);
        const rows = parseH2H(j);
        h2hCache[id] = { at: now(), rows };
        for (const k of Object.keys(h2hCache)) if (now() - h2hCache[k].at > 7 * 86400_000) delete h2hCache[k];
        db.kvSet(H2H_KEY, h2hCache);
        return { rows, cached: false, at: h2hCache[id].at };
      } catch (e) {
        if (e.status === 429) throw err(429, 'The data feed is pacing itself (free tier: 10 calls a minute). Try again in a minute.');
        if (e.status === 403) throw err(409, 'That competition is outside the free data tier. Add the meetings by hand.');
        throw err(502, 'The data feed did not answer. Add the meetings by hand or try again shortly.');
      } finally { inflight.delete(id); }
    })();
    inflight.set(id, p);
    return p;
  }
  async function autoFill(matchId, by) {
    const out = await fetchH2H(matchId);
    const f = entry(matchId);
    const manual = f.h2h.filter((r) => r.src === 'manual');
    const key = (r) => `${r.date}|${r.home}|${r.away}`;
    const auto = out.rows.filter((r) => !manual.some((m) => key(m) === key(r)));
    f.h2h = [...manual, ...auto].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ROWS);
    touch(f, by); audit(by, `auto-filled ${auto.length} head-to-head result(s) for ${f.label}${out.cached ? ' (cached)' : ''}`);
    changed();
    return { rows: f.h2h, fetched: out.rows.length, cached: out.cached };
  }
  function setH2H(matchId, rows, by) {
    if (!Array.isArray(rows)) throw err(400, 'Rows must be a list.');
    if (rows.length > MAX_ROWS) throw err(400, `At most ${MAX_ROWS} head-to-head results per fixture.`);
    const clean = rows.map(cleanRow).sort((a, b) => b.date.localeCompare(a.date));
    const f = entry(matchId);
    f.h2h = clean; touch(f, by); audit(by, `saved ${clean.length} head-to-head result(s) for ${f.label}`);
    changed();
    return { rows: f.h2h };
  }

  // ---------------------------------------------------------------- highlights
  const vid = () => randomBytes(8).toString('hex');
  /** YouTube's free oEmbed endpoint: the clip's title, and whether its owner allows embedding at all.
   *  401/403 = embedding disabled or private (the screens would only say "Video unavailable"); 404 = gone. */
  async function oembed(ytId) {
    if (offline) return { ok: true, title: null };
    try {
      const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 401 || r.status === 403) return { ok: false, why: 'The owner of that clip does not allow it to be shown outside YouTube (embedding is switched off), so the Arena screens could only say "Video unavailable". Pick another clip, or upload the video file instead.' };
      if (r.status === 404 || r.status === 400) return { ok: false, why: 'YouTube says that clip does not exist (or is private).' };
      if (!r.ok) return { ok: true, title: null };
      return { ok: true, title: clip((await r.json()).title, 90) || null };
    } catch { return { ok: true, title: null }; } // YouTube unreachable: accept, the embed will tell
  }
  async function addYoutube(matchId, url, title, by) {
    const yt = youtubeId(url);
    if (!yt) throw err(400, 'That does not look like a YouTube link.');
    const f = entry(matchId);
    if (f.videos.length >= MAX_VIDEOS) throw err(409, `At most ${MAX_VIDEOS} highlights per fixture. Remove one first.`);
    if (f.videos.some((v) => v.yt === yt)) throw err(409, 'That clip is already attached.');
    const oe = await oembed(yt);
    if (!oe.ok) throw err(422, oe.why);
    const t = clip(title, 90) || oe.title || 'Match highlights';
    const v = { id: vid(), kind: 'youtube', yt, title: t, at: now(), by };
    f.videos.push(v); touch(f, by); audit(by, `added YouTube highlights "${t}" to ${f.label}`);
    changed();
    return v;
  }
  const storeBytes = () => readdirSync(dir).filter((n) => FILE_RE.test(n)).reduce((s, n) => s + statSync(join(dir, n)).size, 0);

  /** stream an upload (req is a readable) to disk; checks size while streaming and sniffs the container */
  function upload(matchId, req, { title, length, by }) {
    const f = entry(matchId);
    if (f.videos.length >= MAX_VIDEOS) return Promise.reject(err(409, `At most ${MAX_VIDEOS} highlights per fixture. Remove one first.`));
    if (length > MAX_UPLOAD) return Promise.reject(err(413, `Uploads are limited to ${MAX_UPLOAD / 1024 / 1024} MB.`));
    if (storeBytes() + (length || 0) > MAX_STORE) return Promise.reject(err(507, 'The media store is full. Remove older highlights first.'));
    const id = vid(), tmp = join(dir, `${id}.part`);
    return new Promise((resolve, reject) => {
      let size = 0, head = Buffer.alloc(0), kind = null, out = null, done = false;
      const fail = (e) => { if (done) return; done = true; req.unpipe?.(); req.resume?.(); out?.destroy(); try { unlinkSync(tmp); } catch { /* not written */ } reject(e); };
      req.on('data', (chunk) => {
        if (done) return;
        size += chunk.length;
        if (size > MAX_UPLOAD) { fail(err(413, `Uploads are limited to ${MAX_UPLOAD / 1024 / 1024} MB.`)); return; }
        if (!out) {
          head = Buffer.concat([head, chunk]);
          if (head.length < 12 && size < 12) return;
          kind = sniffVideo(head);
          if (!kind) { fail(err(415, 'Only mp4 or webm video files are accepted.')); return; }
          out = createWriteStream(tmp); out.on('error', fail); out.write(head);
          return;
        }
        if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }
      });
      req.on('error', fail);
      req.on('aborted', () => fail(err(400, 'Upload interrupted.')));
      req.on('end', () => {
        if (done) return;
        if (!out) { fail(err(415, 'Only mp4 or webm video files are accepted.')); return; }
        out.end(() => {
          if (done) return;
          const name = `${id}.${kind}`;
          try { renameSync(tmp, join(dir, name)); } catch (e) { fail(e); return; }
          done = true;
          const g = entry(matchId);
          if (g.videos.length >= MAX_VIDEOS) { try { unlinkSync(join(dir, name)); } catch { /* gone */ } reject(err(409, `At most ${MAX_VIDEOS} highlights per fixture.`)); return; }
          const v = { id, kind: 'file', file: name, mime: kind === 'mp4' ? 'video/mp4' : 'video/webm', size, title: clip(title, 90) || 'Match highlights', at: now(), by };
          const finish = () => {
            g.videos.push(v); touch(g, by); audit(by, `uploaded highlights "${v.title}" (${(size / 1024 / 1024).toFixed(1)} MB) to ${g.label}`);
            changed();
            resolve(v);
          };
          if (blobs) blobs.put(name, v.mime, readFileSync(join(dir, name))).catch((e) => log.warn?.('[media] upload kept on disk only (durable store failed):', e.message)).finally(finish);
          else finish();
        });
      });
    });
  }
  function removeVideo(matchId, videoId, by) {
    const f = entry(matchId, false);
    const v = f?.videos.find((x) => x.id === videoId);
    if (!v) throw err(404, 'That highlight is no longer attached.');
    f.videos = f.videos.filter((x) => x !== v);
    if (v.kind === 'file') dropFile(v.file);
    touch(f, by); audit(by, `removed highlights "${v.title}" from ${f.label}`);
    changed();
    return { removed: v.id };
  }
  function dropFile(name) { if (FILE_RE.test(name) && !Object.values(state.fixtures).some((f) => f.videos.some((v) => v.file === name))) { try { unlinkSync(join(dir, name)); } catch { /* gone */ } blobs?.del(name).catch(() => {}); } }
  function clear(matchId, by) {
    const f = entry(matchId, false);
    if (!f) return { cleared: false };
    delete state.fixtures[f.matchId];
    for (const v of f.videos) if (v.kind === 'file') dropFile(v.file);
    if (state.onScreens === f.matchId) state.onScreens = null;
    audit(by, `cleared all media for ${f.label}`);
    changed();
    return { cleared: true };
  }
  function show(matchId, by) {
    if (matchId == null) { state.onScreens = null; audit(by, 'took the media off the Arena screens'); changed(); return { onScreens: null }; }
    const f = entry(matchId, false);
    if (!f || empty(f)) throw err(409, 'Attach a head-to-head or highlights to this fixture first.');
    state.onScreens = f.matchId; audit(by, `put ${f.label} on the Arena screens`); changed();
    return { onScreens: f.matchId };
  }

  // ---------------------------------------------------------------- serving
  function fileInfo(name) {
    if (!FILE_RE.test(name)) throw err(404, 'Not found');
    const path = join(dir, name);
    if (!existsSync(path)) throw err(404, 'Not found');
    return { path, size: statSync(path).size, type: name.endsWith('.mp4') ? 'video/mp4' : 'video/webm' };
  }
  /** GET handler for a stored upload, with Range (seeking) support */
  function serveFile(req, res, name) {
    let info;
    try { info = fileInfo(name); } catch (e) { res.writeHead(e.status || 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); return; }
    const head = { 'Content-Type': info.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : info.size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : info.size - 1;
      start = Math.max(0, start); end = Math.min(info.size - 1, end);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
      createReadStream(info.path, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...head, 'Content-Length': info.size });
    createReadStream(info.path).pipe(res);
  }
  /** YouTube's public thumbnail for an attached clip, proxied so the 3D canvas stays same-origin */
  async function thumb(ytId) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(ytId || '') || !Object.values(state.fixtures).some((f) => f.videos.some((v) => v.yt === ytId))) throw err(404, 'Not found');
    if (thumbs.has(ytId)) return thumbs.get(ytId);
    if (offline) throw err(404, 'Not found');
    const r = await fetchImpl(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw err(502, 'Thumbnail unavailable');
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length > 500_000) throw err(413, 'Thumbnail too large');
    const out = { type: 'image/jpeg', body };
    if (thumbs.size > 100) thumbs.clear();
    thumbs.set(ytId, out);
    return out;
  }

  // ---------------------------------------------------------------- views
  function publicFixture(f) {
    return { ...f, videos: f.videos.map((v) => (v.kind === 'file' ? { id: v.id, kind: 'file', title: v.title, src: `/api/arena-media/file/${v.file}`, mime: v.mime, size: v.size, at: v.at, by: v.by } : { id: v.id, kind: 'youtube', yt: v.yt, title: v.title, thumb: `/api/arena-media/thumb/${v.yt}`, at: v.at, by: v.by })) };
  }
  function view() {
    pruneMissing();
    return { onScreens: state.onScreens, fixtures: Object.fromEntries(Object.entries(state.fixtures).map(([k, f]) => [k, publicFixture(f)])), audit: state.audit.slice(0, 12), limits: { uploadMb: MAX_UPLOAD / 1024 / 1024, videos: MAX_VIDEOS, rows: MAX_ROWS } };
  }

  // ---------------------------------------------------------------- hub ops (every one staff-only, checked here)
  function hubOps(hub) {
    const by = (c) => `${c.role}:${c.name}`;
    return {
      mediaFetchH2H: (c, m) => { hub.needStaff(c); return autoFill(m.matchId, by(c)); },
      mediaSetH2H: (c, m) => { hub.needStaff(c); return setH2H(m.matchId, m.rows, by(c)); },
      mediaAddYoutube: (c, m) => { hub.needStaff(c); return addYoutube(m.matchId, m.url, m.title, by(c)); },
      mediaRemoveVideo: (c, m) => { hub.needStaff(c); return removeVideo(m.matchId, m.videoId, by(c)); },
      mediaClear: (c, m) => { hub.needStaff(c); return clear(m.matchId, by(c)); },
      mediaShow: (c, m) => { hub.needStaff(c); return show(m.matchId ?? null, by(c)); },
    };
  }

  return { view, restore, pruneMissing, fetchH2H, autoFill, setH2H, addYoutube, upload, removeVideo, clear, show, serveFile, thumb, hubOps, onChange: (fn) => listeners.add(fn), dir };
}

