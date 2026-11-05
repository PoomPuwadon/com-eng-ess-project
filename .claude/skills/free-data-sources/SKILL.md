---
name: free-data-sources
description: The free real-world data sources for the firm (US stocks, football fixtures/results/odds/crests, Thai lottery, simulated Muay Thai and horse racing) — chosen APIs, free-tier limits, attribution, polling schedules, caching, fallbacks, and the hard rule never to use a paid tier. Use whenever writing or changing code that fetches, caches, displays or settles on external data, or when picking/replacing a data provider.
---

# Free Data Sources

## 0. Hard rule

**Never sign up for, enter payment details for, or write code against a paid tier.** No "trial"
that converts to paid, no card on file, no paid add-on endpoint "just for testing". If a feature
needs data only a paid tier has, design around it (cache, lower frequency, derive, simulate) or
tell the user it can't be done for free. Signing up for any account is the user's job — ask them
to create the free key and put it in `.env`; never create accounts yourself.

## 1. Verify before coding

The limits below are the last known free-tier terms. Free tiers change often. Before Phase 3
(stocks) and Phase 4 (football, lottery) code is written: re-read each provider's current pricing
and terms page, update this file with the date checked, and flag any change to the user.

| Provider | Last verified | Re-verify |
| --- | --- | --- |
| all | not yet (written 2026-11-05 from prior knowledge) | before first use |

## 2. Architecture rules (all sources)

- **Only the server calls providers.** Clients never hold API keys and never call providers.
- One **fetcher per provider**, run by the server scheduler, writes normalised rows into the DB
  (`quotes`, `fixtures`, `odds`, `results`, `lottery_draws`). Everything else reads the DB.
- Each fetcher has a **request budget counter** (per minute / day / month as the tier defines)
  persisted in the DB, checked *before* every call. At 90 % of a budget the fetcher drops to the
  minimum schedule; at 100 % it stops until the window resets. Never "retry until it works".
- Retries: exponential backoff (30 s, 2 min, 10 min), max 3, each attempt counted in the budget.
  Honour `Retry-After` and 429s.
- Every stored row carries `source`, `fetched_at`, and `as_of` (provider timestamp). UI shows a
  staleness label when data is old ("Delayed 15 min", "Prices as of 09:40").
- Provider adapters implement one interface per domain (`QuoteProvider`, `FixtureProvider`,
  `OddsProvider`, `LotteryProvider`, `FightCardProvider`, `RaceCardProvider`) so a fallback or a
  future real source swaps in without touching game code.
- Keys in `.env` (gitignored), names like `FINNHUB_API_KEY`. `.env.example` lists them with empty values.

## 3. Sources

### US stocks — Trading Floor

| | Choice |
| --- | --- |
| Primary | **Finnhub** free tier — `/quote` for US symbols. ~60 calls/min (last known). Free plan is for personal/non-commercial use; check terms |
| Fallback 1 | **Twelve Data** free (~8 calls/min, ~800/day) |
| Fallback 2 | **Alpha Vantage** free (~25 calls/day) — end-of-day/emergency only |
| Fallback 3 | Last cached prices, flagged "Market data delayed" |
| Attribution | Show the provider name on the trading floor's "Data" plaque and in the about/credits screen, plus whatever the provider's terms require |

