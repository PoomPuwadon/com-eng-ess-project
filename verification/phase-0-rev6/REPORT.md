# Verification — Phase 0 rev 6: entrance from outside, reception after security (2026-11-06)

| Gate | Result | Evidence |
| --- | --- | --- |
| A — Runs | PASS | Build passes, banned-word check passes |
| B — Screenshots | PASS | `plaza-start.jpg`, `arrivals-to-screening.jpg`, `reception-hall.jpg` |
| D — Flows | PASS | See below |

## Flows (real movement and collision)
- The game starts on the `PLAZA` (outdoors).
- Visitor walk-through, in order: doors → `arrivals_hall` → `security_checkpoint` → `reception_hall` → past the reception desk → `visitor_gates` → guest side. All OK.
- Visitor at the staff turnstiles: blocked.
- Going around the screening lane (arrivals → reception hall without passing the scanners): blocked by the screen wall.
- Visitor, plaza → VT-06 Probability Research Institute by guest lift: OK.
- CEO, plaza → OT-01 trading floor by office lift: OK.

## Not verified
- Frame rate on the plaza. It's a few more boxes and no new screens, so no change is expected; not measured.
