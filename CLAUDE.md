# PROJECT: FINANCIAL FIRM — A Walkable 3D Mock Financial Firm

## What this is
Build a multiplayer, walkable 3D web experience of an absurdly luxurious financial
firm housed in two connected towers. It is NOT a game: there is no winning, losing,
score, or ending. It is a living simulation that runs 24/7. AI employees work,
trade and bet using REAL-WORLD DATA with FAKE MONEY, and real players walk
through it, gamble, watch, and (if they are admins) control everything.

Walking around the building is the most important experience. Every room should
feel alive, busy, and worth exploring.

Tone: LOUD satire of finance excess. Think Wolf of Wall Street energy, played with a
straight corporate face. The firm never admits what anything really is: the casino
tower is officially a "wellness" facility, and all signage and UI copy use corporate
euphemisms (e.g. "Executive Leisure Suite", "Sports Analytics Lounge",
"Liquidity Recreation"). Never use the words "casino" or "gambling" in the UI.

## Hard rules
- FAKE MONEY ONLY. No real-money deposits, purchases, withdrawals or payouts, ever.
- FREE DATA ONLY. Do not use any paid API tier or paid data source. Where a free
  tier has limits (rate limits, pre-match odds only, delayed prices), design
  around the limit (caching, scheduled polling) rather than upgrading.
- Stylised 3D (clean, polished low-poly, like a luxury architectural model).
  Not photorealistic. Must run smoothly in a desktop web browser.
- Up to 50 concurrent real players.
- Sign-in with username + password. Anyone who signs up is a Visitor by default.
- Text chat only between players. No moderation tools.

## Roles
OWNER (hidden): a database-level account that can never be kicked or demoted and
can restore any account's access. Not visible in-game.

CEO: exactly ONE CEO exists visually in the building. The CEO can control
everything from anywhere. Employees do not react to the CEO's presence.

ADMINS ("Staff"): join by invite only. They have full CEO-level permissions,
including overriding the CEO, kicking the CEO, and kicking each other.
They appear as executives in suits with a visible badge, and they are never shown
as a second CEO. Conflicting edits: last change wins. Keep a visible audit log of
who changed what and when.

VISITORS: the default role. They get a starting balance of fake money, set by the
CEO/admins. When broke, they stay broke until the CEO or an admin tops them up or
resets them. Visitors can only access the Visitors' Tower and lobby unless the
CEO/admin grants them clearance (see Glass Bridge).

## Building layout

### Grand Lobby (ground floor, shared)
One enormous, OVER-THE-TOP luxurious lobby: marble, gold, giant chandeliers,
water features, art, double-height ceilings. It splits into a staff side and a
visitor side, each with its own elevator banks.
Include: reception desk, concierge, security checkpoint with body scanners,
staff turnstiles, visitor gates, coat check, VIP lounge, a charity donations
wall (for PR), and a lost-and-found display full of luxury watches. Add more
lavish details freely.

### Office Tower (staff side)
- TRADING FLOOR: a Wall Street-style trading pit using REAL US stock data
  (15-minute delay acceptable). Hundreds of screens showing live tickers,
  charts and the firm's REAL open positions and P&L, so anyone walking in can
  see what the firm is trading and how it's going. Constant shouting of orders
  and bell ringing, 24/7, including when markets are closed. Visitors with
  clearance may watch but not trade.
- DEPARTMENT FLOORS: Sports Desk, Casino Operations, Thai Betting Desk,
  Security HQ.
  SECURITY HQ (12 m tall): two entrances from its lift hall. A luxury
  private-security agency side (client reception, waiting salon, guard
  lounge, guard deployment bay with threat board, cash-robot escort depot)
  and a corporate-prison side (exit processing straight into a roll-call
  yard, a beating area, one big glass holding cell, guard catwalks).
  No CCTV wall here: that stays in the control floor's monitoring room.
- CONTROL FLOOR (top floor):
  - CEO office (can summon any employee to it)
  - CFO office
  - Legal team
  - IT team
  - HR (runs firings)
  - Luxurious meeting room
  - Security monitoring room (wall of camera feeds of the whole building)
  - Private cigar lounge / bar
  - Trophy and art wall
  - Master dashboards: every department's status, budget, spend, earnings and
    reports from its AI agents.