Schedule: firm tracks a fixed universe of ≤ 40 symbols (indices ETFs + the firm's open positions).
Round-robin at ≤ 40 calls/min (⅔ of the limit) during US market hours (09:30–16:00 America/New_York,
weekdays, exchange holidays from a static calendar) → each symbol refreshed every ~1 min. Outside
market hours: one refresh per symbol at close, then nothing; the ticker keeps scrolling last values
(the floor shouts 24/7 regardless). 15-minute delayed data is acceptable and labelled as delayed.

### Football — fixtures, results, crests

| | Choice |
| --- | --- |
| Primary | **football-data.org** free tier — Premier League (PL), La Liga (PD), Bundesliga (BL1), Serie A (SA), Ligue 1 (FL1), Champions League (CL). ~10 calls/min. Scores on the free tier may be delayed |
| Not on that free tier | Europa League, Conference League → use The Odds API `/scores` (below) for their results, and its event list for fixtures |
| Fallback | **TheSportsDB** free key (fixtures/results/badges, limited) ; API-Football free (~100 req/day) only if its free plan still covers the current season — verify |
| Crests/logos | `crest` URLs from football-data.org team objects. Cache the image files server-side (or proxy with long cache headers); do not hot-link at scale. Fall back to a neutral shield with the club's short name |
| Attribution | Credit "Football data provided by football-data.org" in the arena credits screen and about page (check their terms for exact wording). Club crests are the clubs' trademarks — display only, unmodified, no implied endorsement |

Schedule: fixtures per competition every 6 h (6 calls / 6 h). On match days, one `/matches` call
per minute from 15 min before the first kickoff until 30 min after the last final whistle (covers
all subscribed competitions in one call). Results are final only when status = `FINISHED` and
re-checked once 30 min later before settlement.

### Football odds

| | Choice |
| --- | --- |
| Primary | **The Odds API** free tier — ~500 credits/month. Cost per call ≈ markets × regions. Sports keys include EPL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, UEL, UECL |
| Markets on free tier | `h2h` (1X2), `totals`, `spreads` (featured markets). Pre-match only for us |
| Attribution | Show bookmaker names next to their prices, as returned |

Budget plan (500 credits/month): reserve 50; `/sports` list is free; each odds call with
`markets=h2h,totals&regions=eu` costs ~2 credits. Fetch only competitions with fixtures in the next
72 h, once per day (≈ 8–12 credits/day ≈ 300/month), plus UEL/UECL `/scores` once per match day
(~2 credits each). A monthly credit ledger in the DB enforces the cap. Odds older than 36 h are
frozen and the market shows "Pricing under review" until refreshed.

Bet types:
- **Real bookmaker prices**: 1X2, over/under (the returned lines), handicaps (spreads) when present.
- **House-derived prices** (clearly labelled "House model"): BTTS, correct score, double chance,
  draw no bet, extra over/under lines, half-time result, HT/FT — derived from a Poisson goal model
  calibrated to the bookmaker 1X2 + totals prices, with the house margin from the
  `leisure-rules` skill. These settle on football-data.org scores (full-time and half-time).
- **Disabled** unless a free source that also provides *settlement data* is confirmed: goalscorers,
  corners, cards. Don't offer a market you can't settle.

### Thai Government Lottery — Probability Research Institute

| | Choice |
| --- | --- |
| Primary | Official Government Lottery Office (GLO) website results (glo.or.th). Use its JSON results endpoint if one is publicly reachable; otherwise parse the official results page. Verify the endpoint at build time |
| Fallback 1 | A community mirror API of the official results (e.g. open-source "thai-lotto-api" projects) — cross-check against the official site when available |
| Fallback 2 | Admin manual entry of the official numbers, written to the audit log, with a second admin/CEO confirmation |
| Attribution | "Results: Government Lottery Office of Thailand" on the results wall |

Draws: normally the 1st and 16th of each month (dates shift around holidays — read the next draw
date from the source, don't hard-code). Schedule: once a day normally; on draw day every 5 min
from 14:30 to 17:00 Asia/Bangkok until all prize tiers are present, then stop. Settle only when the
full result set has been read twice, 10 min apart, and matches.

### Muay Thai and horse racing — simulated

No free structured source with fight cards + results (Muay Thai) or racecards + results (horse
racing) is known. Simulate:
- `SimFightCardProvider`: generates Lumpinee-style cards (real-style Thai ring names with gym
  names, weights in lbs, 5 × 3-min rounds), schedules them on a timetable, produces results via
  the fight engine. Seeded RNG, results decided server-side at fight start.
- `SimRaceCardProvider`: Thai-style horse names, jockeys, barrier draws, form lines; race engine
  decides finishing order at the off.
Both implement the same interfaces a real provider would, and every simulated event is flagged
`simulated: true` in the DB so a real feed can replace it later without migration.

## 4. Failure handling summary

| Source down / terms change | Behaviour |
| --- | --- |
| Stocks | Switch to next fallback automatically; if all fail, freeze prices with a "delayed" banner; agents may not open new positions on stale (> 1 h) prices |
| Football fixtures/results | Fallback provider; if none, open bets stay open (never guess a result); admins can settle manually with audit |
| Odds | Freeze markets (no new bets) when prices are stale; house-derived markets also freeze |
| Lottery | Fallback mirror → manual admin entry with confirmation; tickets stay pending until settled |
| Any provider moves the needed data to paid | Stop using it, switch to fallback or simulation, tell the user. Never upgrade |
