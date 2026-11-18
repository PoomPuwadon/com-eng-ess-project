// AI visuals feed (docs/ai-visuals-plan.md §2.1): ONE stream of short, attributed agent events for the three
// rooms that show AI at work (OT-01 Trading Floor, OT-02 Probability Institute, VT-02 Sports Arena).
// It is READ-ONLY plumbing: it records values the agents already computed. It never calls a model and never
// touches money. `thinking` events are transient (bus only); everything else is kept in agent_events
// (last ~500 rows) so a visitor who walks in can be backfilled from GET /api/ai/feed.
export const ROOMS = ['OT-01', 'OT-02', 'VT-02', 'VT-01'];
export const STAGES = ['thinking', 'signal', 'proposal', 'review', 'veto', 'execute', 'result', 'research', 'shortlist', 'decision', 'scout', 'stake', 'settle', 'idle'];
const KEEP = 500;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// voice-and-satire: the UI never says these (models are already filtered in llm.js; headlines and rationales are belt and braces)
const BANNED = /\b(casino|gambling|gamble|gambler|bet slip|bookie|jackpot|slot machine|loan shark|addiction|rigged)\b/gi;
export const clean = (s) => String(s ?? '').replace(BANNED, 'leisure');

/** 'claude' | 'gemini' | 'rules' from the model id that decided (null/false/'rules' = rule book) */
export function providerOf(model) {
  const m = String(model || '');
  return m.startsWith('claude') ? 'claude' : m.startsWith('gemini') ? 'gemini' : 'rules';
}

/** Do-nothing feed so services built without one (tests, tools) keep working. */
export const nullFeed = {
  emit: () => null, think: async (_o, p) => (typeof p === 'function' ? p() : p), status() {}, getStatus: () => ({}), list: () => [], enabled: false,
};

export function createFeed({ db, bus, routeOf = () => null }) {
  const state = {}; // room -> { nextAt, mode, label, ... } (in memory; the countdowns are always real)
  let sinceTrim = 0;

  /**
   * Record + broadcast one event. model: the model id that decided, or false/null/'rules' for the rule book.
   * Returns the event ({ id, at, room, agent, provider, model, stage, text, outcome, ref, data }).
   */
  function emit({ room, agent, model = null, stage, text = '', outcome = null, ref = null, data = null, persist = stage !== 'thinking' && stage !== 'idle' }) {
    if (!ROOMS.includes(room)) throw new Error(`unknown room ${room}`);
    if (!STAGES.includes(stage)) throw new Error(`unknown stage ${stage}`);
    const mdl = model && model !== 'rules' ? String(model) : null;
    const ev = { id: 0, at: Date.now(), room, agent, provider: providerOf(mdl), model: mdl || 'rules', stage, text: clip(clean(text), 140), outcome: outcome || null, ref: ref ? clip(ref, 60) : null, data: data ?? null };
    if (persist) {
      const r = db.run('INSERT INTO agent_events(at, room, agent, provider, model, stage, text, data, outcome, ref) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ev.at, room, agent, ev.provider, ev.model, stage, ev.text, data == null ? null : JSON.stringify(data), ev.outcome, ev.ref);
      ev.id = Number(r.lastInsertRowid);
      if (++sinceTrim >= 50) { sinceTrim = 0; db.run('DELETE FROM agent_events WHERE id <= (SELECT COALESCE(MAX(id), 0) - ? FROM agent_events)', KEEP); }
    }
    bus?.emit('agent', ev);
    return ev;
  }

  /** Wrap an LLM call: `thinking` start before, stop after, so the room can show REAL in-flight work. */
  async function think({ room, agent, text = 'Thinking' }, promise) {
    const r = routeOf(agent);
    if (!r) return typeof promise === 'function' ? promise() : promise; // no key: the rule book decides instantly, nothing to show as thinking
    const base = { room, agent, model: r?.model || null, stage: 'thinking' };
    emit({ ...base, text, data: { on: true } });
    try { return await (typeof promise === 'function' ? promise() : promise); }
    finally { emit({ ...base, text, data: { on: false } }); }
  }

  /** Real countdown + mode for a room (`idle` carries nextAt). Not persisted. */
  function status(room, patch) {
    state[room] = { ...(state[room] || {}), ...patch, at: Date.now() };
    bus?.emit('agent', { id: 0, at: Date.now(), room, agent: null, provider: 'rules', model: 'rules', stage: 'idle', text: clip(patch.label || '', 140), outcome: null, ref: null, data: { ...state[room] } });
  }
  const getStatus = (room) => (room ? state[room] || {} : { ...state });

  /** newest-first rows, oldest->newest order is the client's job */
  function list({ room, limit = 40, agent } = {}) {
    const n = Math.max(1, Math.min(200, Number(limit) || 40));
    const rows = room
      ? db.all('SELECT * FROM agent_events WHERE room = ? ORDER BY id DESC LIMIT ?', room, agent ? 500 : n)
      : db.all('SELECT * FROM agent_events ORDER BY id DESC LIMIT ?', n);
    return rows.filter((r) => !agent || r.agent === agent).slice(0, n).map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
  }

  return { emit, think, status, getStatus, list, enabled: true };
}
