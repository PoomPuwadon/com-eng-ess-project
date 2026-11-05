---
name: money-ledger
description: Rules for the firm's fake-money economy — double-entry ledger (every movement has from, to, amount, reason), the invariants that stop money duplicating or vanishing, account types, standard transaction recipes (starting balance, top-ups, resets, wagers, poker tables, budgets), and the rule that every department transfer is a cash-robot trip. Use whenever writing or changing any code that reads or changes a balance, budget, vault total, payout, stake or P&L.
---

# Money Ledger

Fake money only. There is no path in or out of the system for real money — no payment provider SDK,
no "buy credits" button, ever.

## 1. The model: double-entry, append-only

- Amounts are **integers in minor units** (`bigint`, 1 unit = 1/100 of the firm's currency).
  Never floats. Odds/multipliers produce a payout rounded **down** to the minor unit; the
  rounding remainder stays with the payer (usually the vault), never disappears.
- A **transaction** = `{ id, created_at, actor, reason, ref, idempotency_key, entries[] }`.
  An **entry** = `{ account_id, amount }` with signed amount. Each simple transfer is one debit
  entry and one credit entry, i.e. **from, to, amount, reason**.
- **Entries in a transaction sum to zero.** Enforced by a DB constraint/trigger, not by app code.
- Ledger tables are **append-only**: no `UPDATE`, no `DELETE` (revoke those privileges on the
  table). Mistakes are fixed with a new reversing transaction referencing the original.
- Balances are a materialised `account_balances` table updated in the **same DB transaction** as the
  entries, with row locks (`SELECT … FOR UPDATE`) on the affected accounts. All writes go through
  one server function (`ledger.post(tx)`); nothing else touches balances.
- `idempotency_key` is unique: retrying a request (network glitch, double click) can never post
  twice. Use e.g. `bet:<betId>:settle`, `trip:<tripId>:deliver`.
- `actor` = user id, agent id, or `system:<job>`; `reason` = a code from the list below; `ref` =
  the bet/round/trip/table id. These feed the visible audit log.

## 2. Accounts

| Account | Meaning | May go negative? |
| --- | --- | --- |
| `SYSTEM:MINT` | Source of all newly created money | **Yes — the only internal account that may** |
| `VAULT` | The firm's cash (shown on the vault display) | No |
| `TRANSIT:<tripId>` | Money inside a cash robot | No |
| `DEPT:<roomId>` | A department's budget account (e.g. `DEPT:trading_floor`) | No |
| `PLAYER:<userId>` | A player's balance | No |
| `ESCROW:BET:<betId>` | A placed, unsettled stake | No |
| `TABLE:<tableId>` | Chips on a poker/PvP table (sum of stacks + pot) | No |
| `BOT:<botId>` | House bot bankroll at a table | No |
| `EXTERNAL:MARKET` / `EXTERNAL:BOOKMAKER` | The outside world the firm's agents trade/bet against at real prices | Yes |

**Open question for the user:** the AI departments trade real stocks and bet on real matches with
fake money, so their P&L must come from (or go to) somewhere. This design books it against
`EXTERNAL:*` counterparties at real prices. That is the only money-creating path besides `MINT`,
and the dashboards show `EXTERNAL:*` net as "firm P&L vs the world". Confirm this is acceptable.

## 3. Invariants (checked continuously)

1. **Conservation**: the sum of all account balances = 0, always.
   Equivalently: `-(MINT) - (EXTERNAL:*) = VAULT + Σ DEPT + Σ TRANSIT + Σ PLAYER + Σ ESCROW + Σ TABLE + Σ BOT`.
2. **Money is created only** by `MINT` debits with reason `STARTING_BALANCE` or `ADMIN_TOPUP`
   (plus `EXTERNAL:*` settlement of real-priced positions, if approved above). Any other
   transaction touching `MINT` is rejected.
3. **No negative balance** on any account except `MINT` and `EXTERNAL:*`. A transaction that would
   make one negative is rejected — it does not clamp to zero.
4. Every `DEPT` ⇄ `VAULT` movement passes through a `TRANSIT` account (cash robot, §5).
5. Every `ESCROW:BET` ends at zero after settlement; every `TRANSIT` ends at zero after delivery;
   every `TABLE` ends at zero after the table closes.
6. Balance table = sum of entries per account (recomputed by the reconciler).

**Reconciler job** (every 10 min + on boot): recompute balances from entries, check 1, 3, 5, 6.
Any mismatch → write `LEDGER_DRIFT` to the audit log, alert admins, and freeze new wagers until
resolved. Never "auto-correct" drift.

**Tests** (required before any money PR is done): a property-based test that runs thousands of
random operation sequences (bets, wins, voids, top-ups, resets, trips, poker hands, concurrent
retries) and asserts invariants 1–6 after every step; plus a concurrency test firing the same
idempotency key in parallel.

## 4. Standard transactions

| Event | Entries (from → to) | Reason |
| --- | --- | --- |
| Visitor signs up | `MINT → PLAYER` starting balance (amount from config set by CEO/admins) | `STARTING_BALANCE` |
| Admin/CEO top-up | `MINT → PLAYER` | `ADMIN_TOPUP` |
| Admin/CEO reset | `PLAYER → MINT` (whole balance), then `MINT → PLAYER` (starting balance), one transaction | `RESET` |
| Place a wager | `PLAYER → ESCROW:BET` | `WAGER_PLACED` |
| Wager lost | `ESCROW:BET → VAULT` | `WAGER_LOST` |
| Wager won | `ESCROW:BET → PLAYER` (stake) + `VAULT → PLAYER` (profit) | `WAGER_WON` |
| Push / void | `ESCROW:BET → PLAYER` | `WAGER_VOID` |
| Instant table game round | place + settle in one transaction | `ROUND_SETTLED` |
| Poker buy-in / cash-out | `PLAYER → TABLE` / `TABLE → PLAYER` | `TABLE_BUYIN` / `TABLE_CASHOUT` |
| Poker rake (if enabled) | `TABLE → VAULT` | `RAKE` |
| House bot sits / leaves | `VAULT → BOT` → `BOT → TABLE` / reverse | `BOT_BANKROLL` |
| Lottery ticket | `PLAYER → ESCROW:BET`, settled like a wager | `LOTTERY_TICKET` |
| Budget allocation | `VAULT → TRANSIT:<trip>` at dispatch, `TRANSIT → DEPT` on arrival | `BUDGET_DISPATCH` / `BUDGET_DELIVERED` |
| Budget recall / dept earnings banked | `DEPT → TRANSIT → VAULT` | `BUDGET_RETURN` |
| Agent trades / bets externally | `DEPT ⇄ EXTERNAL:*` at real prices | `EXTERNAL_TRADE` / `EXTERNAL_SETTLE` |

- Visitors who are broke stay at 0. No automatic refills, no daily bonus, no "loan".
- A wager can't be placed if `PLAYER` balance < stake (invariant 3 enforces it anyway).
- Max payout per bet and per round is configurable; the vault must be able to cover it at the
  moment of acceptance (reject the wager otherwise — the vault can't go negative).
- Wins are paid from `VAULT` directly — visitor payouts are not robot trips (robots carry
  department budgets).

## 5. Every department transfer is a cash-robot trip

- Creating any `DEPT` ⇄ `VAULT` movement **creates a `cash_trips` row**:
  `{ trip_id, from, to, amount, status: dispatched|in_transit|delivered, route[], escort_ids[], eta }`
  in the same DB transaction as the `TRANSIT` entry. There is no API to move money to a
  department without a trip.
- The server simulation moves the robot along `route` (vault → depot → freight elevator → floor,
  crossing the glass bridge for Visitors' Tower departments) whether or not anyone is watching.
- On arrival the server posts `TRANSIT → DEPT` (idempotency key `trip:<id>:deliver`).
  **Nothing can go wrong in transit**: no robbery, no loss mechanic, no cancel — a trip always
  delivers, even after a server restart (on boot, resume in-flight trips from the DB).
- The floating indicator above the robot shows `amount` from the trip row (formatted per the
  `voice-and-satire` skill).
- Many small allocations may be batched into one trip per department per tick, but never zero trips.

## 6. Budgets and the blowout

- A department's **budget** is a per-period allocation set by the CEO, CFO agent or any admin
  (audit-logged). Spend = sum of the department's outgoing `EXTERNAL_*`/expense entries in the period.
- A department can't spend beyond its `DEPT` balance. When an agent's action needs more, the
  server dispatches an **emergency trip** from the vault (if the vault can cover it) and the moment
  period spend exceeds the budget, emits `BUDGET_BLOWOUT(deptId)` for the event system (alarm,
  roll call, CFO speech, firings, rehires). The blowout event never moves money by itself.

## 7. Display

- Vault display = `VAULT` balance (live, from the DB, pushed to clients on change).
  Optionally a second line "In transit: Σ TRANSIT".
- Every balance shown to a player comes from the server; the client never computes balances.
- Audit log rows are visible to CEO/admins: who, what, when, amount, before → after.
