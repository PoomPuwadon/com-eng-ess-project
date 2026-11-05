# Verification — Phase 0 greybox, rev 2 (2026-11-05)

Changes requested by the user:
- The Grand Lobby is an atrium between the two towers, with the glass bridge visible overhead.
- Real multi-car lift banks that physically move.
- The Card Salon is merged into the Executive Leisure Suite.

Run: `npm run dev` → http://localhost:5173. Checked in the Claude desktop browser pane.

| Gate | Result | Evidence |
| --- | --- | --- |
| A — Runs | PASS | `vite build` succeeds; `npm run check:words` passes. The console showed errors only from hot-reloads taken mid-edit, plus pointer-lock refusals from the embedded pane (now caught). No errors after a clean reload |
| B — Screenshots | PASS (16/16 floors + lift and atrium views) | `verification/phase-0-rev2/*.jpg`. OT-05 has the same layout as OT-02/03 and was not shot separately |
| C — Frame rate | PASS on this machine | 0.9–1.7 ms per frame on most floors (forced renders + `gl.finish`). OT-07 measured 2.8 ms. Bridge level draws 81–108 calls (budget 250). Measured on an RTX 3070, **not** an average laptop |
| D — Flows | PASS | See below |
| E — Rules | PASS | Banned-word scan |

## Gate D — flows (real movement, collision and moving lifts, stepped at 1/60 s)

1. **CEO: lobby → bridge → vault — PASS.**
   - guest car VT-L1 37 m up to VT-02 → walk across The Link → OT-04 → car OT-H1 15 m up to
     OT-07 → private lift OT-X1 62 m down → vault.
   - Floors passed: L0 > VT-01 > VT-02 > BRIDGE > OT-04 > OT-05 > OT-06 > OT-07 > OT-06 > … >
     OT-01 > B1. The cars really travel through every floor.
2. **Visitor — PASS.**
   - The guest lifts reach VT-01, VT-02, VT-03, VT-04, VT-05, VT-06 and L0.
   - Calling a staff lift is refused ("This floor is reserved for value creators.").
   - Calling a car from a floor its bank doesn't serve is refused.
   - Forced walks are physically stopped at the staff turnstiles (z = 12.4) and the bridge gate
     (x = 66.4).
3. **Lift safety — PASS.** Walking straight at an OT-02 landing door with no car behind it stops
   at the door (x = −64.45). After calling, the car arrives, opens, and the ride works.
4. **Cleared visitor — PASS.** VT-02 > BRIDGE > OT-04 > (lift) > OT-01 trading floor. No route
   to OT-07 or B1.
5. **Robots — PASS.**
   - ALC-01: vault → freight OT-F1 → Sports Desk, then back.
   - ALC-02: vault → OT-F1 → OT-04 → bridge → VT-02 → freight VT-F1 → Leisure Suite.

Bug found and fixed during verification:
- Lifts could be called from floors their bank doesn't serve.
- A player stepping out of a car into the gap before the lobby wall was snapped up to the last
  floor's height.

## Not verified

- Frame rate on an integrated-GPU laptop.
- Hands-on play in the visible pane. The user was using the pane during the last checks, so I
  stopped driving it.
