# Plan: make the AI visibly work — OT-01 Trading Floor, OT-02 Probability Institute, VT-02 Sports Arena

Status: PLAN ONLY. Nothing here is built. Written to be handed to a fresh build chat.
Scope (user, 2026-11-19): changes ONLY to OT-01, OT-02 and VT-02. No other floor, no change to money logic. The only new
LLM calls are the small off-hours research cycle in 3.7; everything else is read-only visuals. Owner decisions are in
section 8 and win over anything earlier in this file.

## 0. Why this exists (the whole purpose)

The project exists because the owner wanted AI to help find money in several ways, but cannot SEE what the AI is
doing. A building where agents work invisibly behind a terminal is the failure case. The standard to beat:
"AI agents without visuals". Every AI decision in these three rooms must be visible, attributed, explained and
followed through to its outcome, by someone who just walked in and never opened a terminal.

### The 10-second test (acceptance for every room)

A visitor who walks into the room, with no sign-in and no terminal, within about 10 seconds can answer:
1. WHO is the AI here (named agents, which model: Claude / Gemini / rule book)?
2. WHAT did it just decide?
3. WHY (one short reason, from the real rationale)?
4. WHAT HAPPENED next (filled, vetoed, rejected, bought, settled, won/lost)?
5. WHEN is the next decision (real countdown)?

Honesty rules: only real events, never staged ones. If a room's AI is idle, show the real countdown. If a scene is a
replay of a stored run, label it REPLAY with the run id and age. If no API key is set the rooms still work and the
decisions are labelled RULE BOOK.

## 1. What exists today (verified by reading the code)

OT-01 (`src/characters/aiTraders.js`, `src/floors/tradingFloor.js` `aiDesks()` ~L383)
- 4 named live agents at PCs by the entrance: Head Trader (Claude), Co-Head Trader (Gemini), Quant (Gemini),
  Risk Officer (Claude). Big provider-coloured tag: name, role, one status line. Floor ring, spinning gem, pad.
- Driven only by SSE events `order`, `trade`, `firm` tick. `firm` tick carries no detail. Two of the four stroll and
  their position is not tied to anything meaningful.
- What is NOT visible: why an order was made, which model, the Risk Officer's vetoes and their reasons, the Quant's
  tilts, the conviction level, the rival-desk scoreline, thinking-in-progress, the next tick time, who owns which
  position in the pit boards.

OT-02 (`src/floors/probability.js`, `src/floors/theatreScreens.js`, `src/world/lottoFeed.js`)
- Real data on 24 monitors (model desk, history, certificates, pipeline). Animatronic robot draws on the stage.
- The quants are generic lab-coat NPCs. Lottery Quant (Gemini) and Head of Thai Markets (Claude) are NOT in the
  room as characters. The only decision text is one 9 px line "Head of Thai Markets: N certificates (LLM)".
- Real AI activity here is rare: `institute.js` runs once per draw (1st and 16th), so a live "AI working" moment
  almost never happens while someone is watching.

VT-02 (`src/floors/sportsArena.js`, `src/world/broadcast.js`, `server/football/service.js`)
- Fixture Scout (Gemini) picks the marquee match (<= every 3 h); Sports Desk agent stakes it by rule book once per
  marquee; settlement polls every 10 min. None of this has a body or a place in the arena. Big screens show
  fixtures and the marquee card, but nothing shows the scouting or the desk's stake happening.

Server events today: `order`, `trade`, `firm`(tick), `quotes`, `lottery`(run/decision/sale/settled). No football event.
No "thinking" state, no veto/tilt/scout/stake events. Reports exist only in `agent_reports` (terminal text).

Data that already exists on the server and just is not emitted:
- Order rationale (`tradingDesk.js` actions have `rationale`), Quant `tilts[{symbol,tilt,reason}]` + note,
  desk memo + `conviction`, Risk Officer `vetoes[{id,reason}]` + memo, `rejectedSinceLastTick`, per-order model.
- Lottery: stage summaries, Lottery Quant shortlist + note + model, Head of Thai Markets chosen tickets with
  per-ticket rationale + note + model, bought/rejected.
- Football: scout candidates, picked fixture + preview + `points` + `by`/`model`, desk stake (market, pick, stake).
- Model League: `GET /api/ai/league` (P&L by model).

## 2. Shared foundation (build first, used by all three rooms)

