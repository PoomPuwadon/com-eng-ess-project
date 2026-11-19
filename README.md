# FINANCIAL FIRM

**Live:** https://com-eng-ess-project.onrender.com (free hosting: the first load after a quiet period can take about a minute)

A walkable 3D web experience of an absurdly luxurious (and entirely fake) financial firm, housed in two connected towers.
It is **not a game**: there is no score and no ending. AI employees trade, research and place positions using **real-world data with
fake money**, 24/7, while real players walk through the building, watch, take part, and (if they are staff) run everything.

> **Fake money only.** There are no deposits, purchases, withdrawals or payouts of real money, ever.
> **Free data only.** Every data source is used on its free tier, and the code works around the limits (caching, scheduled polling).

The tone is loud satire of finance excess, delivered with a straight corporate face. The in-world copy never uses the obvious words for what
the Visitors' Tower is; it is officially a "wellness" facility.

## What is in it

- **Grand Lobby**, **Office Tower** (trading floor, departments, control floor) and **Visitors' Tower** (leisure suite, card salon, football arena,
  combat arena, racing arena, Thai lottery institute), a **glass bridge** between the towers, and a **basement vault**.
- **Real data:** US stock prices (Finnhub + Yahoo, delayed), Thai lottery results (Government Lottery Office), football fixtures, results and crests
  (football-data.org). Muay Thai and horse racing are simulated, built so a real source can be swapped in.
- **AI desks:** two rival trading desks (Claude v Gemini), a Thai markets desk, a sports desk. Models propose, the server disposes: every money action
  passes server-side limits. Without any API key the firm still runs, on deterministic rule books.
- **Multiplayer:** up to 50 players, text chat, roles (Visitor, Admin "Staff", CEO), Tour Mode, an executive console (`Alt+F6`).
- **Phones work too:** touch joystick, drag to look, and a tap button for anything you would press `E` for on a PC.

## Quick start (local)

**Requirements:** Node.js **22.5 or newer** (the server uses the built-in `node:sqlite`; developed on Node 24) and npm.

```bash
npm install
npm run dev
```

`npm run dev` starts the game server (port **8787**) and the Vite client (port **5173**) together; Ctrl+C stops both.
Open <http://localhost:5173>. Vite proxies `/api` and the websocket to the game server.

With **no configuration at all** it runs fully: a local SQLite file in `data/`, live free data where no key is needed, and rule-book agents.
Add keys only to switch things on (below).

### Configuration

