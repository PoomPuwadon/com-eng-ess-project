---
name: phase-verification
description: Mandatory end-of-phase (and end-of-milestone) verification for the firm project — run the app, screenshot every floor, measure frame rate, walk one full flow end to end (e.g. lobby → glass bridge → vault), check role/access rules, and report evidence before saying anything is done. Use before claiming a phase, feature or fix is complete, and whenever the user asks "is it done / does it work".
---

# Phase Verification

No "it's done" without evidence. A phase is complete only when every gate below passes and the
report (§5) has been given to the user. If a gate can't be run, say which and why — never skip
silently.

## 1. Prerequisites the app must provide (build them in Phase 0)

Dev builds expose:
- `window.__perf` — see the `threejs-performance` skill.
- `window.__debug`:
  - `teleport(floorId, roomId?)` — place the player at a room's spawn point.
  - `setRole("visitor" | "cleared" | "admin" | "ceo")` (Phase 0) / test accounts (later phases).
  - `state()` → `{ floorId, roomId, position, role, loadedFloors[] }`.
  - `walkTo(floorId, roomId, { force, sim })` — scripted walk using the real movement + collision +
    elevators (not teleport), resolves `{ ok, path[], blockedAt? }`. `sim` (default) steps at a fixed
    1/60 s so it works in a hidden tab; `force` ignores access locks when planning so a barrier test
    proves the collider physically stops you. Also `walkToLift(bank)`, `ride(bank, floor)`, `trail()`.
  - `render()` — render one frame now (for screenshots when the tab is throttled; load with `?shots=1`).
- URL params `?floor=OT-01&room=trading_floor` for direct screenshots, `?bench=1` for the perf tour.
- `.claude/launch.json` with the dev server config so `preview_start` can launch it.

## 2. Gate A — It runs

1. Start the dev server (`preview_start` by name), open it in the built-in browser.
2. Read console messages: **zero errors**. Warnings listed in the report.
3. Server-side phases: the server process starts, connects to the DB, and the simulation tick logs
   are advancing.

## 3. Gate B — Screenshot every floor

For each floor ID in the `greybox-layout` table (B1, L0, OT-01…OT-07, VT-01…VT-07, BRIDGE):
1. Teleport to the floor's main room; wait for load.
2. Take a screenshot from the room's reference viewpoint (the doorway looking in, so scale reads).
3. Check: room sign visible and matching the layout `sign` label; minimap shows the right floor
   and room; room roughly matches its listed dimensions (`state().position` at the far walls).
4. Save screenshots under `verification/<phase>/<floorId>.png` (create the folder) and list them in
   the report.

## 4. Gate C — Frame rate

Run `?bench=1` and read `window.__perf` results for every floor. Compare with the targets and
`perf/baseline.json` from `threejs-performance`. Report the table (floor, median fps, 1 % low,
draw calls, triangles) and the machine/browser used. Any hard limit broken = gate fails.

## 5. Gate D — Full flows

Run with `walkTo` (real movement), checking `state()` at each step:

**Flow 1 — CEO: lobby → bridge → vault (real moving lifts)**
`L0` guest landing → ride `vt_low` to `VT-02` → walk across `BRIDGE` → `OT-04` → ride `ot_high`
to `OT-07` → `ceo_elevator_lobby` → ride `ceo` to `B1` → `vault`. Pass = arrives in `vault`.
`trail()` must show every floor passed while riding (cars really travel) and no teleport.

**Flow 2 — Visitor access denial and lift safety**
As `visitor`: a forced walk onto the bridge and through the staff turnstiles must be physically
stopped; calling a staff lift must be refused; the guest lifts must reach every VT floor and L0.
A lift can't be called from a floor its bank doesn't serve. Walking straight at a landing door
with no car behind it must be stopped (`walkStraight`).

**Flow 3 — Cleared visitor**
As `cleared`: bridge allowed, `OT-01` viewable with no trading UI, `OT-07` and `B1` blocked.

**Phase-specific flow** (add one per phase), e.g.:
- Phase 2: admin sets a department budget → cash robot leaves the vault with the right floating
  amount → crosses the bridge if needed → arrives → ledger invariants still hold (run reconciler).
- Phase 3: trading floor shows real delayed quotes with source + timestamp label.
- Phase 4: open a position on a real fixture, force-settle against stored result, balance correct.
- Phase 5: LLM spend meter increases by the expected amount after one tick; no NPC triggers a call.
- Phase 6: force a budget blowout → alarm audible on another floor, roll call, CFO speech,
  escorted exits through the lobby, rehires walk in.

## 6. Gate E — Rules regression

- Banned-word scan over UI strings passes (`voice-and-satire`).
- Money phases: ledger property tests + reconciler pass (`money-ledger`).
- Game phases: edge simulation tests pass (`leisure-rules`).
- Data phases: request-budget counters are below their limits after a 1 h soak (`free-data-sources`).

## 7. The report

```
## Verification — <phase / feature>
Gate A Runs:          PASS/FAIL — <console errors/warnings>
Gate B Screenshots:   PASS/FAIL — <n>/<total> floors, files: verification/<phase>/...
Gate C Frame rate:    PASS/FAIL — table; machine/browser
Gate D Flows:         PASS/FAIL per flow — where it failed (floor, room, position)
Gate E Rules:         PASS/FAIL per check
Not verified:         <anything not run, and why>
```

Only when every gate is PASS may the phase be called done. Then **stop and wait for the user's
review** before starting the next phase (per CLAUDE.md).
