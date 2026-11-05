# Phase 0 — rev 11 verification (2026-11-06): Combat Sports Analytics Pavilion rebuilt

User request: redesign the Muay Thai / boxing arena to look like the reference photo (new-Lumpinee
style), with a much narrower lobby and no unused space; a realistic entrance and path to the seats;
a UFC-style walkout path for fighters (for the planned "put players in the ring" feature);
spectators reach only the seats, never the ring; a bigger ring; a realistic setting overall.

## What was built (`src/floors/pavilion.js`, VT-03)

- **Arrivals hall** narrowed to X 30–44, Z −40…30 (was 20 × 120 m). Its portal (8 m) opens straight
  onto the **entrance corridor**: ticket gates, box office, then **8 m-wide grand stairs** (16 steps)
  up to the concourse. Everything outside the venue is solid back-of-house, not walkable floor.
- **Round bowl** (centre 120, 0): ringside floor r < 14 → lower bowl (15 rows, front row 1.6 m up
  behind glass) → cross-aisle at 6.1 m → upper bowl (14 rows to 12 m) → back wall with gold-glass
  skyboxes → **concourse** (6.1 m) with position windows → outer wall. **7 vomitories** (Sections
  101–128) connect the concourse to the cross-aisle. ~7,500 seats, ~1,300 spectators.
- **Ring**: 11 m platform (10 m inside 4 ropes), red / blue / neutral corners, east-side steps.
  Ringside: officials' table, pi-phat musicians' stage, camera positions, LED boards.
- **Walkout**: Red and Blue dressing rooms backstage → tunnel **under** the concourse → lit runway
  through the seats (red/blue LED edges, gold markers, glass on the stands either side) → ring steps.
  Routes stored in `FLOOR_BY_ID['VT-03'].walkout` (red / blue).
- **Access**: spectators can only reach the concourse, aisles and seats. Ringside, walkout, tunnel,
  backstage and dressing rooms are reached only via the service corridor behind a locked door in the
  arrivals hall (`backstage` area: Admin and CEO for now; future fighters).
- **Atmosphere**: glowing sak yant ceiling (procedural Thai-script yantra), two zig-zag truss rings,
  16 light beams on the ring, 6 big fight screens.
- Engine change: walkable shapes now receive the walker's height (`ground(x, z, y)`) so one spot can
  have two levels — the tunnel runs under the concourse.

## Evidence (background tab, so the user's preview was untouched)

- Build OK; banned-word check OK (22 files).
- **Spectator route** (visitor): PLAZA → lifts → entrance (route planner) → stairs to 6.1 m → through
  the west vomitory → cross-aisle (6.1) → down the lower bowl (3.7) → **stopped at the front row
  (1.6 m, r 14)** → back up → along the cross-aisle → up the upper bowl (9.9).
- **No ring access**: from the cross-aisle beside the walkout the visitor stays at 6.1 (no drop into
  the trench); walking across the concourse above the tunnel stays at 6.1; the competitors' door
  stops the visitor; the route planner finds no way for a visitor to the ringside.
- **Walkout** (admin role as the stand-in for a fighter): arrivals hall → service corridor → Red
  dressing room (planner) → backstage → tunnel → runway → ring steps (0.4 → 1.2) → Red corner on the
  canvas (y +1.2). Same for the Blue corner.
- **Render cost** (forced render, CPU submit): 2.2 ms, 77 draw calls, 262k triangles on the concourse
  (crowd thinned from 1,900 to ~1,300 figures to get there); 1.5 ms in the arrivals hall. Real frame
  rate not measured (the browser pane throttles animation frames).

## Screenshots

1. `01-pavilion-bowl-and-ceiling.jpg` — from the upper bowl: sak yant ceiling, truss ring, beams on the ring, full bowl
2. `02-pavilion-walkout-runway.jpg` — fighter's view down the walkout runway to the ring
3. `03-pavilion-entrance-and-stairs.jpg` — arrivals hall portal → ticket gates → grand stairs

## Open points

- The `backstage` access area is Admin/CEO only until a "competitor" role or per-player fight pass exists.
- Crowd noise and traditional music for the pavilion are not in yet (Phase 4 per CLAUDE.md).

## Approved by the user ("looks right") — notes for a future phase

- **Better lighting** in the pavilion: richer, more dramatic stage lighting on the ring and bowl
  (Phase 1 look pass).
- **Breathing ceiling lights — DONE (2026-11-06)**: the sak yant ceiling glow pulses (spotlight beams
  stay steady, per the user), 25–115 % brightness (made stronger at the user's request), ~5 s per breath .
  Later: speed it up between rounds or on a knockdown; truss lights could join in.
- **Crowd reactions** (future, with the player-fight feature): hit / health loss → cheer; knockout
  ("dies") → very loud cheer; win → loudest cheer. See the greybox-layout spec's future-phase notes.
- **Walkout spotlights** (future): during the walkout each spotlight is assigned to one fighter and
  tracks them all the way to the ring.