Copy `.env.example` to `.env.local` (git-ignored) and fill in what you want. Every variable is optional.

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns the Claude-routed agents into real LLM agents (default model `claude-haiku-5-5`). |
| `GEMINI_API_KEY` | Same for the Gemini-routed agents (free tier). With both keys, Claude and Gemini run side by side. |
| `AGENT_PROVIDERS` | Per-agent override, e.g. `head_trader=gemini,quant=claude`. |
| `LLM_MONTHLY_CAP_USD` | Hard monthly spend cap across both providers (default `75`). At 70 % it slows, at 90 % events only, at 100 % it stops and falls back to rules. |
| `FINNHUB_API_KEY` | Free-tier stock quotes (charts still come from Yahoo's public endpoint). |
| `FOOTBALL_DATA_API_KEY` | Free-tier fixtures, results and crests. Without it the arena shows clearly flagged simulated fixtures. |
| `ADMIN_PASSWORD` | Password for the `Alt+F6` executive console. **Defaults to `admin123`: change it.** |
| `DATABASE_URL` | Supabase Postgres (session-pooler URI). When set, Postgres is the database of record and SQLite is only the in-memory working set. |
| `GAME_PORT` | Game server port (default `8787`). |
| `STARTING_BALANCE_MINOR` | Starting balance for new visitors in minor units (default `1000000` = ¤10,000.00). |
| `SIM_ALLOW_CLOSED_FILLS` | Testing only: let stock orders fill while the US market is closed. |

Secrets are read on the server only. They are never sent to the browser or logged. Never commit a real `.env` file.

### Supabase setup (database)

Supabase Postgres is the database of record when `DATABASE_URL` is set. At startup the server loads every table from Supabase into an
in-memory SQLite working set, and replicates every row change back (about every 1.5 s, and on shutdown). Accounts, the append-only
money ledger, orders, tickets and agent data therefore survive any restart or redeploy.

1. Create a free project at <https://supabase.com>. In the creation form untick **Enable Data API** and
   **Grant API access to new tables automatically**, and tick **Enable RLS on new tables automatically**
   (only the server talks to the database; the public API needs no access).
2. Click **Connect** (or *Project Settings → Database → Connection string*), choose **Session pooler**, and copy the URI.
   **Do not use the direct `db.<ref>.supabase.co` string**: it is IPv6-only and fails on hosts such as Render.
3. Replace `[YOUR-PASSWORD]` with your database password (no brackets). URL-encode symbols: `@` is `%40`, `#` is `%23`, `/` is `%2F`.
4. Put it in `.env.local` (and in your host's environment settings):

   ```
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

5. Start the server. The log should say `Supabase Postgres connected · loaded N rows`. On a fresh database the server creates every
   table itself from [`server/schema.pg.sql`](server/schema.pg.sql) (row-level security on, no public access). `N` is 0 on the first boot.

If it says `cannot reach Supabase Postgres`, check that you used the **session pooler** URI and that the password is URL-encoded.

### Signing in and roles

- On first load you can continue as a guest, or sign up with a name and password (everyone starts as a **Visitor** with a starting balance).
- To act as **Admin** or **CEO**, open the executive console (`Alt+F6`) and enter `ADMIN_PASSWORD`. Only a CEO can use the Treasury tab
  (add, remove or set a guest's balance) and Tour Mode.

### Controls

| | PC | Phone |
|---|---|---|
| Move | `W A S D` (`Shift` to run) | Left joystick (push to the rim to run, or toggle RUN) |
| Look | Hold right mouse and drag, wheel to zoom | Drag the 3D view, pinch to zoom |
| Use / enter | `E` near a lift pad, table or terminal | Tap the gold "Tap · ..." button that appears |
| Help | `H`, or the Help button (top left) | Not shown (the help panel is closed on join) |

`M` opens the Markets terminal, `L` the Probability Research Institute, `F3` a frame-rate overlay, `G` toggles Low / High graphics.

## Useful commands

```bash
npm test                 # server test suite (node:test)
npm run build            # production client build into dist/
npm run server           # run only the game server (serves dist/ if it has been built)
npm run check:words      # fails if a banned word appears in player-facing strings
npm run reset            # start the notional economy over, keeping cached real-world data (stop the server first)
```

## Deploying

The game server also serves the built client, so one process is enough:

1. Build: `npm install && npm run build`
2. Start: `npm run server`
3. Set the environment variables from the table above on the host (on Render, *Environment → Add from .env* takes a whole `.env.local`). The server listens on `GAME_PORT` (default `8787`), so on a host that
   assigns a port, set `GAME_PORT` to match it.
4. Set `DATABASE_URL` for a database that survives restarts and redeploys. Without it, data lives in a local SQLite file, and on a host
   with an ephemeral disk it is lost on every deploy. With `DATABASE_URL` set, uploaded Arena highlight videos are kept in Supabase too.

The live deployment runs this way on Render (free web service, branch `main`, build `npm install && npm run build`, start `node server/index.js`)
with Supabase Postgres. On Render also set `NODE_VERSION=24` and `GAME_PORT=10000`. Never set `DB_FILE` there: it would point the working
set at Render's temporary disk. A free Render instance sleeps when idle; a free uptime monitor pinging the URL every 5 minutes keeps it awake.

## How it is organised

```
src/        browser client (Three.js): floors, characters, apps (terminals), multiplayer UI, touch controls
server/     authoritative game server: ledger, treasury, market, football, lottery, agents, realtime hub, storage
server/test automated tests
scripts/    dev runner, reset, banned-word check, presence load test
docs/       project report and one-page summary
.claude/    project skills (layout, money ledger, cost control, voice, data sources) used while building with Claude Code
```

Key rules, in short (the full version is in `CLAUDE.md` and the skills):

- **Money:** one double-entry ledger; every movement has a from, a to, an amount and a reason; the vault total is real and every budget
  transfer is a physical cash-robot trip.
- **Agents propose, the server disposes:** model output is untrusted. Hard limits, daily caps and privileges are enforced in code, and every
  decision records which model made it so the Claude v Gemini v rule-book league stays truthful.
- **Cost control:** hundreds of background staff never make their own model calls. Calls are batched, cached and capped.

## Data sources and attribution

- US stocks: Finnhub free tier and Yahoo Finance public charts (delayed).
- Thai lottery: results from the Government Lottery Office of Thailand (glo.or.th).
- Football: football-data.org free tier, including club crests; keep their attribution if you redistribute.

This is a satirical simulation for fun. Nothing in it is financial advice.

## Team

Buddharat Attipa (6830249921) · Puwadon Thammavimutti (6830275121) · Mathis Thayathorn Dubas (6830284821)

Computer Engineering Essential, Final Project 2026/1 (Free Track). Released under the MIT licence, see [LICENSE](LICENSE).
