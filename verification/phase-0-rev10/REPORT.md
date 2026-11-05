# Phase 0 — rev 10 verification (2026-11-06)

## What changed (all requested by the user)

| Request | Done |
| --- | --- |
| Remove Sports Desk (old OT-02) and Leisure Operations (old OT-03) | Both floors gone |
| Probability Research Institute into the Office Tower | Now `OT-02` (27 m, 10 m tall, open plan) |
| The bridge should connect to a real floor, not be its own floor | Sky lobbies removed; **The Link is at 15 m** and joins the **Trading Floor (OT-01)** and the **Executive Leisure Suite (VT-01)**, entering each lift hall through a glass checkpoint vestibule |
| Floor lobbies must not "pop out"; big enough to include the freight lift; big stylised entrance per floor | Boxy foyers replaced by **full-depth lift halls** (20 m × 80 m in OT, 20 m × 120 m in VT) with floor-to-ceiling walls; passenger, freight and private-lift landings all open into them; one big themed portal per floor (10–30 m wide) |
| Arena / Combat Pavilion / Equine Centre entrances connect seamlessly | Arena hall has no wall: the lifts face the 14 m arena portal. Pavilion starts at its portal (straight down the aisle to the ring). Equine portal is 30 m wide onto the track |
| Arena: wrap-around screen like the Bernabéu; stacked centre screens | LED ribbon under the roof + LED boards on every tier front (one scrolling texture); 4-tier stacked drum with LED rings between tiers |
| Arena: alert every time a position is opened | Gold pop-up "New position · Box … · team" + chime; simulated every 1.8–5 s (Phase 0) |
| Arena: ramps closer to the entrance | Ramps now flank the portal (±0.36 rad), tops nearest it |
| Arena: remove the ceiling screen | Removed |
| Arena: hanging screens for the higher levels | 12 double-sided at r 34 (Level 3), 16 at r 44.5 (Level 4) |
| Trading floor = Wall Street (picture) | Exchange floor: 12 round trading posts ringed with screens, each with a 4-sided display cube; steel trusses; bell balcony; banners |
| Leisure Suite like the picture; entrance straight onto the carpet | The 18 m portal opens straight onto a red/gold carpet promenade with purple borders and marble walkways, chandeliers down a coffered vault, purple soffits, tables with cream chairs either side |

New floor stack: **OT-01** Trading 15 · **OT-02** Prob. Institute 27 · **OT-03** Thai Desk 37 ·
**OT-04** Security HQ 42 · **OT-05** Executive 47 | **VT-01** Leisure Suite 15 · **VT-02** Arena 53.5
(bowl to 37) · **VT-03** Combat Pavilion 67 · **VT-04** Equine Centre 92.

Also fixed: the plaza's floor volume (20 m tall) overlapped the Office Tower's south-east corner and
made the Trading Floor hall read as "plaza"; the plaza volume is now 6 m.

## Evidence (in-browser, dev server)

- Build: `vite build` OK. Banned-word check OK (21 files). Every floor (13) builds and teleports
  with no errors.
- **Link checkpoint**: visitor stopped at the VT-01 gate (x 38.55) and the OT-01 gate (x −38.55);
  trying to slip round the vestibule is stopped by the glass (z 6.55). Cleared visitor walks
  Leisure Suite → Link → Trading Floor.
- **Routed trips (lifts)**: visitor PLAZA → arena portal → onto the top walkway; PLAZA → Combat
  Pavilion ringside; PLAZA → Equine Centre. Cleared → Institute; Cleared VT-01 → Trading Floor (via
  the Link). Admin → Thai Desk, Security HQ. CEO → Executive Floor → private lift → vault. Visitor
  refused OT-02 and OT-05 (by design).
- **Arena ramp by the entrance**: walked from the portal down to Level 3 (53.5 → 49.0 m) within
  ~25 m of the entrance.
- **Position alerts**: 4 simulated positions in 15 s of sim time; pop-ups + `position` sound fired.
- **Cash robots**: ALC-01 vault → freight → OT-03 DELIVERED; ALC-02 vault → OT-01 → The Link →
  VT-01 DELIVERED, and both return.
- **Render cost** (forced render, CPU submit): ≤ 2.0 ms on every floor; ≤ 68 draw calls; ≤ 75k
  triangles (arena). The OT-01 + Link + VT-01 cluster now renders together: 1.1–1.9 ms, 23–34
  calls. Real frame rate was not measured (the browser pane throttles animation frames).

## Screenshots

