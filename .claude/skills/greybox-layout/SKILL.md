---
name: greybox-layout
description: Building layout source of truth for the firm — scale rules, massing (Office Tower | atrium Grand Lobby | Wellness Tower), the floor-by-floor room table with dimensions and elevations, the lift banks and shafts, room/floor naming conventions, and lift/bridge access rules by role. Use whenever creating, moving, resizing, labelling or connecting any floor, room, lift, bridge or minimap entry.
---

# Greybox Layout (rev 10 — 2026-11-06)

This file is the spec. The code's layout data lives ONLY in `src/layout/building.js` and must
match this file. If the user approves a layout change, update this file and the layout data in
the same change.

Rev 2 changes, requested by the user: the Grand Lobby is a glass-roofed atrium **between** the
two towers, and the glass bridge crosses it in plain view. Lifts are real multi-car banks that
physically move. The Card Salon is merged into the Executive Leisure Suite, so the Wellness
floors are renumbered VT-01…VT-06.

Rev 10 changes, requested by the user (2026-11-06): Sports Desk and Leisure Operations floors
removed; the Probability Research Institute moved into the Office Tower (OT-02); The Link lowered
to 15 m so it joins the Trading Floor and the Leisure Suite (sky lobbies removed); every floor's
boxy foyer replaced by a full-depth lift hall with a big themed portal; floors renumbered
OT-01…OT-05 and VT-01…VT-04.

## 1. Scale rules

| Rule | Value |
| --- | --- |
| Unit | **1 unit = 1 metre** (Three.js world units) |
| Axes | +X = east, +Y = up, +Z = south. Origin = centre of the Grand Lobby floor at ground level |
| Player | Capsule 0.4 m radius, 1.8 m tall, eye height 1.7 m |
| Walk / sprint speed | 5 m/s / 9 m/s |
| Standard office floor height | **5 m** floor-to-floor |
| Doors | 2.4 m wide × 3 m tall minimum (luxury); lift doors 1.8 × 2.5 m (CEO lift 4 × 3.2 m) |
| Corridors | 4 m minimum in public areas, 2 m minimum back-of-house |
| Wall thickness (greybox) | 0.3 m interior, 1 m exterior, 0.2 m shaft walls |
| Seat pitch (arenas) | 0.55 m wide × 0.85 m row depth, 0.4 m rise per row (rows are walkable steps) |

### Minimum sizes — "HUGE" is a requirement, not a mood

| Room type | Minimum floor area (W × D) | Minimum clear height |
| --- | --- | --- |
| Arena (football, Muay Thai) | **60 × 40 m** central area; bowl ≥ 80 × 80 m | 25 m |
| Horse racing hall | 170 × 110 m (oval track inside) | 20 m |
| Leisure Suite (incl. Card Salon) | 150 × 100 m | 20 m |
| Trading floor | 60 × 60 m | 10 m |
| Grand Lobby (atrium) | 120 × 80 m | 45 m |
| Department floor (open plan) | 55 × 35 m | 4 m |
| Executive office (CEO) | 25 × 20 m | 6 m |
| Vault | 50 × 40 m | 9 m |

Never shrink a room below its minimum to make it fit. Make the footprint bigger instead.

## 2. Massing and coordinates (rev 10)

```
   X: -110 ......... -30 | -30 ...... 30 | 30 .............. 210
      OFFICE TOWER (OT)  |  GRAND LOBBY  |  WELLNESS TOWER (VT)
      80 × 80, to 55 m   |  60 × 70 m,   |  180 × 120, to 112 m
      lift shafts on     |  48 m tall    |  lift shafts on
      the east facade →  |  The Link at  | ← the west facade
                         |  15 m (60 m)  |
                         |  PLAZA south  |
```

- **Grand Lobby atrium** (`L0`): X −30…30, Z −40…30, Y 0…48. Glass roof; south wall solid to 15 m,
  glass above; main doorway X −5…5 (6 m high) onto the plaza. The north wall's glass band is covered
  by the massive screen.
