// LLM gateway (agent-cost-control skill). Every call: breaker check -> provider -> usage x price
// table -> llm_spend row. Providers (both run side by side when both keys are set):
//   claude: ANTHROPIC_API_KEY, @anthropic-ai/sdk (structured JSON output, cached system prompt)
//   gemini: GEMINI_API_KEY, REST generateContent via fetch (JSON mime type)
// Routing: each agent has a preferred provider (ROUTES below, overridable with AGENT_PROVIDERS in
// .env.local, e.g. "head_trader=claude,co_head_trader=gemini"). If that provider has no key the call
// goes to the other one. Jobs without an agent use LLM_PROVIDER (default claude). Without any key (or
// with the breaker open) callers get null and fall back to their deterministic rule books, so the
// firm keeps running for free. The monthly cap and circuit breaker cover both providers.
import Anthropic from '@anthropic-ai/sdk';

/** Default provider per agent: two rival trading desks on different models, analysts split across both. */
export const ROUTES = {
  head_trader: 'claude', co_head_trader: 'gemini', quant: 'gemini', risk_officer: 'claude',
  thai_head: 'claude', lottery_quant: 'gemini', fixture_scout: 'gemini',
};

/** "a=claude, b=gemini" -> { a: 'claude', b: 'gemini' } (unknown providers ignored) */
export function parseRoutes(s) {
  const out = {};
  for (const part of String(s || '').split(',')) {
    const [k, v] = part.split('=').map((x) => x?.trim().toLowerCase());
    if (k && (v === 'claude' || v === 'gemini')) out[k] = v;
  }
  return out;
}

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
    model: (m) => (m && m.startsWith('claude') ? m : config.modelTick),
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

// GEMINI_MODEL may be a comma list: a fallback chain tried in order when a model is retired (404),
// overloaded (503), rate limited (429) or too slow. Google retires model ids for new keys without
// notice, so keep a fast "lite" model at the end of the chain.
export const DEFAULT_GEMINI = 'gemini-3.5-flash,gemini-3.1-flash-lite';
const RETRYABLE = new Set([404, 429, 500, 503]);

function geminiProvider(config, log) {
  const chain = String(config.geminiModel || DEFAULT_GEMINI).split(',').map((s) => s.trim()).filter(Boolean);
  const dead = new Set(); // models this key cannot use (404): skipped until restart
  const cool = new Map(); // model -> until (ms): overloaded (429/503) or timed out, skipped for 30 min
  const usable = (x) => !dead.has(x) && !(cool.get(x) > Date.now());
  return {
    name: 'gemini',
    model: (m) => (m && m.startsWith('gemini') ? m : chain.find(usable) || chain.find((x) => !dead.has(x)) || chain[0]),
    async call({ system, user, schema, images = [], maxTokens, model }) {
      const body = {
        systemInstruction: { parts: [{ text: `${system}\n\nAnswer with ONE JSON object matching this JSON Schema, nothing else:\n${JSON.stringify(schema)}` }] },
        contents: [{ role: 'user', parts: [...images.map((im) => ({ inline_data: { mime_type: im.mediaType, data: im.data } })), { text: user }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens + 2000, temperature: 0.4 }, // headroom: thinking tokens count as output
      };
      const rest = chain.filter((x) => x !== model && !dead.has(x));
      const tries = [model, ...rest.filter(usable), ...rest.filter((x) => !usable(x))]; // cooled-down models last, never skipped entirely
      for (const m of tries) {
        try {
          const thinking = /^gemini-[3-9]/.test(m) ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
            body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, ...thinking } }), signal: AbortSignal.timeout(45_000),
          });
          if (!res.ok) { // never log the key or the body we sent
            if (res.status === 404) dead.add(m);
            if (res.status === 429 || res.status === 503) cool.set(m, Date.now() + 30 * 60_000);
            log.warn(`[llm] Gemini ${m}: API error ${res.status}${res.status === 404 ? ' (model not available to this key; set GEMINI_MODEL in .env.local)' : ''}`);
            if (RETRYABLE.has(res.status)) continue;
            return null;
          }
          const j = await res.json();
          const cand = j.candidates?.[0];
          const u = j.usageMetadata || {};
          return {
            model: m, text: (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join(''),
            stop: cand?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(cand?.finishReason) || j.promptFeedback?.blockReason ? 'refusal' : 'end_turn',
            usage: { input: u.promptTokenCount || 0, cacheWrite: 0, cacheRead: u.cachedContentTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
          };
        } catch (e) {
          if (e.name === 'TimeoutError') cool.set(m, Date.now() + 30 * 60_000);
          log.warn(`[llm] Gemini ${m}: ${e.name === 'TimeoutError' ? 'timed out after 45 s (skipped for 30 min)' : e.message}`);
        }
      }
      return null;
    },
  };
}

