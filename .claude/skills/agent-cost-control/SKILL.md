---
name: agent-cost-control
description: Design and cost rules for the firm's AI employees — how often key agents think, which model does what, the monthly LLM cost ceiling and circuit breaker, the pipeline from key-agent reports to situation summaries to batched background dialogue, and server-side enforcement of offline privileges and daily caps. Use whenever writing or changing agent loops, prompts, schedulers, LLM calls, dialogue generation, summoning, or agent permissions.
---

# AI Agent Cost Control

Hundreds of background staff, a few key agents, a hard monthly ceiling. **Background staff never
make their own LLM calls.**

## 1. Prices used for estimates

Anthropic API list prices per 1M tokens (cached 2026-10-06 — re-check before go-live):

| Model | ID | Input | Output | Use for |
| --- | --- | --- | --- | --- |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 | $0.50 | Key-agent think ticks, situation summaries, dialogue pools |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2.00 | $10.00 | CEO/admin conversations with agents, summons, CFO speeches |

Message Batches API = 50 % off (asynchronous — use for dialogue pools). Prompt-cache reads are a
fraction of input price — put the stable system prompt + department brief first and cache it.
Model choice per job is a config value (`AGENT_MODELS` in config), so the user can change it;
the defaults above are a cost recommendation, not a fixed decision.

## 2. Key agents and how often they think

| Department | Key agents |
| --- | --- |
| Trading Floor | Head Trader, Quant, Risk Officer |
| Sports Desk | Head of Football, Odds Analyst |
| Leisure Operations | Floor Director, Yield Analyst |
| Thai Markets Desk | Head of Thai Markets, Lottery Quant |
| Asset Protection HQ | Chief of Security |
| Executive Floor | CFO, Head of HR, General Counsel, CTO |

14 key agents. A **think tick** = one LLM call: input = cached brief + compact state JSON (budget,
positions, open bets, today's data deltas); output = structured JSON (`actions[]`, `report`).

| Situation | Tick interval |
| --- | --- |
| Department "hot" (US market open for trading; a match/fight/race/draw within its window) | 15 min |
| Normal | 60 min |
| No admin online and agent has no offline privilege | 0 — agent sleeps |
| Event-driven (big price move > 3 %, goal, final whistle, draw result) | immediate, debounced to 1 per 5 min per agent |

Ticks are staggered (never all agents in the same second) and run through one job queue with a
concurrency limit.

## 3. Pipeline: key agents → situation summaries → background dialogue

1. **Key-agent tick** → `report` (earnings, positions, spend, situation) stored in `agent_reports`,
   shown on the Executive Floor dashboards.
2. **Situation summary** — one per department every 30 min (or on a big event): a Haiku call that
   condenses that department's latest reports + real-world deltas into ≤ 120 words plus a facts
   JSON (`{ mood, topMove, numbers[], gossipHooks[] }`). Also a 1-line public "headline" other
   departments gossip about.
3. **Dialogue pool** — one **Batch API** request per department every 2 h (and after a blowout
   event): input = own summary + the other departments' headlines + style guide from the
   `voice-and-satire` skill; output = ~40 own-department lines + ~20 gossip lines, each with tags
   (`mood`, `topic`) and slots like `{ticker}`, `{pct}`, `{team}` filled at runtime from live data.
4. **Runtime** — the server sends each client the pool for the floors it has loaded. When a player
   walks near an NPC, the client picks a line from that NPC's department pool (weighted by tag,
   no repeats per player for 10 min) and fills its slots. **Zero LLM calls per NPC or per player.**
5. If a pool is missing or the budget is exhausted, fall back to a static, hand-written line bank.

## 4. Monthly cost estimate (defaults)

| Item | Volume / month | Tokens per call (in / out) | Cost / month |
| --- | --- | --- | --- |
| Key-agent ticks (Haiku) | 14 agents × ~40/day × 30 ≈ 16,800 | 8k (6k cached) / 2k | ≈ $22 |
| Situation summaries (Haiku) | 9 depts × 48/day × 30 ≈ 13,000 | 3k / 1k | ≈ $10 |
| Dialogue pools (Haiku, Batch −50 %) | 9 depts × 12/day × 30 ≈ 3,240 | 4k / 4k | ≈ $4 |
| CEO/admin conversations (Sonnet) | ~500 turns | 12k (mostly cached) / 1.5k | ≈ $11 |
| Summons + CFO speeches (Sonnet) | ~60 | 10k / 2k | ≈ $2 |
| **Total** | | | **≈ $50 / month** |

**Default ceiling: $75 / month** (`LLM_MONTHLY_CAP_USD`), i.e. $2.50/day soft daily budget.
Recompute this table whenever the agent count, tick intervals or models change, and tell the user
the new estimate.

## 5. The cost circuit breaker (server-side)

- Every LLM response's `usage` (input, cached input, output tokens) × price table is written to
  `llm_spend` with job type and agent id. Spend is computed from real usage, not estimates.
- Before each call the scheduler checks month-to-date spend:
  - **≥ 70 %**: double all tick intervals; dialogue pools every 4 h.
  - **≥ 90 %**: key agents only on event-driven ticks; no new dialogue pools (reuse cached ones).
  - **≥ 100 %**: no LLM calls except CEO/admin conversations, which are capped at a separate small
    reserve (10 % of the cap); agents keep their last state, NPCs use cached/static lines.
- Per-call guards: `max_tokens` set per job type; malformed output is retried once at most.
- Admin dashboard shows month-to-date spend, projection and the current breaker level.

## 6. Offline privileges and caps — enforced by the server, never trusted to the agent

Agents **propose** actions; the server **disposes**. The model's output is untrusted input.

- An agent's output is a list of typed actions (`PLACE_TRADE`, `PLACE_BET`, `REQUEST_BUDGET`,
  `WRITE_REPORT`…). An **action gateway** validates each one against:
  - schema (strict JSON schema; unknown actions rejected),
  - the department's `DEPT` balance and budget (via the `money-ledger` skill's `ledger.post`),
  - the agent's **privileges** row: `{ offline_allowed, daily_spend_cap, max_actions_per_day,
    allowed_action_types[], max_single_stake }`, set only by the CEO,
  - counters in the DB (`agent_daily_usage`, reset at 00:00 Asia/Bangkok) — incremented in the same
    DB transaction that executes the action.
- **"Admin online"** = at least one CEO/admin websocket session with a heartbeat in the last 60 s,
  as tracked by the server. The prompt never decides this.
- No admin online and `offline_allowed = false` → the scheduler doesn't run the agent at all.
- Rejected actions are logged with the reason and fed back in the agent's next tick state
  ("Your last order was rejected: daily cap reached").
- The agent never sees API keys, DB credentials or other agents' raw prompts; it has no tool that
  can change privileges, budgets of other departments, or roles.

## 7. Conversations, summons, memory

- Only CEO/admins can converse with key agents (server checks role before every turn). Visitors
  can see and approach agents; the talk prompt is not offered to them.
- Summoning: the agent's NPC walks to the CEO office; the conversation uses Sonnet with the
  agent's brief + current report.
- **No memory of reprimands**: conversation transcripts are not fed into later ticks. Only the
  structured state (positions, budget, reports) persists. No promotion mechanic exists anywhere.
- Prompts are cache-friendly: static brief first, volatile state last, no timestamps in the cached prefix.
