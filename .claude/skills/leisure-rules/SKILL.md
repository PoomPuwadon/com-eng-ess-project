---
name: leisure-rules
description: Exact rules, payouts and house edges for the Visitors' Tower games (blackjack, roulette, baccarat, craps, slots), poker rules, hand evaluation and house-bot difficulty targets, and how football, Muay Thai, horse racing and Thai lottery positions settle. Use whenever writing or changing game logic, payout tables, odds/margins, RNG, poker bots, or settlement code.
---

# Leisure Rules (games and settlement)

Internal reference — the words "casino"/"gambling" may appear in code comments, never in UI
(see `voice-and-satire`). All money moves through the `money-ledger` skill.

## 0. Universal rules

- **Server-authoritative.** The server shuffles, spins, rolls and decides every outcome before any
  animation starts; the client only animates the result it is given. The client never receives
  hidden information (deck order, hole cards of others, future reel stops).
- RNG: `crypto.randomInt` (or equivalent CSPRNG). Shuffles are Fisher–Yates. Log a per-round seed
  hash for audit.
- Animations must show the true result — no fake near-misses that contradict the outcome.
- **Edge test**: each game has a simulation test (≥ 10⁷ rounds, basic strategy where relevant) that
  asserts the measured house edge is within tolerance of the table below. A rule change that moves
  the edge must update this file.

## 1. Blackjack ("Twenty-One Advisory Table")

- 6 decks, reshuffle at 75 % penetration (or continuous shuffler).
- Dealer **stands on soft 17** (S17). Dealer peeks for blackjack with an Ace or ten-value up.
- Blackjack pays **3:2** (never 6:5). Ordinary win 1:1. Push returns stake.
- Double on any first two cards; **double after split** allowed.
- Split pairs up to 4 hands; split Aces get one card each and can't be re-split; A+10 after a
  split is 21, not blackjack. Ten-value cards of different ranks (K, Q) may be split.
- Insurance offered on dealer Ace, costs ½ stake, pays 2:1. Late surrender allowed (lose ½).
- Ace = 1 or 11; a hand is "soft" when an Ace counts as 11.
- **House edge ≈ 0.3–0.4 %** with perfect basic strategy under these rules.

## 2. Roulette ("Rotational Variance Instrument")

- **European single zero**: 37 pockets, 0–36.
- Wheel order (clockwise): 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26.
- Red: 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36. Black: the other 18. 0 is green.
- Payouts: straight 35:1, split 17:1, street 11:1, corner 8:1, six line 5:1, dozen/column 2:1,
  red/black/odd/even/1–18/19–36 1:1. Zero loses all outside bets (no la partage).
- **House edge 2.70 %** (1/37) on every bet.

## 3. Baccarat — Punto Banco ("Private Banking Table")

- 8 decks. Card values: A = 1, 2–9 face value, 10/J/Q/K = 0. Hand total = sum mod 10.
- Two cards each. If either has 8 or 9 (natural), both stand.
- **Player** draws a third card on 0–5, stands on 6–7.
- **Banker**: if Player stood, Banker draws on 0–5, stands on 6–7. If Player drew a third card
  (value *p*):

| Banker total | Banker draws when *p* is |
| --- | --- |
| 0–2 | always |
| 3 | anything except 8 |
| 4 | 2–7 |
| 5 | 4–7 |
| 6 | 6–7 |
| 7 | never (stands) |

- Payouts: Player 1:1 (**edge 1.24 %**); Banker 1:1 minus 5 % commission (**1.06 %**);
  Tie 8:1 (**14.36 %**). On a tie, Player and Banker bets push.

## 4. Craps ("Kinetic Probability Pit")

- Come-out roll: 7 or 11 wins Pass; 2, 3, 12 lose Pass. Any other number becomes the point; Pass
  wins if the point repeats before a 7, loses on 7.
- Don't Pass: opposite, with 12 on come-out a push ("bar 12").

| Bet | Pays | House edge |
| --- | --- | --- |
| Pass / Come | 1:1 | 1.41 % |
| Don't Pass / Don't Come | 1:1 | 1.36 % |
| Odds behind Pass (true odds) | 4/10: 2:1, 5/9: 3:2, 6/8: 6:5 (max 3-4-5×) | 0 % |
| Place 6 / 8 | 7:6 | 1.52 % |
| Place 5 / 9 | 7:5 | 4.00 % |
| Place 4 / 10 | 9:5 | 6.67 % |
| Field (3,4,9,10,11 pay 1:1; 2 pays 2:1; 12 pays 3:1) | — | 2.78 % |
| Hard 6 / 8 | 9:1 | 9.09 % |
| Hard 4 / 10 | 7:1 | 11.11 % |
| Any 7 | 4:1 | 16.67 % |
| Any craps | 7:1 | 11.11 % |

## 5. Slots ("Automated Yield Terminals")

- Defined by **reel strips + paytable** (data, not code). Outcome = independent uniform random stop
  per reel. No "due" logic, no adaptive odds.
- **Target RTP 95–96 %** (house edge 4–5 %), per machine config.
- RTP must be **computed exactly** by enumerating all stop combinations (feasible for 5 reels ×
  ~30 stops) and checked in CI; Monte Carlo is only a secondary check. Publish RTP on the machine's
  info panel ("Projected yield: 95.8 %").
- Progressive jackpot (optional): funded by a fixed % of each stake into a `VAULT` sub-ledger;
  include contribution in RTP.

## 6. Poker ("Strategic Negotiation Salon")

### Rules — No-Limit Texas Hold'em

- Dealer button rotates clockwise; small blind and big blind post; heads-up: the button posts the
  small blind, acts first preflop and last postflop.