### Visitors' Tower (public side, officially "wellness")
- CASINO FLOOR: Vegas-style, vast. Slots, roulette, blackjack, baccarat, craps,
  and more. Players play against house bots; table games may also be PvP.
- POKER ROOM: Venetian-style, opulent. Player vs player and player vs house
  bots. House bots are world-class: strong but beatable.
- FOOTBALL ARENA: sized like an indoor basketball arena (not a full stadium),
  inspired by the Bernabéu. Hundreds of seats, and EVERY seat has its own
  screen and betting terminal. Huge centre-hung screens suspended from the
  ceiling, plus a giant round screen in the ceiling, showing big live matches
  and scorelines with real team logos.
- MUAY THAI ARENA: a full replica of Lumpinee Boxing Stadium, in stylised form.
  Central ring, tiered seating around it, ringside betting, big screens, and
  live fight atmosphere (crowd noise, traditional Muay Thai music).
- HORSE RACING ARENA: a full racing venue inside the tower, with a visible track
  where races are run in 3D, grandstand seating, odds boards, and betting
  windows.
- THAI LOTTERY ROOM: styled as a full quantitative trading firm's calculation
  room. Rows of quants at multi-monitor desks, walls of equations,
  probability heatmaps and "predictive models", whiteboards covered in maths,
  all dead serious and all for the lottery. Visitors buy tickets here and
  watch draw results come in.
All rooms must feel HUGE.

### Glass Bridge
A heavily security-controlled glass skybridge connects the two towers.
The CEO and admins use it freely. Visitors need clearance, which the CEO/admins
can grant or revoke per visitor. Cash robots also cross it.

### Basement
- THE VAULT: visibly holds the firm's cash; displays the real current total.
- SERVER ROOM (belongs to IT).

### CEO Private Elevator
A HUGE private elevator running from the control floor to the vault. The CEO
uses it to give visitors guided tours; on tour, visitors may see everything,
including the control floor, vault and server room.

## Money system
- All firm money lives in the vault. Visitor losses flow into the vault;
  visitor winnings are paid out of it.
- The CEO (or CFO agent, or any admin) sets every department's budget.
- EVERY budget transfer is a physical trip by a CASH TRANSPORTER ROBOT, with a
  floating indicator above it showing the amount carried. Each robot is escorted
  by security guards. Nothing can go wrong in transit. Robots travel between the
  vault and departments, including across the glass bridge, constantly.

## Budget blowout event
When any department exceeds its budget:
1. An alarm sounds throughout the ENTIRE building, audible to visitors too.
2. Security runs to that department and marches the WHOLE department to
   Security HQ (enters through the processing portal).
3. A prison-style roll call in the Security HQ yard: the workers line up on
   numbered spots.
4. The CFO gives a speech from the yard podium. The survivors go back to work.
5. A chunk of that department's background employees are mock-fired: exit
   processing (boxes issued, badges shredded) → wait in the glass holding
   cell → final line-up in the yard (where guards beat some of them up) →
   visibly escorted down and out through the lobby by security, carrying
   boxes of belongings.
6. Replacement hires walk in through the lobby to refill headcount.
This works even when no admins are online.

## AI employees (two tiers)

KEY AGENTS (a few per department):
- Real LLM-driven agents that make their own decisions (trades, bets, odds
  analysis, reports) within their department's budget.
- Write status reports (earnings, positions, spend, situation) to the control
  floor dashboards.
- Can be summoned to the CEO office. They do NOT remember past reprimands.
- OFFLINE PRIVILEGES: set per agent by the CEO, with limits (e.g. daily
  spending cap, max actions per day). Agents without privileges only act while
  an admin is online.
- Visitors can see and approach key agents but cannot talk to them. Only the
  CEO/admins can converse with them.
- No promotion mechanic of any kind.

