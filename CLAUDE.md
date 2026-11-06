# PROJECT: [FIRM NAME] — A Walkable 3D Mock Financial Firm

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