1. `01-ot01-lift-hall.jpg` — Trading Floor lift hall: full-height wall, freight lift inside the hall
2. `02-ot01-portal-to-trading-floor.jpg` — through the portal onto the exchange floor
3. `03-trading-floor-posts.jpg` — trading posts, display cubes, trusses
4. `04-vt01-portal-onto-promenade.jpg` — Leisure Suite portal straight onto the carpet promenade
5. `05-arena-from-entrance.jpg` — stacked drum, upper-level hanging screens, ramps by the entrance
6. `06-arena-led-boards-ribbon.jpg` — tier LED boards + roof ribbon
7. `07-arena-position-alerts.jpg` — gold "New position" alerts
8. `08-vt03-portal-to-ring.jpg` — Combat Pavilion: lift hall portal → aisle → ring
9. `09-vt04-portal-to-track.jpg` — Equine Centre: 30 m portal onto the track
10. `10-lobby-link-at-15m.jpg` — Grand Lobby: The Link at 15 m now crosses the lower part of the screen
11. `11-trading-floor-v2-aisle.jpg` — Trading floor redone to the user's reference (see below)
12. `12-trading-floor-v2-posts.jpg` — trading posts close up

13. `13-trading-floor-v3-photo-posts.jpg` — Trading floor v3, rebuilt from the user's photo of a real exchange floor
14. `14-arena-merged-stack.jpg` — arena centre stack: 3 merged eight-sided tiers down to the pit floor

### Trading floor v3 (user's photo — supersedes v2 below)

Each post is now a hollow ring, as in the photo: plain dark base wall lettered "{FIRM NAME} MEMBERS
EXCHANGE" (no screens) → waist-high ring counter with a blue-lit edge, 14 monitors on arms and
keyboards, stools outside, 8 monitors inside for the specialists → an **open gap** on thin supports →
a raised **crown of 16 large data screens tilted down** at the floor → a sloped **member-logo band**
(made-up names) → a flat grey **ring deck with railing and cable trays, open in the middle**; cable
drops to the ceiling. 9 big posts (12 m across) + 2 medium (9 m), crowded round the aisle. Light
basket-weave parquet with inlaid blue/black stripes, glass TV broadcast booth on a platform with
camera and rope stanchions. The v2 display cubes are gone. **Approved by the user ("Looks right").**

Re-checked afterwards in a separate tab: Trading Floor 1.1–1.4 ms forced render, 29–30 draw calls,
50k triangles; arena 1.0–1.2 ms, 44–65 calls, 74k triangles. Aisle walkable portal → bell
(x −102.5). Cleared visitor VT-01 → The Link → guest gallery OK; admin PLAZA → Trading Floor OK;
visitor PLAZA → arena portal OK; ramp beside the entrance takes you 53.5 → 49.0 m; walking across
the pit stops at the solid base of the stack (x 112.4).

### Arena centre stack (user: "stack down to the floor, much larger" → "merge 2 levels, bigger")

Three tall eight-sided tiers from the roof to the pit floor (matches / odds+matches / matches), each
screen ~12 m wide 16:9, LED rings between tiers, a plinth on the pit floor (solid). Pit desks moved
out to r 17 round its base.

### Arena race feed is F1, not horse racing (user, 2026-11-06)

The arena's race channel is now a simulated **F1 Grand Prix**: 20 cars / 10 teams (fictional names),
57 laps on a demo clock (~3 s a lap), timing tower (position, team colour, code, gap or "+n LAP" /
"IN PIT", tyre S/M/H), circuit map with every car, fastest lap, one pit stop each with tyre change and
tyre wear. LED ribbon reads "F1 GRAND PRIX · LIVE TIMING"; new-position alerts on race boxes read
"Box … · <driver> to win"; the race result settles the boxes watching it. Checked: laps advance
(1 → 14 in 40 s), gaps/tyres/fastest lap render (screenshot 15), the race finishes and a new GP
starts, alerts keep firing. Fixed during the check: gaps showed "NaN" before a car's first lap.
The Equine Centre (VT-04) keeps its horse racing. Real F1 data will need a free source (to be chosen
in the architecture proposal; CLAUDE.md's data list has no F1 yet).

15. `15-arena-f1-live-timing.jpg` — the F1 live-timing feed (enlarged)

### Trading floor v2 (user: "mine was a reference and you didn't follow, fix it")

Rebuilt to match the reference: 12 posts **10 m across**, packed on a 16 × 14.5 m grid (aisle from the
portal kept clear); each post has a **sloped skirt of screens tilted outward and up**, a **red-trimmed
counter with a ring of tilted monitors**, traders inside at their own inward-facing monitors, and a
**thick core carrying a low, big display cube** (white/red crown). Overhead: girders, beams, columns
with **knee braces**, **X-bracing** in every other bay, skylight coffers and hanging lamps. Back wall:
**tall blue window wall** with mullions, bell balcony; hanging bell sign over the aisle; tall firm
banner and flag on the side walls. 528 screens (tilted screens added to the screen instancer). Forced
render 1.2 ms, 23 draw calls, 29k triangles. Aisle walkable portal → bell; cleared visitor reaches
the guest gallery via The Link.

## Open points for the user

- The Link at 15 m passes in front of the lower third of the giant lobby screen (screenshot 10).
- ~~The Institute is now behind the Office Tower's access control.~~ **Decided (user, 2026-11-06):
  keep it cleared-only.** Visitors need a Link Access Credential (or a tour) to reach it.
- CLAUDE.md still lists Sports Desk / Casino Operations department floors, the Thai lottery room in
  the Visitors' Tower, and the coat check / charity wall / lost-and-found; it no longer matches.
