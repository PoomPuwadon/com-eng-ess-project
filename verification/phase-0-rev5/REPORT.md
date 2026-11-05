# Verification — Phase 0 rev 5: theatre-style arena (2026-11-05)

What was requested:
- Enter at the highest level, like a cinema, with the bowl a full circle and no entrance slot.
- Open boxes with no roof, each with a hanging TV and position dashboards below.
- A brief gain/loss pop-up above a box whenever it wins or loses, with a room-wide sound.

| Gate | Result | Evidence |
| --- | --- | --- |
| A — Runs | PASS | Build passes, banned-word check passes |
| B — Screenshots | PASS | `arena-entrance-portal-top.jpg`, `arena-box-tv-and-dashboards.jpg`, `arena-gain-loss-popups.jpg` |
| C — Frame rate | PASS on dev machine | 0.83–1.24 ms per frame, 40–55 draw calls, about 70k triangles. RTX 3070, not a laptop |
| D — Flows | PASS | See below |

## Flows (real movement, collision and lifts)
- Visitor: lobby → guest lift (58.5 m up) → concourse → portal → level 4 walkway (0 m).
- Then down the north ramps: L4 → L3 (−4.5) → L2 (−9) → L1 (−13.5) → pit (−16.5). OK.
- On L1–L4:
  - walk the walkway;
  - enter and exit a box through the back opening;
  - the glass divider, glass fence (no walking off the edge) and back rail all block.
- The outer wall blocks everywhere except the portal.
- Pop-ups: 18 goals produced 72 box pop-ups (39 gains, 33 losses).
- Sound: before any click the browser blocks audio, so sounds were counted as silent. After one real click in the view, 4 gain sounds played with none silent.

## Not verified
- Laptop frame rate.
- How the sound effects actually sound. They are synthesised: a chime plus crowd cheer for a gain, a descending "womp" plus groan for a loss.