BACKGROUND STAFF (hundreds):
- Walk around the building, but mostly stay in their own department rooms.
- No decision power.
- Their dialogue is generated cheaply from short periodic "situation summaries"
  written by their department's key agents, based on real current events
  (e.g. today's market moves or match results). Dialogue is Gen-Z style.
  They also gossip about other departments' situations.
- Speak when players walk near them.

Cost control is essential: design the agent loop so hundreds of background staff
do NOT each make their own LLM calls. Batch, cache, and schedule calls, and
estimate monthly LLM API cost for the design.

## Real data sources (free only)
- US stocks: free source, 15-minute delay acceptable.
- Football: top 5 European leagues + UEFA competitions (Champions League,
  Europa League, Conference League). Real fixtures, results and real bookmaker
  odds from free tiers only (pre-match at minimum; live in-play only if free).
  Support as many bet types as the free odds provider offers (match winner,
  correct score, goalscorers, over/under, BTTS, handicaps, corners, etc.).
  Bets settle on real results.
- Team logos: display real official club logos, sourced from the free football
  data API's crest/logo URLs. Comply with any attribution the provider requires.
- Thai lottery: use the real official draw results.
- Muay Thai and horse racing: use real fight cards and race results if a free
  structured source exists. If not, simulate realistic Thai events (real-style
  fighter and horse names, odds, results), built so a real data source can be
  swapped in later. Simulated races and fights are rendered live in their arenas.

## Technical guidance (suggestions — propose better if justified)
- 3D: Three.js or Babylon.js. Use instancing for the hundreds of screens and
  NPCs, level-of-detail, and room-based loading so huge rooms stay smooth.
- Multiplayer: an authoritative real-time server (e.g. Colyseus or WebSockets).
- Database + auth: e.g. Supabase/Postgres.
- A server-side simulation tick that runs the firm 24/7 independent of players.

## Build order

### PHASE 0 — DEMO FIRST (do this before anything else)
Do NOT build detailed 3D yet. Deliver a quick, rough, walkable demo so the
layout can be reviewed and changed cheaply:
- Greybox only: simple boxes, planes and placeholder shapes. No detailed
  models, textures or decoration.
- The FULL building layout: grand lobby with its staff/visitor split, both
  towers with every floor and room listed above, the glass bridge, the
  basement (vault + server room), all elevator banks and the CEO private
  elevator.
- Every room clearly labelled with a floating text sign.
- Rooms at roughly their intended final scale, so it's clear how HUGE they feel.
- First-person or third-person walking, working elevators (simple teleport
  between floors is fine), and the glass bridge walkable.
- Single-player is fine. No sign-in, no real data, no AI agents.
- A few placeholder signs of life: one cash robot box moving vault → a
  department, some capsule "employees" standing in rooms, one fake ticker
  scrolling on the trading floor.
- A simple on-screen minimap or floor list showing where you are.
STOP after the demo and wait for feedback before continuing.

### After the demo is approved
Before writing more code, propose the full architecture, estimate running costs
(hosting, data APIs, LLM calls), and list anything still ambiguous. Then build
in phases, pausing for review after each:
1. Detailed building: replace greybox with the stylised luxury look; sign-in,
   multiplayer presence, text chat, roles and clearances.
2. Money system: vault, budgets, cash robots, dashboards, audit log.
3. Trading floor with real stock data and ambient shouting and bells.
4. Visitors' Tower: casino games, poker (PvP + bots), football arena with real
   odds and logos, Muay Thai arena, horse racing arena, Thai lottery room.
5. AI agents: key agents, situation summaries, background dialogue,
   summoning, offline privileges.
6. Events: budget alarm, roll call, CFO speech, firings and rehires.
## AI workflow (as built — keep this section current when agents, models or routing change)

### Providers and routing — `server/agents/llm.js`
- Two LLM providers run side by side: **Claude** (`ANTHROPIC_API_KEY`, `@anthropic-ai/sdk`, model
  `AGENT_MODEL_TICK`, default `claude-haiku-5-5`) and **Gemini** (`GEMINI_API_KEY`, REST, model
  `GEMINI_MODEL`, a comma-separated fallback chain, default `gemini-3.5-flash,gemini-3.1-flash-lite`;
  free tier). Google retires Gemini ids for new keys (404) and overloads them (503): the chain moves on to
  the next model, and the model that actually answered is what gets recorded. Keys live in `.env.local` only (gitignored),
  never in `.env.example`, never sent to the client or logged.
- Every LLM call goes through `llm.ask({ job, agent, system, user, schema, ... })`, which returns
  `{ data, provider, model }` or `null`. `llm.json()` is the same without the metadata.
- **Per-agent routing**: `ROUTES` in `llm.js` gives each agent a preferred provider
  (head_trader=claude, co_head_trader=gemini, quant=gemini, risk_officer=claude, thai_head=claude,
  lottery_quant=gemini, fixture_scout=gemini). Override with `AGENT_PROVIDERS` in `.env.local`
  (e.g. `head_trader=gemini,quant=claude`). If the preferred provider has no key, the call goes to
  the other one. Jobs with no agent use `LLM_PROVIDER` (default claude).
- **No key / error / refusal / banned word / cost breaker open → `null`**, and every caller falls back
  to its deterministic rule book. The firm always runs, for free, with no keys at all.
- **Cost control**: every response's token usage × the price table → `llm_spend`. One monthly cap
  (`LLM_MONTHLY_CAP_USD`, default $75) and circuit breaker cover both providers (70 % slow, 90 %
  events only, 100 % stop). Free-tier Gemini calls are still metered at list price as an estimate.
  See the `agent-cost-control` skill for rules and the cost estimate.

### Agents (registry: `AGENTS` in `server/agents/gateway.js`)
Agents PROPOSE, the server DISPOSES: model output is untrusted. Every money action passes the action
gateway (privileges, daily caps, max stake), and hard limits are enforced in code.

**Trading Floor** (`server/agents/tradingDesk.js`, one tick every 15 min market open / 60 min closed):
1. **Quant** (Gemini): code builds the signal table from real daily bars (momentum score + defensive
   score). The LLM may tilt up to 5 scores, clamped to ±0.5, and writes the research note.
2. **Two rival trading desks**, each running its own **sleeve** (50 % of the book's NAV), each on its
   own model, thinking in parallel:
   - Desk A, **Head Trader** (Claude), momentum style.
   - Desk B, **Co-Head Trader** (Gemini), defensive-quality style.
   Each sees its own sleeve, the signals, its rule-book baseline, the rival desk's scoreline and its
   own rejected orders. A desk can only sell shares its own sleeve holds. Sleeves are rebuilt by
   replaying each desk's own fills (`trades.agent`), so there is still ONE ledger account
   (`DEPT:trading_floor`) and one positions table.
3. **Risk Officer** (Claude): hard limits in code first (20 % per name per sleeve and firm-wide,
   95 % invested, sleeve cash, stale prices, one working order per symbol per desk); then the LLM
   reviews the surviving orders and may only **veto** (never add or enlarge). Survivors execute,
   sells first.

**Thai Markets** (`server/lottery/institute.js`, once per draw): the research pipeline is code;
**Lottery Quant** (Gemini) ranks the candidate certificates into a shortlist and writes the note;
**Head of Thai Markets** (Claude) picks 0–8 certificates from the candidates and buys them through
the gateway.

**Sports Desk** (`server/football/service.js`): **Fixture Scout** (Gemini) picks the marquee fixture.
The desk's stake is still the rule book.

**Chart Desk** (`server/agents/chartAnalyst.js`): visitor-uploaded chart → UP/DOWN verdict (default
provider), labelled demo without a key. In the world it is a physical terminal by the OT-01 portal
(`src/apps/chartKiosk.js`): the UI is drawn on the kiosk's own monitor (ray-cast clicks / taps), charts arrive by paste,
drag and drop or upload (the photo picker on phones).

### The walking AI desk (client only) — `src/characters/aiTraders.js`
- Four live agents stand at PCs just inside the OT-01 entrance and stroll the aisle: Head Trader (Claude),
  Co-Head Trader (Gemini), Quant (Gemini), Risk Officer (Claude). Desks are built in
  `floors/tradingFloor.js` (`aiDesks`, orange glow = Claude, blue = Gemini) at `DESK_X` / `DESK_Z`.
- Big provider-coloured tags (name, role, live status), a floor ring and a spinning marker; tags are rescaled
  per frame to stay the same size on screen from 3 m to 20 m.
- It only SHOWS what the server decides: `order` / `trade` events send the matching agent (`o.agent`) to its
  PC with the order text; a `firm` tick sends the Quant and Risk Officer. Without a server they keep a timer routine.
- Routes mirror `ROUTES` in `llm.js`; change both together. A new trading agent needs an entry in `AI_AGENTS`.

### Model League (Claude v Gemini v rule book) — `server/agents/league.js`
- Every order, fill and certificate records the model that decided it (`orders.model`,
  `trades.model`, `lottery_tickets.model`; `'rules'` = rule book). Agent reports store it as
  `data.model`. Never drop these fields when adding new money decisions: every new AI money action
  must record its model so the league stays truthful.
- Trading P&L is credited to the model that **bought** each lot (FIFO per desk and symbol), with
  realised + unrealised at the delayed price. Thai desk: certificate cost v settled payouts.
  LLM calls and cost come from `llm_spend`.
- Shown by `src/apps/league.js` (`leagueCard`) in the Markets terminal, the Research Institute and
  the Sports Desk; served from `GET /api/ai/league`, and included in `/api/firm/book`,
  `/api/lottery/state` and `/api/football/state`.

### Adding a new AI agent or decision
1. Add it to `AGENTS` (and to `DEFAULTS` privileges if it spends money) in `gateway.js`.
2. Give it a route in `ROUTES` (`llm.js`).
3. Call `llm.ask(...)` with a JSON schema; always keep a rule-book fallback for `null`.
4. Validate everything in code; send money actions through `gateway.check(...)`.
5. Record `model` on whatever it creates and report with `gateway.report(agent, text, data, model || false)`.
6. Add it to the league if it makes or loses money, update this section, and recompute the
   `agent-cost-control` cost estimate.

### AI visuals: the agent feed and the three rooms that show AI at work (docs/ai-visuals-plan.md)
- **Feed** (`server/agents/feed.js`): one attributed event stream, table `agent_events` (last ~500 rows), SSE event `agent`,
  backfill `GET /api/ai/feed?room=OT-01|OT-02|VT-02`. Event: `{ id, at, room, agent, provider: claude|gemini|rules, model, stage, text<=140, outcome, ref, data }`.
  It records values agents already computed and NEVER calls a model or touches money. `thinking` events wrap each `llm.ask` (transient, only when a model is routed).
  Emit points: `tradingDesk.js` (signal, proposal, review, veto, execute, result, filled via the `trade` bus event), `lottery/institute.js` (7 stages, shortlist, per-ticket decision, settle),
  `football/service.js` (scout, stake, settle). `/api/firm/book` positions carry `owners` (desk) for the pit-board stripe. Every new AI decision must emit with its `model`.
- **Off-hours research** (`server/agents/research.js`, `server/market/news.js`): the ONLY added LLM calls. While the US market is closed, one cycle per `RESEARCH_EVERY_MIN` (150):
  jobs `news_research` + `market_research` (Quant, Gemini first) and `open_plan` (Risk Officer), `maxTokens` <= 700, sub-budget `RESEARCH_BUDGET_USD` ($2/month) inside `LLM_MONTHLY_CAP_USD`,
  none once the breaker is at "slow". Free Finnhub news (key present) else Yahoo RSS; headlines are untrusted data (banned words stripped). It never places orders: it can only nudge
  next-open scores through the desk's clamped tilt (+/-0.25 each, +/-0.5 total). No key / budget spent: rule-book research labelled RULE BOOK. Added cost with no keys: $0; with keys well under $2/month.
- **Client** (`src/ai/*`): `feed.js` (SSE + backfill, "AI FEED OFFLINE" when down, never fake data), `thoughtBoard.js` (canvas boards redrawn on events / every 2 s only), `flowFx.js` (stamps, pulses, no lights),
  `agentCard.js` (walk-up card within 4 m + press E history, read-only), `agentActor.js` (stationary live agent), `ot01Boards.js`, `ot02.js`, `vt02.js`. Dev only: `__debug.ai.inject(event)` pushes a labelled fake event for screenshots.
- **OT-01**: AI DESK BOARD (front) and RESEARCH WALL (back) hang at x -58; agents show THINKING, thought lines, pulses; VETO = stamp slam + board shake + bell sting (`sfx.playSting`, mutable via `setStingMuted`) + pit traders react.
- **OT-02** (built into the live floor `drawTheatre.js` area via `ot02.js`): Lottery Quant + Head of Thai Markets at the concourse, pipeline + decision boards, 7 station pads, held-certificates rack, REPLAY of the latest stored run every 10 min labelled `REPLAY · run #N`, LIVE pre-empts.
- **VT-02**: Fixture Scout + Sports Desk agent at the arrivals landing, two boards over the stair axis, scout sweep + MARQUEE LOCKED on the centre stack (`arenaFeed.js` `SCOUT_FX`), 14-analyst ANALYTICS PODS per agent (instanced, labelled NOT A SEPARATE AI, they only mirror the real agent's state).
- **VT-01**: `src/ai/vt01.js` puts 3 rule-book AI hosts on the roulette promenade by the entrance. They walk and watch, never stake (no money logic, no LLM calls, $0). Letting agents actually play is a separate decision (needs the action gateway, caps, `model` on every stake).
- **VT-01 roulette players** (`server/agents/roulettePlayers.js`, `src/ai/vt01.js`): a Claude seat and a Gemini seat really play the roulette engine with their OWN notional bankroll in `kv` (never the ledger: the firm's money is not affected). The model writes a PLAN (up to 30 spins) about every 15 min (job `roulette_plan`, sub-budget `ROULETTE_AI_BUDGET_USD` $2/month, rule-book plan without a key); spins are code every 30 s. Wins/losses pop up over their heads, NET stays on the tag. `GET /api/ai/roulette`.
- **Leisure Suite games** (`server/games/leisure.js`, `src/apps/leisureGame.js`): slots (94.7% RTP), blackjack (6 decks, S17, 3:2, hit/stand/double, no split), baccarat (punto banco, 8 decks) and craps (pass/don't pass) are real server engines settled on the ledger like roulette (player <-> vault; blackjack escrows at the deal). Press E at a machine/table; the panel closes when you walk away or are teleported (CEO). Routes `POST /api/leisure/*`. Idle blackjack hands stand after 5 min (a server restart mid-hand would leave that stake in escrow). Poker salon is not playable yet.
- **Security HQ punishment** (`src/ai/ot04.js`): an UNDERPERFORMANCE BOARD ranks the money-making agents worst first (`GET /api/ai/performance`); the console (Alt+F2, Asset Protection) can call up any key agent (`REVIEW_AGENTS` in `hub.js`, `EXTRA_AGENTS` in `ot04.js`); the agent's own character leaves its desk (`away(id)`) and is the one in the yard (alignment / kinetic feedback / transition suite).
- **CEO**: no player is CEO => there is no CEO. The stand-in NPC CEO and its marker are gone (`ceoMarker.js`).
- **Roulette AI cadence**: one rotation per 15 minutes; every 15 seconds ONLY while the CEO tour is on and the host is on VT-01 (`isFast` in `roulettePlayers.js`, wired to `hub.meta().tour`).
- **Leisure seats** (`src/apps/tableSeat.js`): pressing E at slots / blackjack / baccarat / craps / poker moves the camera to a seat on the real table with printed felt layouts, shoe, discard tray, chip rack, dealt and flipped 3D cards, tumbling dice landing on the server's faces, a spinning reel window and chip stacks. Heads-up Texas hold'em vs a house bot (`server/games/poker.js`: real evaluator, Monte-Carlo equity bot, fixed-limit) settles like blackjack (escrow, vault). Ends on CEO teleport / walking away.
- **Kinetic feedback**: guards beat the called-up agent (two per victim, blows land on a timer, the victim recoils then goes down after ~12 s) in `ot04.js beating()`; the four trading agents are beaten via `aiTraders.js` (`a.beaten`).