- **Entrance plaza** (`PLAZA`, outdoors): X −40…40, Z 30…62.
- **Office Tower (OT)**: X −110…−30, Z −40…40. **Wellness Tower (VT)**: X 30…210, Z −60…60. Floors from Y 15.
- **The Link** (`BRIDGE`): X −30…30, Z −3…3, **Y = 15** (60 m). Rev 10: it joins two real floors —
  the Trading Floor (`OT-01`) and the Executive Leisure Suite (`VT-01`) — entering each one's lift
  hall through a glass checkpoint vestibule. There are no sky-lobby floors any more. Seen from the
  lobby entrance it crosses in front of the lower part of the massive screen.
- **Basement** (`B1`): X −80…130, Z −40…40, Y −10…0.
- Rev 8 moved both towers 30 m towards the atrium. A few older prop builders are still offset by
  `PROP_DX` in `src/floors/index.js` (control, basement +30; racing −30; muaythai −60). Everything
  else uses the world coordinates in this file.
- **Every tower floor = lift hall + main space.** Lift hall: OT X −50…−30 (Z −40…40), VT X 30…50
  (Z −60…60). Main space: OT X −110…−50, VT X 50…210.

## 3. Floor-by-floor table

Elevation = Y of the floor slab. H = floor-to-floor height. W × D in metres.

### Basement

| Floor ID | Room ID | Sign label | Rect (X; Z) | Notes |
| --- | --- | --- | --- | --- |
| `B1` (Y −10, H 10) | `vault` | Treasury Reserve | −29…21; −25.2…32.5 (50 × 57.7) | The Office Chief Executive Lift (door at Z −23.4) and the Office freight lift (Z 23.5) open straight into it (west wall). North door to the corridor |
| `B1` | `server_room` | Infrastructure Core (IT) | −78…−38; 5…35 (40 × 30) | Rack rows |
| `B1` | `cash_robot_depot` | Autonomous Liquidity Courier Depot | 40…70; −38…−18 (30 × 20) | Charging bays |
| `B1` | `b1_service_corridor` | — | whole floor | Office low-rise lifts open at X −60, Wellness freight at X 60 |

### Entrance plaza (outdoors) — the game starts here

| Floor ID | Room ID | Sign label | Rect (X; Z) | Notes |
| --- | --- | --- | --- | --- |
| `PLAZA` (Y 0, outdoor) | `entrance_plaza` | Entrance Plaza | −40…40; 30…62 | Spawn (0, 57.5) facing the doors. Hedges, red carpet, gold canopy, fountain, flags, lamps, doormen, monument sign |
| `PLAZA` | `drop_off` | Arrivals Drop-off | −34…34; 49…55 | Drop-off lane, parked supercars |

### Ground — Grand Lobby (rev 9: one open hall)

**plaza → doors → security (2 lanes) → open hall → reception at the back → lifts (access controlled at each lift enclosure)**

| Room ID | Sign label | Rect (X; Z) | Notes |
| --- | --- | --- | --- |
| `grand_lobby` | Grand Lobby | −30…30; −40…30 | One open marble hall, no dividing walls |
| `security_checkpoint` | Asset Protection Screening | −5…5; 22…27 | **2 scanner lanes** at Z 24.5; the rest of the line is a full-width glass wall |
| `seating_west` / `seating_east` | Lobby Seating | −20…−8 / 8…20; 9…19 | Open seating areas (rugs, sofas, tables, plants), not rooms |
| `lobby_water_feature` | Reflection Pool | −8…8; −5…5 | Under The Link, on the axis |
| `reception_desk` | Reception | −12…12; −34…−27 | 24 m desk at the back of the hall with a backdrop wall, facing the entrance |
| `concierge` | Concierge | 13…19; −34…−27 | |
| `staff_turnstiles` | Staff Access | −23…−19; −25…−19 | The only way into the Office lift enclosure (locked for visitors) |
| `visitor_gates` | Guest Access | 19…23; −25…−19 | Open gates into the Wellness lift enclosure |
| `staff_elevator_bank` | Office Tower Lifts (Staff) | −30…−22; −37…−8 | Glass fence at X −21 from Z −38.7 to −6 |
| `visitor_elevator_bank` | Wellness Tower Lifts (Guests) | 22…30; −37…−8 | Glass fence at X 21 from Z −38.7 to −6 |

