# Verification — Phase 0 rev 4: bigger box arena with live feeds (2026-11-05)

What was requested:
- A bigger arena.
- Each level with its own walkway.
- Boxes with glass-panel fences instead of pods.
- The centre screen showing live sport: a scoreboard for games, live timing for races.
- Every box showing a live game, about 95 % football.

| Gate | Result | Evidence |
| --- | --- | --- |
| A — Runs | PASS | Build passes, banned-word check passes, VT-03 builds with no errors |
| B — Screenshots | PASS | `verification/phase-0-rev4/*.jpg` (tunnel view, L3 box TV live match, L2 box with race live timing) |
| C — Frame rate | PASS on dev machine | 0.79–0.86 ms per frame, 41–54 draw calls, about 60k triangles. Feed redraw 0.8 ms at 5 Hz. RTX 3070, not a laptop |
| D — Flows | PASS | See below |

## Numbers
- Chamber 116 m across (was 72 m).
- 108 boxes: 16 / 22 / 31 / 39 per level.
- 158 live screens, about 95.6 % football: 7 show the race (1 drum panel, 2 ring panels, 4 box TVs).
- 15 simulated football matches with running clocks, goals, half-time and full-time.
- 1 simulated horse race with a live timing tower (positions and gaps).
- 1 live-scores ticker.

## Flows (real movement and collision, stepped at 1/60 s)
- Visitor: lobby → guest lift → arena pit. OK.
- Pit → ramp → L1 → ramp → L2 → ramp → L3 → ramp → L4. Heights 3.00 / 7.50 / 12.00 / 16.50 m.
- On every level (L1–L4):
  - walk the walkway;
  - enter a box through its door and exit again;
  - partition wall blocks;
  - glass fence blocks walking off the front;
  - back wall blocks except at the door.
- On L4, the outer wall blocks.
- The live feeds advance: e.g. NBR 0-2 ASH 74:58 → 1-2 at 77:28; another match reached HT; the race runs with timing.

## Not verified
- Laptop frame rate.
- Hands-on mouse/keyboard feel.
- The level 1 boxes look up about 40° at the drum. It's readable but steep; the higher levels look straight across.
