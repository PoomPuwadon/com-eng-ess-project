// LLM gateway (agent-cost-control skill). Every call: breaker check -> provider -> usage x price
// table -> llm_spend row. Providers:
//   claude: ANTHROPIC_API_KEY, @anthropic-ai/sdk (structured JSON output, cached system prompt)
//   gemini: GEMINI_API_KEY, REST generateContent via fetch (JSON mime type)
// LLM_PROVIDER picks one when both keys are set (default claude). Without any key (or with the
// breaker open) callers get null and fall back to their deterministic rule books, so the firm keeps
// running for free. The monthly cap and circuit breaker cover both providers (one llm_spend table).
import Anthropic from '@anthropic-ai/sdk';

// USD per 1M tokens (agent-cost-control §1; re-check before go-live). cacheWrite = 1.25x input, cacheRead = 0.1x.
const PRICES = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'claude-sonnet-5-5': { in: 2.0, out: 10.0 },
  'claude-opus-5-5': { in: 4.0, out: 20.0 },
  'gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  'gemini-2.5-pro': { in: 1.25, out: 10.0 },
};

// voice-and-satire §1: generated text containing a hard-banned word is discarded
const BANNED = new RegExp(String.raw`\b(${['casino', 'gambling', 'gamble', 'gambler', 'bet slip', 'bookie', 'jackpot', 'slot machine', 'loan shark', 'addiction', 'rigged'].join('|')})\b`, 'i'); // BANNED_WORDS

/** which provider is live for this config: 'claude' | 'gemini' | null */
export function pickProvider(config) {
  const has = { claude: Boolean(config.anthropicKey), gemini: Boolean(config.geminiKey) };
  if (config.llmProvider && has[config.llmProvider]) return config.llmProvider;
  return has.claude ? 'claude' : has.gemini ? 'gemini' : null;
}

// ---------------------------------------------------------------- providers: call({ system, user, schema, images, maxTokens, model }) -> { text, usage, stop }
function claudeProvider(config, log) {
  let client = null;
  const getClient = () => (client ||= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 60_000 }));
  return {
    name: 'claude',
    model: (m) => m || config.modelTick,
    async call({ system, user, schema, images = [], maxTokens, model }) {
      const content = [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })), { type: 'text', text: user }];
      try {
        const res = await getClient().messages.create({
          model, max_tokens: maxTokens,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        });
        const u = res.usage || {};
        return {
          text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), stop: res.stop_reason,
          usage: { input: u.input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0 },
        };
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) log.warn('[llm] invalid ANTHROPIC_API_KEY — falling back to rules');
        else if (e instanceof Anthropic.RateLimitError) log.warn('[llm] rate limited');
        else if (e instanceof Anthropic.APIError) log.warn(`[llm] API error ${e.status}: ${e.message}`);
        else log.warn(`[llm] ${e.message}`);
        return null;
      }
    },
  };
}

function geminiProvider(config, log) {
  return {
    name: 'gemini',
    model: (m) => (m && m.startsWith('gemini') ? m : config.geminiModel || 'gemini-2.5-flash'),
    async call({ system, user, schema, images = [], maxTokens, model }) {
      const body = {
        systemInstruction: { parts: [{ text: `${system}\n\nAnswer with ONE JSON object matching this JSON Schema, nothing else:\n${JSON.stringify(schema)}` }] },
        contents: [{ role: 'user', parts: [...images.map((im) => ({ inline_data: { mime_type: im.mediaType, data: im.data } })), { text: user }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, temperature: 0.4 },
      };
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) { log.warn(`[llm] Gemini API error ${res.status}`); return null; } // never log the key or the body we sent
        const j = await res.json();
        const cand = j.candidates?.[0];
        const u = j.usageMetadata || {};
        return {
          text: (cand?.content?.parts || []).map((p) => p.text || '').join(''), stop: cand?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : cand?.finishReason === 'SAFETY' ? 'refusal' : 'end_turn',
          usage: { input: u.promptTokenCount || 0, cacheWrite: 0, cacheRead: u.cachedContentTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
        };
      } catch (e) { log.warn(`[llm] Gemini ${e.message}`); return null; }
    },
  };
}

export function createLLM(db, config, log = console) {
  const name = pickProvider(config);
  const provider = name === 'claude' ? claudeProvider(config, log) : name === 'gemini' ? geminiProvider(config, log) : null;
  const enabled = () => Boolean(config.llmEnabled && provider);

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
      enabled: enabled(), provider: provider?.name || null, model: provider ? provider.model() : config.modelTick, capUsd: config.llmMonthlyCapUsd, monthToDateUsd: +spent.toFixed(4),
      projectedUsd: +(spent / Math.max(day - 1 + d.getUTCHours() / 24, 0.25) * days).toFixed(2), breaker: breaker(),
      calls: db.get('SELECT COUNT(*) AS n FROM llm_spend WHERE created_at >= ?', monthStart()).n,
      reason: !provider ? 'No ANTHROPIC_API_KEY or GEMINI_API_KEY in .env.local — agents run on their rule-based fallback.' : !config.llmEnabled ? 'LLM_ENABLED=0' : null,
    };
  }

  /**
   * Structured JSON call. system = stable brief (cached), user = volatile state, images = [{ mediaType, data(base64) }].
   * Returns parsed object or null (disabled / breaker / error / refusal / banned word).
   */
  async function json({ job, agent, system, user, schema, images, maxTokens = 3000, model, minBreaker = 2 }) {
    if (!enabled()) return null;
    if (breaker() >= minBreaker) return null;
    const m = provider.model(model);
    const out = await provider.call({ system, user, schema, images, maxTokens, model: m });
    if (!out) return null;
    const p = PRICES[m] || PRICES['claude-haiku-5-5'], u = out.usage;
    const usd = (u.input * p.in + u.cacheWrite * p.in * 1.25 + u.cacheRead * p.in * 0.1 + u.output * p.out) / 1e6;
    db.run('INSERT INTO llm_spend(created_at, job, agent, model, input_tokens, cache_write, cache_read, output_tokens, usd) VALUES (?,?,?,?,?,?,?,?,?)',
      Date.now(), job, agent || null, m, u.input, u.cacheWrite, u.cacheRead, u.output, usd);
    if (out.stop === 'refusal' || out.stop === 'max_tokens') return null;
    if (BANNED.test(out.text)) { log.warn(`[llm] ${job}: output used a banned word — discarded, rule book used instead`); return null; }
    try { return JSON.parse(out.text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { log.warn(`[llm] ${job}: unparseable JSON`); return null; }
  }

  return { json, status, breaker, enabled, provider: () => provider?.name || null };
}