- **Massive screen**: 56 × 31.5 m on the north wall (Y 14.5…46) covering all its glass, with the firm
  name below it above reception. Chandeliers sit off the centre line at X ±23 so nothing blocks the
  view from the entrance.
- Removed at the user's request (2026-11-06): coat check, charity / Community Impact wall,
  lost-and-found display, VIP lounge room, the spine wall and gates line, and the planters.

### Office Tower (staff side) — main spaces X −110…−50 (lift hall X −50…−30)

| Floor ID | Elev. | H | Room ID | Sign label | Rect (X; Z) / notes |
| --- | --- | --- | --- | --- | --- |
| `OT-01` | 15 | 12 | `trading_floor` (+ `trading_viewing_gallery` −104…−54; 33…39, `ot_bridge_checkpoint` −38…−31; −6…6) | Trading Floor | Open plan. **Exchange floor, rebuilt from the user's photo of a real exchange**: 9 big hollow-ring trading posts (12 m across: X −97/−80/−63 × Z −29/−12.5/12.5) + 2 medium (9 m: X −97/−80, Z 26.8); aisle |Z| < 6 from the portal. Each post: lettered dark base wall → ring counter (blue-lit edge, monitors on arms, keyboards, stools) → open gap on thin supports → raised crown of 16 data screens tilted down → sloped member-logo band → grey ring deck (open centre, railing, cable trays), cable drops to the ceiling. Basket-weave parquet with inlaid blue/black stripes; glass TV booth on a platform (X −67…−55, Z 20.5…30.5) with rope stanchions; steel roof grid; tall blue window wall + bell balcony (W); firm banner (N), flag (S). **The Link enters here.** |
| `OT-02` | 27 | 10 | `lottery_institute` | Probability Research Institute | Open plan. Moved here from the Wellness Tower (rev 10). 12 rows of quant desks (triple monitors) with an aisle at Z 0, equation walls (W, N), draw-results wall + probability heat-map (S), whiteboards |
| `OT-03` | 37 | 5 | `thai_desk` | Thai Markets Desk | Open plan, desk rows N and S of the Z 0 aisle |
| `OT-04` | 42 | 5 | `security_hq` | Asset Protection HQ | Open plan: CCTV desks (N), lockers, roll-call benches + guards (S) |
| `OT-05` | 47 | 8 | Executive Floor rooms below | Executive Floor | |

Removed in rev 10 (user, 2026-11-06): Sports Desk, Leisure Operations, both sky lobbies.

`OT-05` rooms: `ceo_office` −108…−83; 18…38 · `boardroom` −79…−52; 23…38 ·
`cfo_office` −62…−52; −38…−26 · `legal` / `it` / `hr` −108…−88; −38…−23 / −19…−4 / 0…14 ·
`security_monitoring` −84…−66; −38…−26 · `cigar_lounge` −84…−64; −22…−7 ·
`master_dashboards` −84…−59; −2…13 · `trophy_wall` zone −83…−60; 15…21. The private lift opens
into the Executive Reception lift hall.

### Wellness Tower (public side, officially "wellness") — main spaces X 50…210 (lift hall X 30…50)

