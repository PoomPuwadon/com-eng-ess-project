// LLM gateway (agent-cost-control skill). Every call: breaker check -> Claude API -> usage x price
// table -> llm_spend row. Without ANTHROPIC_API_KEY (or with the breaker open) callers get null and
// fall back to their deterministic rule-based path, so the firm keeps running for free.
import Anthropic from '@anthropic-ai/sdk';

// USD per 1M tokens (agent-cost-control §1; re-check before go-live). cacheWrite = 1.25x input, cacheRead = 0.1x.
const PRICES = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'claude-sonnet-5-5': { in: 2.0, out: 10.0 },
  'claude-opus-5-5': { in: 4.0, out: 20.0 },
};

// voice-and-satire §1: generated text containing a hard-banned word is discarded
const BANNED = new RegExp(String.raw`\b(${['casino', 'gambling', 'gamble', 'gambler', 'bet slip', 'bookie', 'jackpot', 'slot machine', 'loan shark', 'addiction', 'rigged'].join('|')})\b`, 'i'); // BANNED_WORDS

export function createLLM(db, config, log = console) {
  let client = null;
  const enabled = () => Boolean(config.llmEnabled && config.anthropicKey);
  const getClient = () => (client ||= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 60_000 }));

  const monthStart = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
  const monthSpend = () => db.get('SELECT COALESCE(SUM(usd), 0) AS s FROM llm_spend WHERE created_at >= ?', monthStart()).s;
  /** 0 normal · 1 (>=70 %) slow · 2 (>=90 %) events only · 3 (>=100 %) stopped */
  function breaker() {
    const frac = monthSpend() / config.llmMonthlyCapUsd;
    return frac >= 1 ? 3 : frac >= 0.9 ? 2 : frac >= 0.7 ? 1 : 0;
  }
  function status() {
    const spent = monthSpend();
    const d = new Date(), day = d.getUTCDate(), days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      enabled: enabled(), model: config.modelTick, capUsd: config.llmMonthlyCapUsd, monthToDateUsd: +spent.toFixed(4),
      projectedUsd: +(spent / Math.max(day - 1 + d.getUTCHours() / 24, 0.25) * days).toFixed(2), breaker: breaker(),
      calls: db.get('SELECT COUNT(*) AS n FROM llm_spend WHERE created_at >= ?', monthStart()).n,
      reason: !config.anthropicKey ? 'No ANTHROPIC_API_KEY in .env — agents run on their rule-based fallback.' : !config.llmEnabled ? 'LLM_ENABLED=0' : null,
    };
  }

  /**
   * Structured JSON call. system = stable brief (cached), user = volatile state.
   * Returns parsed object or null (disabled / breaker / error / refusal).
   */
  async function json({ job, agent, system, user, schema, maxTokens = 3000, model = config.modelTick, minBreaker = 2 }) {
    if (!enabled()) return null;
    if (breaker() >= minBreaker) return null;
    try {
      const res = await getClient().messages.create({
        model, max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      });
      const u = res.usage || {};
      const p = PRICES[model] || PRICES['claude-haiku-5-5'];
      const usd = ((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.in * 1.25 + (u.cache_read_input_tokens || 0) * p.in * 0.1 + (u.output_tokens || 0) * p.out) / 1e6;
      db.run('INSERT INTO llm_spend(created_at, job, agent, model, input_tokens, cache_write, cache_read, output_tokens, usd) VALUES (?,?,?,?,?,?,?,?,?)',
        Date.now(), job, agent || null, model, u.input_tokens || 0, u.cache_creation_input_tokens || 0, u.cache_read_input_tokens || 0, u.output_tokens || 0, usd);
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (BANNED.test(text)) { log.warn(`[llm] ${job}: output used a banned word — discarded, rule book used instead`); return null; }
      return JSON.parse(text);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) log.warn('[llm] invalid ANTHROPIC_API_KEY — falling back to rules');
      else if (e instanceof Anthropic.RateLimitError) log.warn('[llm] rate limited');
      else if (e instanceof Anthropic.APIError) log.warn(`[llm] API error ${e.status}: ${e.message}`);
      else log.warn(`[llm] ${e.message}`);
      return null;
    }
  }

  return { json, status, breaker, enabled };
}