### 2.1 Server: one agent event stream
- New table `agent_events` (id, at, room, agent, provider, model, stage, text, data JSON, outcome, ref). Keep the
  last ~500 rows. Migration in `schema.pg.sql` and the sqlite path (`server/db.js`), tests in `server/test/`.
- New bus event `agent` over the existing SSE `/api/stream` (`server/app.js` bus ~L32) plus
  `GET /api/ai/feed?room=OT-01|OT-02|VT-02&limit=40` for backfill when a visitor walks in.
- Event shape (short strings only, text <= 140 chars, no secrets, no raw prompts):
  `{ id, at, room, agent, provider: 'claude'|'gemini'|'rules', model, stage, text, outcome, ref, data }`
  stages: `thinking` (start/stop), `signal`, `proposal`, `review`, `veto`, `execute`, `result`, `research`,
  `shortlist`, `decision`, `scout`, `stake`, `settle`, `idle` (carries `nextAt`).
- `thinking` is emitted around each `llm.ask` (start before, stop after) so visuals can show real in-flight work.
- Emit points (no new LLM calls, only reads of values already computed):
  - `server/agents/tradingDesk.js`: quant note + tilts (~L273-285); each desk action with rationale before the
    gateway (~L218/L298); gateway rejections; Risk Officer vetoes + memo (~L301-320, L335); fills (reuse `trade`);
    tick start/stop with `nextAt` (~L261, L340); desk memo + conviction (~L330).
  - `server/lottery/institute.js`: run stages as they complete (~L142), Lottery Quant shortlist + note (decide() ~L150),
    Head of Thai Markets tickets + per-ticket rationale + bought/rejected (~L186-196), settlement (~L262).
  - `server/football/service.js`: `scout()` start/finish with candidates + pick + points (~L136-160), `agentTick()`
    stake (~L216-225), `settle()` results (~L184-210).
- Provider attribution always recorded (`'rules'` when the rule book decided), same rule as the Model League in
  CLAUDE.md. Update CLAUDE.md "AI workflow" section when done.
- Cost: the event stream itself calls no model. Do not raise the trading tick frequency. The only new model calls are
  the off-hours research cycle (3.7). Follow the `agent-cost-control` skill.

### 2.2 Client: one shared AI-visuals module (`src/ai/`)
- `feed.js`: subscribes to SSE `agent`, backfills from `/api/ai/feed`, exposes `latest(room)`, `onAgent(room, fn)`,
  `nextAt(room)`, connection-down fallback (show "AI feed offline", never fake data).
- `agentTag.js`: extends the existing `makeTag` agent tag with a thought line (last reason, wraps to 2 lines), a
  provider chip, and a `THINKING` animation (three pulsing dots + screen glow at the PC) driven by `thinking` events.
- `thoughtBoard.js`: ONE canvas-atlas renderer for "decision board" screens (rows: time, agent+model chip, action,
  reason, outcome), redrawn only on new event or every 2 s (same pattern as `theatreScreens.js`). Uses the
  instanced-screen approach from `.claude/skills/threejs-performance`.
- `flowFx.js`: cheap hand-off effects (a travelling light pulse along a floor line between two agents, a stamp
  sprite for VETO / FILLED / BOUGHT / REJECTED, a ticket-slip sprite). One shared instanced mesh, no new lights.
- Colour language everywhere: Claude orange `#ff8a5c`, Gemini blue `#5aa2ff`, rule book grey, outcome green/red/amber.
- All text must pass `voice-and-satire` (corporate euphemisms; never "casino" or "gambling"). Run
  `npm run check:words`.

## 3. OT-01 Trading Floor

Goal: the pit visibly runs on the AI: you can follow a trade from idea to fill.

1. AI DESK BOARD (new, large, over the four PCs by the OT-01 entrance, readable from the aisle):
   - top strip: "NEXT DECISION mm:ss" (real `nextAt`), market open/closed.
   - live feed rows (last ~8): `Chad Whitmore III [CLAUDE] BUY 40 MSFT — 4% of sleeve, momentum 1.0, under the
     20% cap — FILLED @ 508.67`, vetoes in red with the Risk Officer's reason, rejections amber.
   - Desk A vs Desk B scoreline bars (sleeve P&L) + Model League mini-table (Claude / Gemini / Rule book). Data:
     existing `/api/ai/league` and `/api/firm/book`.