| Floor ID | Elev. | H | Room ID | Sign label | Rect / notes |
| --- | --- | --- | --- | --- | --- |
| `VT-01` | 15 | **22** | `leisure_suite` (+ `vt_bridge_checkpoint` 31…38; −6…6) | Executive Leisure Suite | **The Link enters here.** The lift-hall portal (18 m wide, Z −9…9) opens **straight onto the grand promenade**: red carpet with gold medallions, purple borders, cream marble walkways (Z −9.5…9.5) running to a focal screen on the east wall; columns at Z ±10.6; chandeliers down the centre under an orange/red coffered vault; lower purple soffits with glowing edges (15 m) over the gaming floor; pendant lamps; cream chairs at the tables. Zones: Yield Terminals 52…116; −56…−12 · Rotational 120…206; −56…−12 · Twenty-One 52…96; 12…56 · Private Banking 98…124 · Kinetic Pit 126…148 · **`card_salon` (walled) 152…206; 12…56** with `card_salon_high_limit` 193…205; 43…55 |
| `VT-02` | **53.5** | 13.5 (+16.5 below) | `football_arena` | Sports Analytics Arena | **Theatre-style box arena (DEMO rev 4 of the arena)**. Lifts stop at the concourse (53.5 m); the lift hall has no wall, so you walk straight to the **14 m-wide portal** (6 m high, gold/navy frame) in the outer wall and then **down**; the bowl sinks to the pit at 37 m (the Leisure Suite's ceiling). Wall radius 58 m. Levels L4 0 / L3 −4.5 / L2 −9 / L1 −13.5 / pit −16.5; fronts r 50/40/30/20. **Ramps flank the entrance** (centred ±0.36 rad either side of it, tops nearest the portal). 114 open boxes with hanging TV + 2 dashboards each. **Centre stack from the roof to the pit floor**: 3 tall eight-sided tiers (matches · odds + matches · matches), each screen ~12 m wide (16:9), LED rings between them, solid plinth; pit desks round its base at r 17. **Wrap-around LED ribbon** under the roof (Y 8.4…10.6) and **LED boards on every tier front**, one shared scrolling texture. **Hanging screens for the upper levels**: 12 double-sided at r 34 (for L3) and 16 at r 44.5 (for L4). Race feed = **F1 Grand Prix** (live timing tower + circuit map; simulated in Phase 0). Pop-ups: settlement (+/−, green/red, room-wide sound) **and every new position opened** (gold, "New position · Box … · team", short chime; simulated every 1.8–5 s in Phase 0). No ceiling screen |
| `VT-03` | 67 | 25 | `muay_thai_arena` (+ `ringside`, `pavilion_entry`, `pavilion_service_corridor`, `pavilion_backstage`, `red_corner_room`, `blue_corner_room`) | Combat Sports Analytics Pavilion | **Realistic Muay Thai stadium (rev 11, `floors/pavilion.js`)**, round bowl centred (120, 0). **Ring** 11 m platform (10 m inside 4 ropes), 1.2 m high, steps on the east (walkout) side; **ringside floor** r < 14 (officials' table, pi-phat musicians, cameras, LED boards) — staff/competitors only. **Lower bowl** 15 rows r 14–27.5 (front row 1.6 m above the floor, glass front, so no way down); **cross-aisle** r 27.5–29.5 at 6.1 m; **upper bowl** 14 rows r 29.5–42.4 to 12 m, gold-glass skyboxes on the back wall; **concourse** r 42.8–51.4 at 6.1 m with position windows. **7 vomitories** (sections 101–128) link the concourse to the cross-aisle. ~7,500 seats. **Spectator route**: narrow arrivals hall (X 30–44) → ticket gates + box office (X 44–55) → 8 m grand stairs up to the concourse → vomitory → seats. **Walkout**: Red/Blue dressing rooms (backstage X > 172) → tunnel under the concourse → lit runway (Z ±2.5, red/blue LED edges) through the seats → ring steps → corner; routes in `floor.walkout`. Backstage reached by the service corridor (Z < −53.4) through a locked door in the arrivals hall (`backstage` access). Atmosphere: glowing **sak yant ceiling** (r 47), two zig-zag truss rings, 16 light beams on the ring, 6 big screens. One height field with two levels (the tunnel under the concourse) — shapes get the walker's y |
| `VT-04` | 92 | 20 | `racing_hall` | Equine Performance Centre | Open plan; the **30 m-wide portal** opens straight onto the track. Track centres (98, 0) and (162, 0), outer R 42, inner R 30. Grandstand 80…180 north side. Tote 54…76; −59…−53 |

### Lift halls (rev 10 — replace the old foyers)

Every tower floor opens with **one big lift hall**: the full-depth strip between the shafts and the
floor's portal wall (20 m deep; 80 m long in OT, 120 m in VT). Passenger **and freight** landings
(and on `OT-05` the private lift) all open into it. Its portal wall runs floor-to-ceiling like the
rest of the floor (no box "popping out") and carries **one big themed portal** at Z 0 into the main
space. Generated in `building.js` (`HALLS`), dressed in `src/floors/halls.js`. Layout across the hall
(d = distance from the atrium facade): shafts 0…4 · landings 4…12 · call kiosks 12.6 · runner
13…15.5 · props 16.5 · portal wall 20.

| Floor | Hall sign | Theme | Portal (W × H) | Dressing |
| --- | --- | --- | --- | --- |
| OT-01 | Trading Floor — Members' Lift Hall | `trading` | 16 × 8 | green marble jambs, live ticker on the lintel, chart screens, bronze bull, **Link checkpoint** |
| OT-02 | Probability Research Institute — Lift Hall | `quant` | 14 × 7 | white/navy, lottery screen on the lintel, whiteboards, quant desks |
| OT-03 | Thai Markets Desk — Sala Hall | `thai` | 12 × 4.2 | red jambs with tiered gold gables, spirit house, orchids |
| OT-04 | Asset Protection — Screening Hall | `security` | 12 × 4.2 | hazard-striped jambs, blast-door leaves parked open, body scanner, CCTV |
| OT-05 | Executive Reception | `executive` | 10 × 5.5 | fluted marble + gold, reception desk, art |
| VT-01 | Executive Leisure Suite — Grand Hall | `portal` | 18 × 12 | gold arch with marquee bulbs, red carpet into the promenade, fountain, lanterns, **Link checkpoint** |
| VT-02 | Sports Analytics Arena — Concourse | `concourse` | no wall | flows straight into the arena portal; light blades + terminals at the hall ends |
| VT-03 | Combat Pavilion — Arrivals | `shrine` | 8 × 7 | **narrow hall** (X 30–44, Z −40…30) — portal straight onto the ticket gates and stairs; locked competitors' door in the north wall |
| VT-04 | Equine Centre — Paddock Hall | `paddock` | 30 × 12 | white rails, race + odds screens on the lintel, horse statue |

**Link checkpoint** (OT-01 and VT-01): a glass vestibule round the bridge mouth (d 1…8, Z −6…6) with
a locked gate (`bridge` access) at d 8.

## 4. Lifts (real, moving)

Every car has its own shaft (0.2 m walls) running from its lowest to its highest stop. Floor
slabs and ceilings have holes where shafts pass. Cars are **through-cars**: they open on the
atrium/basement side at `L0`/`B1` and on the tower side at tower floors. Calls work by
destination dispatch: choose a floor at the landing, a car is assigned, it comes, you board,
it takes you there. Inside a car, E gives the floor panel.

| Bank | Cars | Shafts (X; Z) | Stops | Speed |
| --- | --- | --- | --- | --- |
| `ot_low` Office Low-Rise | 4 (OT-L1…4) | −34…−30; −38.6…−25.8 | B1, L0, OT-01, OT-02 | 5 m/s |
| `ot_high` Office High-Rise | 4 (OT-H1…4) | −34…−30; −21…−8.2 | L0, OT-03…OT-05 (express past 1–2) | 7 m/s |
| `ceo` Chief Executive Lift (Office) | 1 (OT-X1, ~8.5 × 3.9 m cab, 15+ people) | −39…−30; −25.6…−21.2 (between low- and high-rise) | B1 (into the vault), L0 (tours board here), OT-05 | 7 m/s |
| `freight_ot` | 1 (OT-F1) | −35…−30; 21…26 | B1 (vault), OT-01…OT-05 | 3 m/s |
| `vt_low` Wellness Low-Rise | 4 (VT-L1…4) | 30…34; −38.6…−25.8 | L0, VT-01, VT-02 | 5 m/s |
| `ceo_vt` Chief Executive Lift (Wellness) | 1 (VT-X1, ~8.5 × 3.9 m cab, 15+ people) | 30…39; −25.6…−21.2 (between low- and high-rise) | L0, VT-01…VT-04 | 7 m/s |
| `vt_high` Wellness High-Rise | 4 (VT-H1…4) | 30…34; −21…−8.2 | L0, VT-03, VT-04 (express) | 8 m/s |
| `freight_vt` | 1 (VT-F1) | 30…35; 21…26 | B1, VT-01…VT-04 | 3 m/s |

Landing (call) zones are 8 m deep in front of each bank's doors, all inside the lift hall. The
bridge opening (Z −3…3, OT-01 / VT-01 only) sits between the high-rise bank and the CEO/freight
shafts. Cash robots ride the freight lifts: ALC-01 vault → OT-03 Thai Markets Desk; ALC-02 vault →
OT-01 → The Link → VT-01 Leisure Suite.

## 5. Naming conventions

- **Floor IDs**: `PLAZA`, `B1`, `L0`, `OT-01`…`OT-05`, `VT-01`…`VT-04`, `BRIDGE`. Never "Casino Tower".
- **Room IDs**: `snake_case`, globally unique, stable once shipped (future DB keys).
  Full address form: `FLOOR/room`, e.g. `OT-05/ceo_office`.
- **Three labels per room**: `id` (code), `sign` (in-world corporate euphemism; see
  `voice-and-satire`), `short` (≤ 14 chars, minimap). Internal plain names (Casino Operations,
  Thai Betting Desk) may appear in code comments only.
- **Lift IDs**: bank ids above; cars `<bank>_<n>`, shown to players as `OT-L1`, `OT-H3`, `OT-X1`,
  `OT-F1`, `VT-L2`…
- **Files**: layout data only in `src/layout/building.js`. Floor shells (slab, walls, shafts,
  landing doors, rooms, signs) come from `src/floors/base.js`. Props live in one module per area
  (`lobby.js`, `officeTower.js`, `visitorsTower.js`, `arena.js`, `basementBridge.js`, and
  `halls.js` for every lift hall), one builder per floor,
  selected by the floor's `props` key. Moving lifts are in `src/elevators.js`.

## 6. Access rules

| Area | Visitor | Visitor with clearance | Visitor on CEO tour | Admin (Staff) | CEO | Cash robot |
| --- | --- | --- | --- | --- | --- | --- |
| `L0` guest side + `VT-*` (Wellness lifts) | yes | yes | yes | yes | yes | yes |
| `L0` staff side (past turnstiles) | no | yes | yes | yes | yes | yes |
| Glass Bridge | no | yes | yes | yes | yes | yes |
| `OT-01` trading floor | no | watch only | yes | yes | yes | yes |
| `OT-02` Probability Research Institute (cleared-only by decision, 2026-11-06) | no | yes | yes | yes | yes | yes |
| `OT-03…04` | no | yes (view) | yes | yes | yes | yes |
| `OT-05` | no | no | yes | yes | yes | yes |
| `B1` | no | no | yes (CEO lift) | yes | yes | yes |
| `VT-03` ringside, walkout, backstage, dressing rooms | no | no | no | yes | yes | — |
| Freight lifts | no | no | no | yes | yes | yes |

- Enforced by colliders (locked barriers are solid) and by the lift kiosks and car panels.
  A lift cannot be called to a floor its bank doesn't serve, or from one.
- Landing doors are solid unless a car is at that floor with its doors open. You can't walk
  into an empty shaft.
- Tour access lasts only while the visitor is with the tour group (later phases).
- Phase 0 has a debug role switcher: keys 1–5 for Visitor / Cleared / Tour / Admin / CEO.

### Minimap / floor list

Always visible: tower, floor ID + `short` label, current room (or "In lift OT-H2 · 23 m"), a
floor list generated from the layout data (OT column, shared column BRIDGE/L0/B1, VT column),
and a top-down map with rooms, lift shafts and landing zones.

## Future-phase notes (user, 2026-11-06)

- `VT-03` Combat Pavilion: improve the lighting (more dramatic ring/bowl stage lighting), the ceiling
  already **breathes** (sak yant ceiling glow only, ~5 s; spotlights steady); later make it react to fight events.
- `VT-03` crowd reactions for the planned player fights (user, 2026-11-06), three escalating levels:
  1. a fighter **loses health** (lands a hit) → crowd **cheers**;
  2. a fighter is **knocked out** ("dies" / health reaches 0) → crowd cheers **very loud**;
  3. a fighter **wins** the bout → crowd cheers **very, very loud** (the loudest).
  Room-wide sound (like the arena pop-up sounds), heard only inside the pavilion; the breathing
  ceiling could flare with each level.
- `VT-03` walkout spotlights (user, 2026-11-06): during the fighters' walkout, the spotlights swing
  off the ring and **track the walking fighters** — **each spotlight is assigned to one fighter** and
  follows them (dressing room tunnel → runway → ring). The 16 beams in `floors/pavilion.js` are
  already separate meshes (from the truss ring at r 36 towards the ring), so each can be re-aimed
  every frame at its fighter's position along `floor.walkout`.
- `VT-01` Executive Leisure Suite content (user, 2026-11-06): it should hold the usual Las Vegas
  floor staples — **big progressive-jackpot slot banks in the style of Megabucks** (towering linked
  cabinets with a giant shared jackpot meter overhead; own name/branding, not the real trademark),
  **roulette (top priority: plenty of tables, prominent placement)**, **blackjack**, and **poker**
  (Card Salon). In-world names stay euphemistic per `voice-and-satire` (e.g. Automated Yield
  Terminals, Rotational Variance Instruments, Twenty-One Advisory Tables, Strategic Negotiation).

## Phase 1 — ground floor (2026-11-06)

The Grand Lobby (`L0`), the Entrance Plaza and The Link are the first floors rebuilt in the Phase 1
look (`lux: true` on the floor). Everything else is still greybox. See `verification/phase-1-ground-floor/`.

- **Look**: warm polished marble, dark walnut panelling (side walls panelled to the roof), bronze,
  tinted glass; cube-crystal chandeliers; warm lamps and sconces. Physically based materials
  (`src/world/lux.js`), image-based reflections, filmic tone mapping, soft sun shadows and a bloom
  pass, all switched on only for the ground floor (`setLook` in `main.js`: indoor / outdoor profiles).
- **Lobby layout** (same as the greybox): revolving doors → glass-sided 2-lane security (walk-through
  arches at X ±2.5 + bag x-ray machines) → hall with two lounges and the reflection pool (gold
  sculpture, jets) → curved walnut reception desk in front of a back-lit onyx wall, under the new
  **Members' Mezzanine** (Z −39…−33, Y 6.5; escalators west, marble stair east; lounge + bar).
  Concierge at X 15–19, Z −31.
- **Lifts**: every car has a Phase 1 cabin (walnut, mirror, bronze rail and frame, marble floor, lit
  ceiling, brushed-bronze doors). Lobby landings are complete portals: dark shaft enclosure behind
  the wall (0–15 m), bronze reveals through the wall, bronze sill, granite architrave, live floor
  indicator, call buttons. The two **Chief Executive Lifts** (above) are tour/staff/CEO only
  (`ceo_lift` area).
- **Screens**: ground-floor screens use their own canvases at their true aspect ratio and size
  (`src/world/lobbyScreens.js`): the 56 × 31.5 m market dashboard, market boards over the lift
  banks, x-ray and reception monitors. Prices are simulated until Phase 3.
- **Plaza**: granite paving, red carpet with brass stanchions, cantilevered glass canopy, bronze
  curtain-wall entrance facade, fountains with jets, waving flags, sculpted hedges, trees, lamps,
  supercars at the drop-off, monument sign; street and distant skyline beyond.

## Notes for future phases (user)

- **Third-person gameplay only.** The current player character model is a placeholder.
- **Screens elsewhere**: the shared screen atlas (`src/world/screens.js`) overlaps text — ticker
  labels (~230 px) are spaced 150 px apart and text is not clipped to its cell, so it bleeds into
  neighbouring channels. Fix building-wide (measure text, clip each cell) when each floor gets its
  Phase 1 pass; the ground floor already uses its own displays.
