# Sprint: playable roulette, live trading sim, lottery research agents — verification

Date: 2026-11-15 (Sunday — US market closed, Thai draw due 2026-11-16). Machine: Windows 11, Chrome (Claude built-in browser), 1440×900.

## What was built

| Area | Server | Client |
| --- | --- | --- |
| Economy | `server/ledger.js` double-entry append-only ledger (SQLite triggers block UPDATE/DELETE), reconciler, idempotency keys; `server/treasury.js` genesis + cash-robot trips for every department budget | wallet bar with live balance |
| Roulette | `server/roulette.js` European single zero, every inside/outside position, provably-fair seed commitments, Treasury coverage check | played at the real 3D tables in VT-01: `src/world/rouletteTable.js` builds a fully modelled wheel (bowl, maple track, 8 deflectors, rotor with 37 frets and numbered pockets, turret), layout and 3D chip stacks on the table you sit at; `src/apps/rouletteSeat.js` seated camera (layout / overview / wheel), click-the-felt positions, ball trajectory solved to land in the server's pocket |
| Trading | `server/market/*` Yahoo chart endpoint (keyless) or Finnhub (if key), NYSE calendar, order book with escrow, queued orders while closed | `src/apps/markets.js` firm book, trade ticket, portfolio, league table; real data on the OT-01 walls |
| AI desk | `server/agents/*` Quant (signals from real daily bars), Head Trader (Claude Haiku 5.5 if `ANTHROPIC_API_KEY`, else rule book), Risk Officer (limits + parametric VaR), action gateway with privileges/daily caps, LLM spend meter + circuit breaker | firm book shows every order with its rationale and each agent's report |
| Lottery | `server/lottery/*` official GLO results (258 draws, 2015-12-30 → 2026-11-01), randomness audit, 6 models + Dynamic Model Averaging, walk-forward backtest, Monte Carlo, portfolio construction, agent decision, settlement on confirmed results | `src/apps/research.js` workflow, track record, certificates, methodology |

## Evidence

- `npm test` — 13/13 pass: exact 1/37 edge for every roulette position, illegal positions rejected, provably-fair uniformity, ledger property test (1,500 random operations, invariants hold), order reserve/fill/sell/cancel, desk tick within risk limits, prize table, draw calendar, models learn a planted pattern but not noise, certificate settlement.
- `npm run check:words` — passes over `src/`, `server/`, `index.html`; LLM output containing a hard-banned word is discarded at runtime.
- Browser (screenshots in this folder):
  1. `01` walk to a VT-01 table → E → seated at that table; clicks on the 3D felt place chip stacks (straight 17, split 17/20, corner 17-18-20-21, 2 × ¤25 on red); hovered corner highlights its four numbers.
  2. `02`, `02b` Space → camera moves to the wheel, ball runs the track, drops past a deflector, rattles and settles. Checked numerically: the ball's resting pocket (from its position relative to the rotor) = 22 = the server's pocket. Dolly placed on 22, losing tokens swept, −¤10 recorded. Esc stands up and restores walking. 145 fps seated.
  3. `03` firm book: 7 orders queued for Monday's open with rationale; Risk Officer VaR note; Quant table.
  4. `04` real quotes and SPY's real intraday chart; buy 10 SPY → "queued for the open"; portfolio shows ¤2,064.11 free + ¤7,920.89 reserved.
  5. `05–07` research workflow on 258 official draws: no χ² test flagged, lag-1 r = 0.005; DMA ensemble 8/234 top-5 hits vs 11.7 expected (lift 0.68×, p = 0.90); Monte Carlo 90.6 % of random seasons do at least as well. Head of Thai Markets bought 5 certificates for 2026-11-16 with an honest note. Visitor bought 912041 (¤80).
  6. `08` OT-01 walls showing real prices, day movers, heat-map, firm book; 72 fps median there.
- Console: zero errors.

## Not verified / open

- Fills at a live US open (next open 2026-11-16 09:30 ET) — the fill path is tested with synthetic quotes in `npm test` (closed-market fills enabled there), not yet against a live open.
- Settlement on a real draw (first one: 2026-11-16 ~16:00 Bangkok) — tested with a stored draw in `npm test`.
- LLM path: no `ANTHROPIC_API_KEY` in `.env`, so the agents ran their rule books; the LLM code path is untested against the live API.

## Follow-up: OT-02 screens show the real Institute (2026-11-15)

Rebased onto `origin/feature/ot02-theatre` (OT-02 is now the IMAX Monte Carlo Rehearsal Theatre). Every screen in the room now shows real state from `/api/lottery/state` (shared via `src/world/lottoFeed.js`), nothing is a random prop:

- **24 quant-desk monitor designs** (`src/floors/theatreScreens.js`): model desk (the six models + DMA ensemble: posterior weight, real next-draw guesses, backtest hits), official GLO history (recent draws, digit counts, 10×10 last-2 grid, χ² verdict, never-seen numbers), the desk's actual certificates + visitor sales + track record (cumulative backtest hits vs chance until the first live settlement), the seven pipeline stages with timings + the null Monte Carlo histogram.
- **IMAX results board**: the latest official result (1 Nov 2026: 423224 · front 300/950 · back 393/804 · last-2 85), the Institute's picks for that draw when a run exists, and the stage's rehearsal log.
- **IMAX model panel**: the DMA ensemble's real P(last 2) for all 100 numbers (0.95 %–1.12 %, fair 1.00 %), top-5 outlined, the forecast (48 at 1.12 %), backtest 8/234 vs 11.7 expected, log-loss, Monte Carlo p, model weights.
- **Countdown**: the server's draw calendar (handles shifted dates).
- **The robot's draws**: each set of six balls is a Monte Carlo rehearsal sampled from the live model's per-position digit probabilities and checked against the five certificates the desk holds (closest match shown); every 4th set replays the latest official first prize ball by ball (verified: set #4 = 423224).
- **Printed tickets** on tier risers, desks, wall banners and the archive carry the desk's real certificate numbers and draw date (912041, 429098, …, 16 Nov 2026).
- **Pit console screens**: no random fallback any more.

Server: `last2Dist` (full 100-number forecast) added to each run; `recentDraws` and visitor `sales` added to the state API; a re-run for a draw the desk already bought for carries that decision forward.

Evidence: `09` model panel, `10` results board + rehearsal log (official replay row), `11` all 24 desk-monitor designs. 13/13 tests, banned-word check, build pass. Desk atlas redraw ≈ 2.4 ms every 2 s. Frame rate not re-measured (browser pane hidden, throttled).
