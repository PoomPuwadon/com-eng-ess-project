// Action gateway (agent-cost-control §6): agents PROPOSE, the server DISPOSES. Every proposed action
// is checked against the agent's privileges row and its daily counters (reset 00:00 Asia/Bangkok)
// before it can touch the ledger. Rejections are stored and fed back on the agent's next tick.
import { dayKey } from '../time.js';

export const AGENTS = {
  head_trader: { name: 'Head Trader', dept: 'trading_floor', title: 'Managing Director, Global Equities (Desk A)', trader: true },
  co_head_trader: { name: 'Co-Head Trader', dept: 'trading_floor', title: 'Co-Managing Director, Global Equities (Desk B)', trader: true },
  quant: { name: 'Quant', dept: 'trading_floor', title: 'Head of Systematic Alpha' },
  risk_officer: { name: 'Risk Officer', dept: 'trading_floor', title: 'Chief Risk Officer (Equities)' },
  thai_head: { name: 'Head of Thai Markets', dept: 'thai_markets', title: 'Head of Thai Markets' },
  lottery_quant: { name: 'Lottery Quant', dept: 'thai_markets', title: 'Principal Quantitative Researcher' },
};

// Default privileges until the CEO console exists (Phase 5): offline allowed, with hard caps.
const DEFAULTS = {
  head_trader: { offline_allowed: 1, daily_spend_cap: 120_000_000, max_actions_per_day: 40, max_single_stake: 20_000_000, allowed_actions: ['PLACE_TRADE'] },
  co_head_trader: { offline_allowed: 1, daily_spend_cap: 120_000_000, max_actions_per_day: 40, max_single_stake: 20_000_000, allowed_actions: ['PLACE_TRADE'] },
  thai_head: { offline_allowed: 1, daily_spend_cap: 400_000, max_actions_per_day: 4, max_single_stake: 160_000, allowed_actions: ['BUY_TICKETS'] },
};

export function createGateway(db) {
  for (const [agent, p] of Object.entries(DEFAULTS)) {
    db.run('INSERT OR IGNORE INTO agent_privileges(agent, offline_allowed, daily_spend_cap, max_actions_per_day, max_single_stake, allowed_actions) VALUES (?,?,?,?,?,?)',
      agent, p.offline_allowed, p.daily_spend_cap, p.max_actions_per_day, p.max_single_stake, JSON.stringify(p.allowed_actions));
  }
  const privileges = (agent) => {
    const p = db.get('SELECT * FROM agent_privileges WHERE agent = ?', agent);
    return p && { ...p, allowed_actions: JSON.parse(p.allowed_actions) };
  };
  const usage = (agent) => db.get('SELECT actions, spend FROM agent_usage WHERE agent = ? AND day = ?', agent, dayKey()) || { actions: 0, spend: 0 };

  /** Throws with a reason if not allowed; otherwise returns a commit() to call inside the executing transaction. */
  function check(agent, action, spend) {
    const p = privileges(agent);
    if (!p) throw new Error('no privileges on file');
    if (!p.allowed_actions.includes(action)) throw new Error(`action ${action} not permitted`);
    const u = usage(agent);
    if (u.actions + 1 > p.max_actions_per_day) throw new Error(`daily action cap reached (${p.max_actions_per_day})`);
    if (spend > p.max_single_stake) throw new Error(`single allocation ${spend / 100} exceeds cap ${p.max_single_stake / 100}`);
    if (u.spend + spend > p.daily_spend_cap) throw new Error(`daily spend cap reached (${p.daily_spend_cap / 100})`);
    return () => db.run(`INSERT INTO agent_usage(agent, day, actions, spend) VALUES (?, ?, 1, ?)
      ON CONFLICT(agent, day) DO UPDATE SET actions = actions + 1, spend = spend + excluded.spend`, agent, dayKey(), spend);
  }
  function reject(agent, action, reason) {
    db.run('INSERT INTO agent_rejections(agent, created_at, action, reason) VALUES (?,?,?,?)', agent, Date.now(), JSON.stringify(action), reason);
  }
  const recentRejections = (agent, sinceMs) => db.all('SELECT created_at, action, reason FROM agent_rejections WHERE agent = ? AND created_at > ? ORDER BY id DESC LIMIT 10', agent, sinceMs)
    .map((r) => ({ ...r, action: JSON.parse(r.action) }));
  /** llm: false (rule book) or the model id that wrote it (stored as data.model) */
  function report(agent, text, data, llm = false) {
    if (typeof llm === 'string') data = { ...(data || {}), model: llm };
    db.run('INSERT INTO agent_reports(agent, dept, created_at, report, data, llm) VALUES (?,?,?,?,?,?)', agent, AGENTS[agent].dept, Date.now(), text, data ? JSON.stringify(data) : null, llm ? 1 : 0);
  }
  const latestReports = (dept, perAgent = 1) => Object.keys(AGENTS).filter((a) => AGENTS[a].dept === dept).map((agent) => ({
    agent, ...AGENTS[agent], privileges: privileges(agent), usage: usage(agent),
    reports: db.all('SELECT created_at, report, data, llm FROM agent_reports WHERE agent = ? ORDER BY id DESC LIMIT ?', agent, perAgent)
      .map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null, llm: !!r.llm })),
  }));

  return { check, reject, recentRejections, report, latestReports, privileges, usage };
}
