// Client side of the AI visuals feed (server/agents/feed.js). ONE place that knows what the agents in
// OT-01 / OT-02 / VT-02 just did: SSE 'agent' events plus a backfill from GET /api/ai/feed when a visitor walks in.
// Honesty rules: only server events are shown, never invented ones; if the feed is unreachable the rooms say so
// ("AI FEED OFFLINE") instead of faking activity. The dev-only inject() exists for screenshots and is stripped
// from production builds (import.meta.env.DEV).
import { api, on } from '../net/api.js';

export const ROOMS = ['OT-01', 'OT-02', 'VT-02'];
export const COL = { claude: '#ff8a5c', gemini: '#5aa2ff', rules: '#9aa3b2', good: '#5dff9a', bad: '#ff5a5a', warn: '#ffc857', gold: '#e3c27a' };
export const chip = (ev) => (ev?.provider === 'claude' ? { label: 'CLAUDE', hex: COL.claude } : ev?.provider === 'gemini' ? { label: 'GEMINI', hex: COL.gemini } : { label: 'RULE BOOK', hex: COL.rules });
export const providerChip = (p) => chip({ provider: p });
export const OUTCOME = { filled: COL.good, bought: COL.good, won: COL.good, cleared: COL.good, locked: COL.good, bullish: COL.good, done: COL.good, vetoed: COL.bad, rejected: COL.warn, lost: COL.bad, bearish: COL.bad, open: COL.gold, ignore: COL.rules };
export const outcomeColor = (o) => OUTCOME[o] || '#cfd6e4';

const KEEP = 120;
const S = { events: Object.fromEntries(ROOMS.map((r) => [r, []])), status: {}, think: new Map(), subs: new Set(), offline: false, started: false, llm: null, research: null, skew: 0, seen: new Set() };

/** server clock (ms): corrects countdowns for a wrong local clock */
export const serverNow = () => Date.now() + S.skew;
export const offline = () => S.offline;
export const llmInfo = () => S.llm;
export const research = () => S.research;
export const status = (room) => S.status[room] || {};
/** newest-last list of the room's events (optionally only some stages) */
export function latest(room, n = 8, stages = null) {
  const a = stages ? S.events[room].filter((e) => stages.includes(e.stage)) : S.events[room];
  return a.slice(-n);
}
export function forAgent(agent, n = 5, room = null) {
  const out = [];
  for (const r of room ? [room] : ROOMS) for (const e of S.events[r]) if (e.agent === agent && e.stage !== 'thinking') out.push(e);
  return out.sort((a, b) => a.at - b.at).slice(-n);
}
/** is this agent's model call in flight right now? (a stuck start clears itself after 2 min) */
export function thinking(agent) { const t = S.think.get(agent); return Boolean(t && Date.now() - t.at < 120_000); }
export function thinkingInfo(agent) { return S.think.get(agent) || null; }
export function onAgent(fn) { S.subs.add(fn); return () => S.subs.delete(fn); }
/** 'mm:ss' under an hour, 'hh:mm' above; '—' when unknown */
export function countdown(at) {
  if (!at) return '—';
  const s = Math.max(0, Math.round((at - serverNow()) / 1000));
  if (s >= 3600) return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const agoShort = (at) => { const s = Math.max(0, (serverNow() - at) / 1000); return s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };

function take(ev, live) {
  if (!ev || !ROOMS.includes(ev.room)) return;
  if (ev.stage === 'idle') { S.status[ev.room] = { ...(S.status[ev.room] || {}), ...(ev.data || {}) }; for (const fn of S.subs) fn(ev, live); return; }
  if (ev.stage === 'thinking') {
    if (ev.data?.on) S.think.set(ev.agent, { at: Date.now(), room: ev.room, text: ev.text, provider: ev.provider, model: ev.model });
    else S.think.delete(ev.agent);
  } else {
    if (ev.id) { if (S.seen.has(ev.id)) return; S.seen.add(ev.id); if (S.seen.size > 2000) S.seen.clear(); }
    const a = S.events[ev.room]; a.push(ev); if (a.length > KEEP) a.shift();
  }
  for (const fn of S.subs) { try { fn(ev, live); } catch (e) { console.error(e); } }
}

async function backfill() {
  try {
    const j = await api('/api/ai/feed?limit=100');
    S.skew = j.now ? j.now - Date.now() : S.skew;
    S.llm = j.llm; if (j.research !== undefined) S.research = j.research;
    for (const [room, st] of Object.entries(j.status || {})) S.status[room] = { ...(S.status[room] || {}), ...st };
    for (const ev of j.events || []) take(ev, false);
    S.offline = false;
  } catch { S.offline = true; }
  for (const fn of S.subs) fn({ stage: 'sync' }, false);
}

export function startAiFeed() {
  if (S.started) return;
  S.started = true;
  on('agent', (ev) => { S.offline = false; take(ev, true); });
  backfill();
  setInterval(backfill, 60_000); // refreshes countdowns, the research digest and the offline flag
  if (import.meta.env?.DEV) {
    // dev only: window.__debug.ai.inject({...}) pushes a labelled FAKE event so screenshots can show a mid-event scene
    globalThis.__aiFeed = { inject: (ev) => take({ id: 0, at: Date.now(), provider: 'rules', model: 'rules', outcome: null, ref: null, data: null, text: '', ...ev, dev: true }, true), state: S };
  }
}

// the firm book (positions by desk, desk scoreline, Model League), pushed by liveData.js
let BOOK = null;
export const setBook = (b) => { BOOK = b; for (const fn of S.subs) { try { fn({ stage: 'sync' }, false); } catch (e) { console.error(e); } } };
export const book = () => BOOK;

/** 'claude' | 'gemini' | 'rules' from a model id (null / 'rules' = the rule book) */
export const providerFromModel = (m) => (/^claude/i.test(m || '') ? 'claude' : /^gemini/i.test(m || '') ? 'gemini' : 'rules');