2. Agent upgrades (keep the 4 characters, make them legible and honest):
   - tag gets the reason line and a provider chip; `THINKING` pose while a `thinking` event is open (head down at PC,
     screen glow, dots), `DECIDED` pose when it ends.
   - hand-offs are physical: Quant publishes a note, a light pulse runs Quant -> Desk A and Desk B; each desk sends
     its proposed orders to the Risk Officer (pulse + ticket slips); Risk stamps each `VETO` (red, with reason on the
     board) or `CLEARED`; cleared orders walk/pulse to the pit and the matching pit board row flashes in the agent's
     colour. Stroll routes stop being random: an agent strolls only while idle and heads to the right place for its
     next job.
3. Pit integration: the firm-book board in the pit (`tradingScreens.js` / `liveData.js`) colour-stripes each position
   by owning desk/model (orange / blue / grey rule book). Needs a `sleeve`/`desk` field added to `/api/firm/book`
   positions (derivable from `trades.agent`, already used to rebuild sleeves).
4. Walk-up card: standing within ~4 m of an agent shows a floating read-only card with that agent's last 5 decisions
   (reasons + outcomes). Visitors cannot talk to agents (CLAUDE.md); the card is read-only.
5. Files: `src/characters/aiTraders.js`, `src/floors/tradingFloor.js` (aiDesks + board mount),
   `src/world/tradingScreens.js`, `src/liveData.js`, new `src/ai/*`, server emit points above, `/api/firm/book`.
6. DRAMATIC VETO (owner decision 5). On a `veto` event: a big red VETO stamp slams down over the rejected order slip
   (scale-punch + screen shake of the board only, never the camera), a short alarm-bell sting (see the audio note in
   section 6), the Risk Officer stands up and points, 2-3 nearby pit traders react (arms up / cheer / groan, reusing
   existing crowd poses), and the board row turns red with his one-line reason. Deadpan copy on top of the loud event,
   e.g. "VETO. Concentration is a feeling, and we feel it." Fills get a smaller green FILLED stamp and a bell tap. All
   copy must pass `voice-and-satire`. No camera hijack, no blocking the walkway.
7. OFF-HOURS RESEARCH (owner decision 6): when the market is closed (nights, weekends, holidays) the agents do
   MARKET RESEARCH and NEWS RESEARCH instead of standing idle, on a very small budget.
   - Cadence: one research cycle every 2-3 h while closed (set in config), none while the market is open (the
     normal 15-min tick owns that time). The existing "60 min closed" trading tick stays; research is a separate job.
   - Roles: Quant (Gemini) = market research (overnight futures/after-hours moves, sector moves, regime read from the
     data already fetched); a NEWS DESK role played by Quant + Head Trader = news research (headlines -> affected
     symbols -> bullish/bearish/ignore with a one-line reason). Risk Officer reviews the research for the next open
     and writes the "open plan" note (what it will refuse to chase).
   - Output: structured JSON only (`headlines[{symbol, headline, source, impact, reason}]`, `plan`, `watchlist`),
     stored as `agent_events` stage `research`, shown on the board and on a RESEARCH WALL (below). It may tilt the
     NEXT-OPEN signals only through the existing clamped quant-tilt mechanism (max +/-0.5, server validates), never
     place orders while closed. Agents propose, the server disposes.
   - News source (free only, verify terms first per `free-data-sources`): Finnhub free `/news?category=general` and
     `/company-news` for the ~15 tracked symbols with the key already loaded; fallback keyless RSS if the free tier is
     missing. Cache 30-60 min. About 20 calls per cycle, well under the free limit.
   - Cost: use Gemini (free tier, already wired) as the default model for research; fallback Claude Haiku with a small
     `maxTokens` (about 700 out). A cycle is roughly 3-4k input tokens plus 700 output = well under $0.001 on Haiku;
     at one cycle per 2.5 h that is under $0.50/month even on Haiku. Add a research sub-budget (proposal $2/month)
     inside the existing cap, metered in `llm_spend` with job `market_research` / `news_research`, and stop research
     (never trading) when the breaker is at its slow/events-only levels. With no keys: rule-book research (top movers,
     biggest gap vs 50-day, headline count by symbol, no LLM) labelled RULE BOOK.
   - Visuals (closed-market mode of the room): the AI DESK BOARD switches to "MARKET CLOSED · RESEARCH MODE", a
     RESEARCH WALL shows the latest headlines as cards (symbol, headline, impact arrow, agent chip, reason), the Quant
     is at the signal table, the Head Trader "reads the tape" (headlines scroll on his PC), the Risk Officer drafts the
     next-open plan, and a countdown reads "MARKET OPENS IN hh:mm" (real). When the market opens the room flips back to
     trade mode with the open plan visible for the first minutes.

