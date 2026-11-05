# Verification — Phase 0 rev 8–9: compact lobby, towers moved in, open-hall lobby, massive screen (2026-11-06)

| Gate | Result | Evidence |
| --- | --- | --- |
| A — Runs | PASS | Build passes, banned-word check passes, every floor builds with no errors |
| B — Screenshots | PASS | `lobby-massive-screen.jpg`, `arena-after-tower-move.jpg` |
| D — Flows | PASS | See below |

## Flows
- Visitor: plaza → doors → scanner lane → open hall → seating → reception → guest gates → Wellness lifts. OK.
- Visitor into the Office lift enclosure: blocked at the turnstiles.
- Going around security through the glass wall: blocked.
- Staff (admin) through the turnstiles to the Office lifts: OK.
- CEO: plaza → lobby → lift → OT-04 → BRIDGE (60 m) → VT-02 and back → OT-07 → private lift → B1 vault. OK.
- From the plaza, every floor tested reached its main room: OT-01/02/03/05/06/07, VT-01/02/04/05/06, and the VT-03 arena portal.
- Both robots still deliver over the moved freight lifts and the shorter bridge.

## Bug found and fixed
- The walker aimed at a room's exact centre even when that spot was inside furniture (Security HQ benches, the Muay Thai ring). It now stops at the nearest free spot.

## Not verified
- Frame rate after these changes.