export function createLLM(db, config, log = console) {
  const providers = {};
  if (config.anthropicKey) providers.claude = claudeProvider(config, log);
  if (config.geminiKey) providers.gemini = geminiProvider(config, log);
  const name = pickProvider(config);
  const provider = name ? providers[name] : null; // default for jobs without an agent route
  const routes = { ...ROUTES, ...(config.agentProviders || {}) };
  const enabled = () => Boolean(config.llmEnabled && provider);
  /** the provider an agent's calls go to right now (its preferred one, else whichever has a key) */
  const providerFor = (agent) => providers[routes[agent]] || provider;
  const route = (agent) => { const p = providerFor(agent); return p ? { provider: p.name, model: p.model(), preferred: routes[agent] || name } : null; };

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
      enabled: enabled(), provider: provider?.name || null, model: provider ? provider.model() : config.modelTick,
      providers: Object.values(providers).map((p) => ({ name: p.name, model: p.model() })),
      routes: Object.fromEntries(Object.keys(routes).map((a) => [a, route(a)])),
      capUsd: config.llmMonthlyCapUsd, monthToDateUsd: +spent.toFixed(4),
      projectedUsd: +(spent / Math.max(day - 1 + d.getUTCHours() / 24, 0.25) * days).toFixed(2), breaker: breaker(),
      calls: db.get('SELECT COUNT(*) AS n FROM llm_spend WHERE created_at >= ?', monthStart()).n,
      reason: !provider ? 'No ANTHROPIC_API_KEY or GEMINI_API_KEY in .env.local — agents run on their rule-based fallback.' : !config.llmEnabled ? 'LLM_ENABLED=0' : null,
    };
  }

  /**
   * Structured JSON call. system = stable brief (cached), user = volatile state, images = [{ mediaType, data(base64) }].
   * The agent's route picks the provider. Returns { data, provider, model } or null
   * (disabled / breaker / error / refusal / banned word).
   */
  async function ask({ job, agent, system, user, schema, images, maxTokens = 3000, model, minBreaker = 2 }) {
    if (!enabled()) return null;
    if (breaker() >= minBreaker) return null;
    const pv = providerFor(agent);
    const m = pv.model(model);
    const r = await callOne(pv, { job, agent, system, user, schema, images, maxTokens, m });
    return r && { data: r.data, provider: pv.name, model: r.model };
  }
  const json = async (opts) => (await ask(opts))?.data ?? null;

  async function callOne(pv, { job, agent, system, user, schema, images, maxTokens, m }) {
    const out = await pv.call({ system, user, schema, images, maxTokens, model: m });
    if (!out) return null;
    m = out.model || m; // a Gemini fallback chain may have answered with a later model
    // unknown ids (new Gemini models) are metered at the Gemini Flash list price as an estimate
    const p = PRICES[m] || (m.startsWith('gemini') ? PRICES['gemini-2.5-flash'] : PRICES['claude-haiku-5-5']), u = out.usage;
    const usd = (u.input * p.in + u.cacheWrite * p.in * 1.25 + u.cacheRead * p.in * 0.1 + u.output * p.out) / 1e6;
    db.run('INSERT INTO llm_spend(created_at, job, agent, model, input_tokens, cache_write, cache_read, output_tokens, usd) VALUES (?,?,?,?,?,?,?,?,?)',
      Date.now(), job, agent || null, m, u.input, u.cacheWrite, u.cacheRead, u.output, usd);
    if (out.stop === 'refusal' || out.stop === 'max_tokens') { log.warn(`[llm] ${job} (${agent || '-'}, ${m}): ${out.stop === 'refusal' ? 'refused / safety-blocked' : 'hit max tokens'} — rule book used instead`); return null; }
    if (BANNED.test(out.text)) { log.warn(`[llm] ${job}: output used a banned word — discarded, rule book used instead`); return null; }
    try { return { data: JSON.parse(out.text.replace(/^```(?:json)?\s*|\s*```$/g, '')), model: m }; } catch { log.warn(`[llm] ${job}: unparseable JSON`); return null; }
  }

  return { json, ask, route, status, breaker, enabled, provider: () => provider?.name || null };
}