## 4. OT-02 Probability Research Institute

Goal: the Thai lottery room shows a research team of named AI at work, even though real runs are rare.

1. Put the two key agents in the room as characters with the same tag system: Lottery Quant (Gemini) and Head of
   Thai Markets (Claude), at command desks on the draw platform front, so they are the first people you see from
   the portal. The generic lab-coat quants stay as background staff.
2. PIPELINE RAIL: the 7 research stages (ingestion, randomness audit, feature engineering, model fit + walk-forward
   backtest, Dynamic Model Averaging, null Monte Carlo, portfolio construction) become 7 physical stations along the
   platform edge or the portal aisle. A station lights as its stage runs/finished, with its real timing and one-line
   summary. Data is already in `run.stages` (`lottoFeed.js`).
3. DECISION BOARD (replaces the 9 px line): Lottery Quant shortlist with reasons, Head of Thai Markets chosen tickets
   (BOUGHT / REJECTED, per-ticket rationale), the note, spend, model chips. Held certificates appear as physical
   ticket slips filing into a glass "held certificates" rack with a live count; on settlement they resolve green/red
   against the Drawn Numbers rack the robot already fills.
4. REPLAY LOOP (needed because real activity is rare): while no live run is happening, the room replays the latest
   stored run's stages and decision on a schedule (e.g. every 10 min), clearly labelled
   `REPLAY · run #5 · decided 3 h ago`. A live run or decision always pre-empts the replay and is labelled LIVE.
   Show the real countdown to the next draw and to the next scheduled research run.
5. Files: `src/floors/probability.js`, `src/floors/theatreScreens.js`, `src/world/lottoFeed.js`, new `src/ai/*`,
   `server/lottery/institute.js` (emit stage events as they complete, thinking around the two `llm.ask` calls).

Acceptance: 10-second test (including REPLAY vs LIVE honesty); both named agents visible from the portal; the board
text is readable at 10 m; the existing robot draw and monitors keep working.

## 5. VT-02 Sports Analytics Arena

Goal: the scouting and the desk's stake are things you can watch happen.

1. Give the two agents a place and a body: Fixture Scout (Gemini) and Sports Desk agent (rule book unless noted) at an
   "Analytics Desk" on the pit edge (or at the arrivals hall by the grand stair; see open question).