- Betting rounds: preflop, flop (3), turn (1), river (1). Minimum raise = size of the previous
  bet/raise in that round. An all-in for less than a full raise does **not** reopen betting to
  players who already acted.
- Side pots built from all-in amounts; each pot awarded separately. Split pots divided equally;
  odd chip to the first winner clockwise from the button.
- Showdown: last aggressor shows first; others may muck losing hands.
- Timebank per action (e.g. 30 s + 60 s bank); timeout = check if possible, else fold.

### Hand evaluation

- Best 5-card hand from 7 cards. Ranks high → low: straight flush (royal flush = ace-high straight
  flush), four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.
- **A-2-3-4-5 ("wheel") is a straight, 5-high**; the ace is low there. No wrap-around (Q-K-A-2-3
  is not a straight). Suits never break ties.
- Ties: compare by category then kickers in order (e.g. two pair: higher pair, lower pair, kicker;
  full house: trips, then pair; flush: all five cards high to low).
- Use a proven lookup evaluator (e.g. a Cactus Kev / two-plus-two style evaluator or a well-tested
  library) and a test file with ≥ 50 hand-vs-hand vectors covering wheels, counterfeited two pair,
  board plays, flush-over-flush kickers, and split pots.

### House-bot difficulty — "strong but beatable"

- Strategy: position-aware preflop ranges (open/3-bet/call charts), postflop Monte Carlo equity
  (~1–2k runouts) against an estimated range, pot odds, bet-size buckets (33 / 66 / 100 % pot,
  all-in), balanced bluff frequency for the size, and simple opponent modelling (VPIP/aggression).
- Deliberate small leaks (configurable): slightly over-folds to river overbets, under-bluffs turns,
  doesn't adjust to very aggressive opponents. Small random noise on decisions.
- **Targets** (measured by bot-vs-bot simulation over ≥ 200k hands):
  - vs a loose-passive "casual" reference bot: house bot wins **+10 to +25 bb/100**;
  - vs a solid tight-aggressive reference bot: house bot loses **−2 to −6 bb/100**.
- Bots never see hidden cards; they get exactly the information a seated player gets. Think time
  1–4 s, humanised.

## 7. Sports and event settlement

### General

- Odds are **decimal** and locked at placement. Payout = stake × odds, rounded down to the minor unit.
- Pre-match only: markets close at the scheduled start time.
- Settle only on confirmed final data (see `free-data-sources` for confirmation rules). Admins can
  settle/void manually; every manual action is audit-logged.
- Accumulators/parlays: odds multiply; a void leg counts as 1.00; any lost leg loses the parlay.
- House margin on house-priced markets: overround 105–108 % (two/three-way), 115–125 % (race win
  markets). Real bookmaker prices are shown as returned.

### Football

- Settle on the result **after 90 minutes plus stoppage time**. Extra time and penalties don't count,
  except in explicit "to qualify / to lift the trophy" markets.
- 1X2, double chance, draw no bet (draw = void), BTTS, correct score, over/under on regulation
  goals. Half-time markets on the first-half score; HT/FT on both.
- Over/under on a whole line (e.g. 2.0) with exactly that many goals = void. Asian quarter lines
  (e.g. −0.25) split the stake half on each neighbouring line.
- Postponed: void if not played within 48 h of the original kickoff. Abandoned: void unless the
  market's outcome was already decided (e.g. over 1.5 with 2 goals scored).

### Muay Thai (simulated, Lumpinee style)

- 5 rounds × 3 min. Outcomes: KO, TKO (incl. referee stoppage, corner retirement), decision
  (judges' points), draw, no contest.
- Markets: winner (2-way; **draw = void**), 3-way with draw, method (KO/TKO vs decision), round
  group (rounds 1–2, 3, 4, 5, decision). No contest = all void.
- In-fight positions are allowed between rounds (rounds 2–4 breaks), as Lumpinee ringside culture;
  prices update from the fight engine's state; window closes when the bell rings.

### Horse racing (simulated)

- Win: horse finishes 1st. Place: top 2 with 5–7 runners, top 3 with 8+ runners (no place market
  under 5 runners). Each-way = equal win + place stakes, place at ¼ of win odds.
- Exacta (1st–2nd in order) and trifecta (1st–3rd in order) at house-priced odds.
- **Dead heat**: stake divided by the number of horses tied for the position, then paid at full odds.
- Non-runner (scratched before the off): stake returned.
- Finishing order and times are decided by the server at the off; the 3D race animates to them.

### Thai Government Lottery (real draw results)

- Tickets are 6-digit numbers 000000–999999. Price **80** (fake units) per ticket. Visitors pick
  their number; unlimited copies may be sold.
- Prize table per ticket (a ticket may win in more than one category; pay each):

| Prize | Rule | Prize per ticket |
| --- | --- | --- |
| 1st | all 6 digits match the 1st-prize number | 6,000,000 |
| Adjacent to 1st | 1st-prize number ± 1 (2 numbers) | 100,000 |
| 2nd | matches one of 5 numbers | 200,000 |
| 3rd | matches one of 10 numbers | 80,000 |
| 4th | matches one of 50 numbers | 40,000 |
| 5th | matches one of 100 numbers | 20,000 |
| Front 3 digits | first 3 digits match one of 2 drawn 3-digit numbers | 4,000 |
| Last 3 digits | last 3 digits match one of 2 drawn 3-digit numbers | 4,000 |
| Last 2 digits | last 2 digits match the drawn 2-digit number | 2,000 |

- Expected return ≈ **60 %** of ticket price (house edge ≈ 40 %), matching the real lottery.
- Tickets are for the next official draw; sales close 1 h before the draw time (Asia/Bangkok).
  If a draw is postponed, tickets carry over to the rescheduled draw.
