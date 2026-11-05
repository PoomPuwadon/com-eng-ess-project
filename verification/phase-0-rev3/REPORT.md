# Verification — Phase 0 rev 3: floor foyers + Senate-style arena demo (2026-11-05)

Changes requested by the user:
- Every floor gets its own styled lobby before the main room.
- The sports arena becomes a Senate-style chamber with hundreds of screens (not thousands), in the
  style of the reference image.

| Gate | Result | Evidence |
| --- | --- | --- |
| A — Runs | PASS | `vite build` passes, banned-word check passes, and every floor builds with no errors |
| B — Screenshots | PASS | `verification/phase-0-rev3/*.jpg`: arena from the tunnel, pit and upper walkway; the Trading, Thai Desk, Arena concourse and Leisure Suite foyers |
| C — Frame rate | PASS on the dev machine | Arena 1.2–1.3 ms per frame, 31–48 draw calls, 55k triangles (was 108k). Foyers about 1.0–1.2 ms. RTX 3070, not an average laptop |
| D — Flows | PASS | See below |

## Arena demo numbers
- 86 floating pods on 4 levels, 258 analyst seats.
- 315 screens in total: pods 258 + central ring 32 + wall 10 + pit desks + concourse.
- Chamber radius 36 m; pit radius 14 m; tiers up to a 10 m walkway.

## Flows (real movement, collision and lifts, stepped at 1/60 s)
- Visitor, lobby → arena pit: guest lift VT-L1 42 m up → concourse foyer → tunnel → pit. OK.
- Climbing the tiers to the 10 m walkway: OK.
- The chamber wall blocks you (stopped at r = 35.6).
- The tunnel sides block a sideways step onto the high tiers.
- Pods board from the step behind (standing on the pod at 5.55 m) and block you from the front.
- CEO lobby → bridge → vault: OK. All floors are passed in the lift; nothing teleports.
- CEO → Sports Desk through its foyer, and → OT-04 sky lobby through its foyer: OK.
- Visitor → Probability Research Institute: OK. Visitor forced onto the bridge: blocked.
- Robots ride the freight lifts and deliver through the new service door (Sports Desk) and via the bridge (Leisure Suite).

## Not verified
- Laptop frame rate.
- Hands-on mouse/keyboard feel.
- Screenshots of the other 9 foyers (they built without errors and were walked through by the flows).