2. SCOUT SEQUENCE (on a real `scout` event): the Scout's light pulse sweeps the candidate fixtures on the side big
   screens (they already show upcoming fixtures), then locks onto the winner; the centre-hung stack plays a short
   "MARQUEE LOCKED" animation (crests, reason points, "picked by Fixture Scout · gemini-3.1-flash-lite" or "RULE
   BOOK"). Real data only, real crests (no new fetches).
3. DESK STAKE: when `agentTick` opens a position, a ticket prints at the Analytics Desk and appears on a Desk Book
   board (market, pick, stake, house price, desk liquidity). On settlement the ticket resolves green/red with the real
   result and the P&L updates. Honest idle state: "next scout <= 3 h, next result poll mm:ss".
4. Files: `src/floors/sportsArena.js`, `src/world/broadcast.js` (media/feature screens), `src/floors/arena.js`
   (placement anchors only), new `src/ai/*`, `server/football/service.js` (emit scout/stake/settle).
5. PITS NEAR ARRIVAL + MULTIPLIED AGENTS (owner decision 3). Real agents: only 2 (Fixture Scout on Gemini, Sports
   Desk agent on the rule book). The arena has many private boxes and pit desks to fill, so each real agent gets a
   visible "ANALYTICS POD" of look-alike analysts:
   - Real agents sit at the main pit desks nearest the arrivals hall / grand stair (first thing you see on entry),
     with the full tag (name, provider chip, thought line, live status).
   - Pods fill the boxes and the other pit desks, ~12-16 analysts each, instanced and cheap. Each pod analyst mirrors
     the REAL agent's current state (thinking / scouting a screen / printing a ticket / idle) with a small delay and
     variation, so the whole room visibly "leans in" when the real agent works.
   - HONESTY RULE (non-negotiable): pods are labelled so nobody believes they are extra live AIs. Real agents wear the
     full LIVE AI tag; pod analysts wear a small grey tag `ANALYTICS POD · mirrors Fixture Scout` /
     `... mirrors Sports Desk`. The Sports Desk pod is labelled RULE BOOK. They never display decisions of their own,
     only the real agent's last decision. This is the dramatic effect without inventing AI activity.
   - Performance: one InstancedMesh per pod per section (spatially chunked), shared animation state, no per-analyst
     tags (a single shared tag sprite per pod or per box), obey the arena's 400 draw-call hard limit.
6. Interaction (owner decision 2): walk-up card within ~4 m of a real agent or a pod (pod cards show the mirrored
   agent's last decisions) AND press E for the full history panel (read-only for visitors).

Acceptance: 10-second test; scouting and stake events visible within 1 s; pods react to real events only; pods are
clearly labelled; the arena stays inside its 400 draw-call hard limit; Phase-1 look preserved.

## 6. Constraints for the build chat

- Audio: dramatic veto/fill stings are new sounds. Check how the project plays ambient audio today (trading-floor
  shouting and bells) and reuse it; keep stings short, quiet by default, and mutable; none may play when the player
  is on another floor.
- The new off-hours research (3.7) is the ONLY place that adds LLM calls, and only inside its own small sub-budget,
  metered per job, behind the existing circuit breaker (`agent-cost-control` skill). Everything else is read-only
  visuals.

- Read first: `CLAUDE.md` (AI workflow section), skills `threejs-performance`, `agent-cost-control`,
  `voice-and-satire`, `character-style`, `free-data-sources`, `phase-verification`, `greybox-layout`.
- Server is authoritative; visuals are read-only. Never let a visual action trigger money movement.
- Free data only; no new paid sources; no new LLM calls; do not change tick cadence or cost caps without asking.
- Low graphics mode must still show tags, boards and stamps (only glow/shadows/lamp lights are dropped).
- Instancing and shared atlases; no new point lights; redraw canvases on events, never per frame.
- Keep Model League fields (`model` on every AI money decision) intact; the feed adds attribution, never removes it.
- Update the CLAUDE.md "AI workflow" section (new event stream, new rooms' visuals) and the `agent-cost-control`
  cost note (still $0 added).

## 7. Build order and verification

1. Shared server feed + tests (`agent_events`, SSE `agent`, `/api/ai/feed`, emit points). Gate: `npm test` green;
   `curl /api/ai/feed` shows real rows after one tick.
2. Shared client `src/ai/*` with a debug page/hook to inject a fake event in dev only (never in production).
3. OT-01, then OT-02, then VT-02 (one at a time, review after each).
4. Verification per `phase-verification`: run the app, screenshots of each room mid-event, frame-rate + draw-call
   numbers, the 10-second test written down per room, and a no-keys run showing RULE BOOK labels.

## 8. Owner decisions (2026-11-19) — these override anything above that disagrees

1. OT-02 rarity: FINAL — the free option. A labelled REPLAY loop (section 4.4), no extra research and no extra LLM
   calls for OT-02. Do not build a between-draws scan.
2. Agent interaction: BOTH. A read-only walk-up card within ~4 m AND press E for a full decision-history panel.
   Visitors still cannot talk to agents (CLAUDE.md); only CEO/admins converse. The E panel is read-only for visitors.
3. VT-02: the agents stand at pits near the arrival (the arrivals hall side of the bowl). There are only 2 real
   agents (Fixture Scout on Gemini, Sports Desk agent on the rule book), so they are MULTIPLIED for dramatic effect
   to fill the private boxes and the pit desks. See 5.5 for the honesty rule that keeps this truthful.
4. Language: English only on every board, tag and card.
5. Vetoes are DRAMATIC (satire, deadpan face on a loud event): red stamp slam, alarm-bell sting, the Risk Officer
   rises, nearby traders react. See 3.6.
6. OT-01 off-hours: when the market is closed the trading agents do MARKET RESEARCH and NEWS RESEARCH on a very small
   budget. See 3.7 (this section replaces the idle "nothing to do" state).

## 9. Build defaults (owner said go; no further questions needed)
1. News source for 3.7: Finnhub free news with the existing key (check its terms first per `free-data-sources`);
   keyless RSS fallback.
2. Research sub-budget: $2/month inside the existing cap, Gemini free tier first.
3. OT-02: replay only (decision 1).
If something here turns out to be impossible, pick the cheapest safe alternative, note it in the final report, and
keep going; do not stop to ask unless money, safety or the scope limit (OT-01, OT-02, VT-02 only) is at stake.
