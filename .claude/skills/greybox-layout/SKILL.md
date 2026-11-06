---
name: greybox-layout
description: Building layout source of truth for the firm — scale rules, massing (Office Tower | atrium Grand Lobby | Wellness Tower), the floor-by-floor room table with dimensions and elevations, the lift banks and shafts, room/floor naming conventions, and lift/bridge access rules by role. Use whenever creating, moving, resizing, labelling or connecting any floor, room, lift, bridge or minimap entry.
---

# Greybox Layout (rev 12 — 2026-11-06)

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

Rev 12 changes, requested by the user (2026-11-06): a new `OT-03` **Global Client Outreach Centre**
(greybox, from the user's reference images). Its lift hall is at 52 m and the portal opens onto the
**top tier of a four-level operator structure standing in a 15 m-deep pit** (the whole main space sinks
to 37 m). `OT-04` and `OT-05` move up to 62 and 67; the Office Tower now tops out at 75 m.

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
      80 × 80, to 75 m   |  60 × 70 m,   |  180 × 120, to 112 m
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
| `OT-01` | 15 | 12 | `trading_floor` (+ `ot_bridge_checkpoint` −38…−31; −6…6; the guest viewing gallery was removed in Phase 1) | Trading Floor | Open plan. **Exchange floor, rebuilt from the user's photo of a real exchange**: 9 big hollow-ring trading posts (12 m across: X −97/−80/−63 × Z −29/−12.5/12.5) + 2 medium (9 m: X −97/−80, Z 26.8); aisle |Z| < 6 from the portal. Each post: lettered dark base wall → ring counter (blue-lit edge, monitors on arms, keyboards, stools) → open gap on thin supports → raised crown of 16 data screens tilted down → sloped member-logo band → grey ring deck (open centre, railing, cable trays), cable drops to the ceiling. Basket-weave parquet with inlaid blue/black stripes; glass TV booth on a platform (X −67…−55, Z 20.5…30.5) with rope stanchions; steel roof grid; tall blue window wall + bell balcony (W); firm banner (N), flag (S). **The Link enters here.** |
| `OT-02` | 27 | 10 | `lottery_institute` | Probability Research Institute | **Greybox rev 2 (user's reference image, 2026-11-06; `floors/probability.js`)**: a quant research lab for the Thai lottery. **Draw platform** X −92…−68, Z −11…11, 1.2 m high (gold side band, glass rail): main stair east (facing the portal, Z −4…4), side stairs N and S (X −91…−86); 4 control consoles with lab-coat operators. **Draw drum** at (−80, 0): geodesic glass cage (r 3.3, centre +6 m, spins about its Z axle) on a gold A-frame, ~160 instanced balls tumbling inside. **Animatronic "Chief Draw Officer"**: giant lab-coat robot (glasses, tie, cyan eyes) at (−78.5, −7.6) on the platform; one 2-bone IK arm (4 + 4 m, elbow down, claw always down) runs a 9.5 s draw cycle: rest → over the drum → in → grab → out → over the **Drawn Numbers** rack (−72.5, −9.8; 6 cups) → drop → rest; the rack clears after six. **Floating holo panels** (8, translucent, tilted): "Thai Lottery Pattern Analysis", "สถิติหวย · Draw Frequency", "Predictive Model v7.3". ~140 lab-coat quants at triple-monitor desks round the platform, aisle |Z| < 4 with yellow/green guide lines from the portal. **North mezzanine** "Model Validation Gallery" (Y 4.5, Z −39…−29, stair at X −60…−56 down to the south) with desks + racks; server racks under it and in the SW corner. Window walls S and W, roof trusses, draw-results screen on the N wall above the gallery, heat-map on the portal wall, planters |
| `OT-03` | **52** | 10 (+15 below) | `outreach_centre` | Global Client Outreach Centre | **Sunken tiered structure (greybox, rev 12)** from the user's reference images. Only the lift hall has a slab at 52 m: the whole main space (X −109…−50, Z −39…39, `slabHoleRect`) is a **pit** whose floor is at 37 m (on top of OT-02's ceiling); the pit walls are built by `outreach()` (the shell only builds walls above the slab). The 12 × 6 m portal opens onto the **Arrival Bridge** (X −62…−50, Z −6…6) straight onto the **top tier** of the **Outreach Tower** (footprint X −100…−62, Z −26…26). **Levels**: tiers at 0 / −5 / −10 (relative to 52) + the pit floor at −15; each tier has a central **void** (X −88…−74, Z −9…9) with glass rails, neon fascias (cyan / magenta / blue), edge rails and ~40–60 headset operators at triple-monitor desks. **Stairs**: zig-zag flights on the east face, mirrored north and south of the bridge — F1 column A (X −62…−59) Z 6→13 to tier −5, landing Z 13…16, F2 column B (X −59…−56) Z 13→6 to tier −10, landing Z 3…6, F3 column A Z 6→13 to the pit floor (20 × 0.25 m risers, 7 m run); tall glass panes stop anyone stepping off a flight. **Top tier**: canopy at +5 with the floor name facing the portal ("GLOBAL CLIENT OUTREACH CENTRE", "REVENUE GENERATION", "GLOBAL FINANCE"), 3 glass **Senior Relationship Management** offices on the west side. Level signs: CALL CENTRE 7 · CLIENT OUTREACH (−5), REMOTE DEVICE ASSISTANCE (−10), REVENUE GENERATION · LIQUIDITY OPERATIONS (pit). **Liquidity Transfer Core** (6 × 6 m) rises from the pit floor through the void to a four-sided **Global Outreach Status** screen under the ceiling. **Pit floor**: server racks round the moat (N, S, W), cable runs, desks under the bridge, people milling, **Operator Assistance** booth at the foot of the south stairs; **Client Journey whiteboard** on the N pit wall (FIRST CONTACT → … → LIQUIDITY EVENT), **Top Closers** board on the W wall. The player's ground over `slabHoleRect` comes only from colliders (`player.js`). Plain name in code comments only: the scam call centre. |
| `OT-04` | 62 | 5 | `security_hq` | Asset Protection HQ | Open plan: CCTV desks (N), lockers, roll-call benches + guards (S) |
| `OT-05` | 67 | 8 | Executive Floor rooms below | Executive Floor | |

Removed in rev 10 (user, 2026-11-06): Sports Desk, Leisure Operations, both sky lobbies. Removed later the same day (user): the old `OT-03` Thai Markets Desk; its id was reused for the Global Client Outreach Centre (rev 12).

`OT-05` rooms: `ceo_office` −108…−83; 18…38 · `boardroom` −79…−52; 23…38 ·
`cfo_office` −62…−52; −38…−26 · `legal` / `it` / `hr` −108…−88; −38…−23 / −19…−4 / 0…14 ·
`security_monitoring` −84…−66; −38…−26 · `cigar_lounge` −84…−64; −22…−7 ·
`master_dashboards` −84…−59; −2…13 · `trophy_wall` zone −83…−60; 15…21. The private lift opens
into the Executive Reception lift hall.

### Wellness Tower (public side, officially "wellness") — main spaces X 50…210 (lift hall X 30…50)

| Floor ID | Elev. | H | Room ID | Sign label | Rect / notes |
| --- | --- | --- | --- | --- | --- |
| `VT-01` | 15 | **22** | `leisure_suite` (+ `vt_bridge_checkpoint` 31…38; −6…6) | Executive Leisure Suite | **The Link enters here.** The lift-hall portal (18 m wide, Z −9…9) opens **straight onto the grand promenade**: red carpet with gold medallions, purple borders, cream marble walkways (Z −9.5…9.5) running to a focal screen on the east wall; columns at Z ±10.6; chandeliers down the centre under an orange/red coffered vault; lower purple soffits with glowing edges (15 m) over the gaming floor; pendant lamps; cream chairs at the tables. Zones: Yield Terminals 52…116; −56…−12 · Rotational 120…206; −56…−12 · Twenty-One 52…96; 12…56 · Private Banking 98…124 · Kinetic Pit 126…148 · **`card_salon` (walled) 152…206; 12…56** with `card_salon_high_limit` 193…205; 43…55 |
| `VT-02` | **53.5** | 13.5 (+16.5 below) | `football_arena` | Sports Analytics Arena | **Theatre-style box arena (DEMO rev 5 of the arena, user 2026-11-06)**. Bowl centred **(108, 0)**, wall radius 58 m, so the wall touches the arrivals hall's east wall at X 50. Lifts stop in a **compact walled arrivals hall** (X 30…50, Z −40…30); its exit **is** the arena's **14 m-wide portal** (6 m high) — no concourse in between. Inside the portal there are **no boxes**: a **grand stair** (radial aisle ±0.125 rad, ~14.5 m wide at the top, ~4.8 m at the pit) runs straight down — top landing r 54–58, flights r 54→47 / 44→37 / 34→27 / 24→19.3 (0.18 m risers, ~0.28 m treads, glass balustrades + gold rail), landings on the L3/L2/L1 walkways (r 44–47 / 34–37 / 24–27) — to the pit at 37 m (the Leisure Suite's ceiling). Levels L4 0 / L3 −4.5 / L2 −9 / L1 −13.5 / pit −16.5; fronts r 50/40/30/20. **No ramps** (removed by the user, rev 6): the grand stair is the only way between levels and the boxes run continuously round each level from one side of the stair to the other. Open boxes, each with its own TV, 2 recliners and a position console per seat. **Centre stack from the roof to the pit floor**: 3 tall eight-sided tiers (matches · odds + matches · matches), each screen ~12 m wide (16:9), LED rings between them, solid plinth; pit desks round its base at r 17. **Wrap-around LED ribbon** under the roof (Y 8.4…10.6) and **LED boards on every tier front**, one shared scrolling texture. **Hanging screens for the upper levels**: big double-sided screens (7.2 m at r 34 for L3, 8 m at r 44.5 for L4) on the line of **every third box divider**, i.e. between two box TVs. Race feed = **F1 Grand Prix** (live timing tower + circuit map; simulated in Phase 0). Pop-ups: settlement (+/−, green/red, room-wide sound) **and every new position opened** (gold, "New position · Box … · team", short chime; simulated every 1.8–5 s in Phase 0). No ceiling screen |
| `VT-03` | 67 | 25 | `muay_thai_arena` (+ `ringside`, `pavilion_entry`, `pavilion_service_corridor`, `pavilion_backstage`, `focus_room`) | Combat Sports Analytics Pavilion | **Realistic Muay Thai stadium (rev 11, `floors/pavilion.js`)**, round bowl centred (120, 0). **Ring** 11 m platform (10 m inside 4 ropes), 1.2 m high, steps on the east (walkout) side; **ringside floor** r < 14 (officials' table, pi-phat musicians, cameras, LED boards) — staff/competitors only. **Lower bowl** 15 rows r 14–27.5 (front row 1.6 m above the floor, glass front, so no way down); **cross-aisle** r 27.5–29.5 at 6.1 m; **upper bowl** 14 rows r 29.5–42.4 to 12 m, gold-glass skyboxes on the back wall; **concourse** r 42.8–51.4 at 6.1 m (a plain corridor: the position windows were removed by the user, 2026-11-06). **7 vomitories** (sections 101–128) link the concourse to the cross-aisle. ~7,500 seats. **Spectator route**: narrow arrivals hall (X 30–44) → ticket gates + box office (X 44–55) → 8 m grand stairs up to the concourse → vomitory → seats. **Walkout**: the small black **`focus_room`** "Competitors' Focus Room" (X 172–180, Z −4…4, 4.2 m high, black walls/floor/ceiling, one cold light, a bench each side; both fighters wait here; the dressing rooms were removed by the user, 2026-11-06) opens straight onto the walkout road → tunnel under the concourse → lit runway (Z ±2.5, red/blue LED edges) through the seats → ring steps → corner; routes in `floor.walkout`. A 2 m door at the back of the focus room leads to backstage (X > 172), reached by the service corridor (Z < −53.4) through a locked door in the arrivals hall (`backstage` access). Atmosphere: glowing **sak yant ceiling** (r 47), two zig-zag truss rings, 16 light beams on the ring, 6 big screens. One height field with two levels (the tunnel under the concourse) — shapes get the walker's y |
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
| OT-01 | Trading Floor — Members' Lift Hall | Phase 1 (`tradingFloor.js`, `customHall`) | 16 × 8 | cream + gunmetal, navy dado, terrazzo; **Link checkpoint in a recess in the core** (see Phase 1 — OT-01) |
| OT-02 | Probability Research Institute — Lift Hall | `quant` | 14 × 7 | white/navy, lottery screen on the lintel, whiteboards, quant desks |
| OT-03 | Global Client Outreach Centre — Lift Hall | `outreach` | 12 × 6 | dark slate, cyan accent, neon cyan / magenta jambs, chart band on the lintel |
| OT-04 | Asset Protection — Screening Hall | `security` | 12 × 4.2 | hazard-striped jambs, blast-door leaves parked open, body scanner, CCTV |
| OT-05 | Executive Reception | `executive` | 10 × 5.5 | fluted marble + gold, reception desk, art |
| VT-01 | Executive Leisure Suite — Grand Hall | `portal` | 18 × 12 | gold arch with marquee bulbs, red carpet into the promenade, fountain, lanterns, **Link checkpoint** |
| VT-02 | Sports Analytics Arena | Phase 1 (`sportsArena.js`, `customHall`) | 14 × 6 | **compact hall** (X 30–50, Z −40…30, rev 5) — the portal is the arena entrance itself, straight onto the head of the grand stair (see Phase 1 — VT-02) |
| VT-03 | Combat Sports Analytics Pavilion (arrivals) | Phase 1 (`combatPavilion.js`, `customHall`) | 8 × 7 | **narrow hall** (X 30–44, Z −40…30) built by `luxLiftHall` with `depth: 14` and an `endDoor` gap for the locked competitors' door in the north wall; portal straight onto the ticket gates and stairs (see Phase 1 — VT-03) |
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
| `ot_high` Office High-Rise | 4 (OT-H1…4) | −34…−30; −21…−8.2 | L0, OT-03, OT-04, OT-05 (express past 1–2) | 7 m/s |
| `ceo` Chief Executive Lift (Office) | 1 (OT-X1, ~8.5 × 3.9 m cab, 15+ people) | −39…−30; −25.6…−21.2 (between low- and high-rise) | B1 (into the vault), L0 (tours board here), OT-01…OT-05 (every Office floor) | 7 m/s |
| `freight_ot` | 1 (OT-F1) | −35…−30; 21…26 | B1 (vault), OT-01…OT-05 | 3 m/s |
| `vt_low` Wellness Low-Rise | 4 (VT-L1…4) | 30…34; −38.6…−25.8 | L0, VT-01, VT-02 | 5 m/s |
| `ceo_vt` Chief Executive Lift (Wellness) | 1 (VT-X1, ~8.5 × 3.9 m cab, 15+ people) | 30…39; −25.6…−21.2 (between low- and high-rise) | L0, VT-01…VT-04 | 7 m/s |
| `vt_high` Wellness High-Rise | 4 (VT-H1…4) | 30…34; −21…−8.2 | L0, VT-03, VT-04 (express) | 8 m/s |
| `freight_vt` | 1 (VT-F1) | 30…35; 21…26 | B1, VT-01…VT-04 | 3 m/s |

Landing (call) zones are 8 m deep in front of each bank's doors, all inside the lift hall. The
bridge opening (Z −3…3, OT-01 / VT-01 only) sits between the high-rise bank and the CEO/freight
shafts. Cash robots ride the freight lifts: ALC-01 vault → OT-04 Asset Protection HQ; ALC-02 vault →
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
| `OT-03` | no | yes (view) | yes | yes | yes | yes |
| `OT-04` | no | yes (view) | yes | yes | yes | yes |
| `OT-05` | no | no | yes | yes | yes | yes |
| `B1` | no | no | yes (CEO lift) | yes | yes | yes |
| `VT-03` ringside, walkout, backstage, focus room | no | no | no | yes | yes | — |
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
  follows them (focus room → tunnel → runway → ring). The 16 beams in `floors/pavilion.js` are
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

## Phase 1 — OT-01 Trading Floor (2026-11-06)

Rebuilt in the tone of the user's stylised exchange-floor image (`src/floors/tradingFloor.js`,
lighting profile `trading` in `main.js`). See `verification/phase-1-ot01/`.

- **Look**: warm tan oak floor with navy/red inlays; cream walls, gunmetal pilasters on the truss
  lines (X −104/−88/−72/−56); cream coffered ceiling (underside Y 11.55) with warm yellow light panels;
  gunmetal Warren trusses N–S on the pilaster lines and E–W at Z ±36/±28/±20.75/±12/±4, bottom chord
  Y 9.5; columns at those X × Z ±20.75; yellow pendant lamps; west wall = two recessed bays of blue
  windows (Z ±8.6…±29.6) with the navy firm banner and the bell balcony (Z ±6) between them; flag on
  the north wall; hanging navy bell sign over the aisle at X −72.
- **Posts**: unchanged layout and hollow-ring design, recoloured grey with red accent stripes.
- **Screens**: every trading-floor screen samples ONE static atlas (`src/world/tradingScreens.js`,
  48 clipped cells: charts, bars, candles, quotes, heat-maps, order books); wall boards are the sharp
  `marketBoard` displays.
- **Crowd + clutter** (user: "more dense, more chaos"): ~500 people — specialists in every post, a
  packed counter ring and a second rank (fidgeting: turn + bounce), ~80 walkers; broker booth rows on
  the window wall (X −108…−106), the portal wall (X −52.3…−50.4, Z ±10…±37.5) and the south wall
  (Z 37…38.9); ~26 monitor pods in the gaps; 2,600 trading slips. Lux people support `walk`,
  `speed` and `fidget`.
- **Lift hall** (X −50…−35.1): cream core cladding at X −35.1 with gunmetal portals for every door
  that stops here; the Chief Executive Lift stands proud (face X −39.1); navy dado + red cap; tan
  terrazzo; runners; kiosks; planters; market pylons; market boards over the low- and high-rise
  banks. **The Link checkpoint** is a recess in the core (Z ±6.3, X −35.1…−31, 5 m high): speed
  gates at X −33.6 with a wide escort lane, glass side panels, invisible `bridge` barrier, guards.

## Notes for future phases (user)

- **Third-person gameplay only.** The current player character model is a placeholder.
- **Screens elsewhere**: the shared screen atlas (`src/world/screens.js`) overlaps text — ticker
  labels (~230 px) are spaced 150 px apart and text is not clipped to its cell, so it bleeds into
  neighbouring channels. Fix building-wide (measure text, clip each cell) when each floor gets its
  Phase 1 pass; the ground floor already uses its own displays.

## Phase 1 — VT-02 Sports Analytics Arena (2026-11-06, rev 2)

Rebuilt from scratch in `src/floors/sportsArena.js` (lux floor, `customHall`, lighting profile `arena`
in `main.js`). The greybox `arena.js` is only the **placement guide**: its layout data (bowl centre
(108, 0), level radii/heights, `BOXES`, `FLIGHTS`), its walkable shape and its live layer (`arenaLive`:
broadcast screens, pop-ups, sounds, simulated positions) are reused; every visible surface is new.
`ARENA.ramps = false` (user, rev 2): no ramps.

- **Lighting** (user's reference image: dark indigo hall, warm-gold ceiling halo, blue neon): dark
  lattice roof trusses (24, with diagonal braces) over a navy ceiling; **7 concentric rings of warm-gold
  light segments** between the trusses and a double gold halo over the screen stack; blue neon bands
  on the outer wall (y 7.6 and 11.6), under every tier front and under each stack tier; glossy terrazzo
  walkways; low cool fill (`arena` look: hemi 0.34 indigo, exposure 1.0, bloom 0.55; `bloom` is now a
  per-look setting).
- **Outer wall**: walnut dado + warm cove light, navy skin with dark pilasters every 6 m, the 360° ribbon
  in a gold frame, **5 big lit "SPORTS ANALYTICS" signs** (football icon) each flanked by two screens.
- **Tiers**: one continuous terrazzo floor per level (box band + walkway, tucked under the walls); tier
  fronts = walnut panelling with sconces under a navy fascia carrying the LED board, blue neon line
  under it, gold top trim.
- **Boxes**: carpet per box, glass front with a brass rail, frosted dividers on walnut posts, glass back
  rail with the door gap, **2 leather recliners** (instanced, cognac / cream / espresso / claret) with a
  walnut side table, **a position console per seat** (pedestal + screen tilted up to the sitter; atlas
  cells 20–23: market, 1/X/2 pricing, allocation chips, Open Position, notional balance) and the box
  **TV facing the seats** on a black gantry.
- **Grand stair**: marble treads with brass nosing, navy risers with a gold step light, navy runner,
  glass balustrades with brass rails; **continuous walnut cheek walls** following the pitch line (no
  per-step sawtooth); walnut "LEVEL n" pylons at the front edge of each landing.
- **No-holes construction**: floors run 0.3 m under the walls they meet, walls start 0.3 m below the
  floor they stand on, treads tuck under the cheek walls, the cheek walls step up 6 cm before each level
  edge (closing the corner behind the tier fascia), and a dark backstop (`arCatch`) closes the bowl's
  underside. Verified with a **magenta hole test** (background + backstop painted magenta, 44 views:
  top-down, walkways on every level, stair sides, corners): 0 magenta pixels.
- **Screens/text**: every label in the broadcast atlas is fitted and clipped per cell (scoreboard bug
  rebuilt: [kit|HOME| 1 - 0 |AWAY|kit][clock] … [LIVE]); the LED ribbon texture sizes each message to its
  measured width and keeps true letter proportions on every band height; closed rings use whole repeats.
- **Pit**, **stack** and **arrivals hall**: as rev 1 (crest-inlaid pit, analyst desks, black/gold stack,
  shared `luxLiftHall` with `z0`/`z1` and `link: null`).
- **Perf** (dev machine, worst view): 178 draw calls incl. bloom passes, 631k triangles, ~1.6 ms.

## Phase 1 — VT-03 Combat Sports Analytics Pavilion (2026-11-06)

Rebuilt from scratch in `src/floors/combatPavilion.js` to the user's reference photo (lux floor,
`customHall`, lighting profile `pavilion` in `main.js`: hemi 0.28 warm red, exposure 1.0, bloom 0.45).
The greybox `pavilion.js` is only the **placement guide**: its layout data (`PAV`: ring, bowl radii and
row heights, cross-aisle, vomitories, concourse, entrance, stairs, walkout, focus room) and its walkable
height field (`pavilionShape`) are reused, so every route and collision is unchanged.

- **Dome**: a shallow dome over the whole bowl and concourse (edge r 51.7 at 19.9 m, centre 24.5 m) with a
  2048 px sak yant texture: glowing red-gold script rings (Thai numerals in the band), 12 oval cartouches
  of script, unalome loops, a spiral of script and nine spires in the centre. It still **breathes**
  (`ctx.breath`, ~5 s, colour scalar 0.35–1.15). The texture is mirrored in u so it reads correctly from below.
- **Crown + beams**: a jagged truss crown at r 45.2 (48 up/down members, 2 chords top and bottom, hung on
  steel rods), a lamp at each low point; 16 additive beams (white / blue / green, opacity 0.028) from the
  lamps onto the ring. **20 LED light towers** stand on the skybox roof round the rim (clear of the gate).
- **Ring**: dark platform with blue LED edge lines, blue canvas with a gold Thai border and crest, gold
  posts with red / blue / white pads, 4 ropes (red, white, blue, white), steps on the walkout side; a
  **square lighting rig** (13 m, 24 lamps) hung over it; fighters, referee, officials' table, pi-phat
  musicians, 4 camera positions.
- **Bowl**: concrete treads with dark risers; red lacquer front barrier with glass, gold rail, blue LED
  line and ringside LED boards; stair aisles with warm step lights; cross-aisle with glass ends;
  ~7,000 **instanced red seats** (16 sectors × 2 tiers) and a **standing night crowd** (34 % of seats,
  mostly dark / white shirts); vomitory portals with gold lintels and section plaques; a band of
  **gold-lit skyboxes** (glass, lit interiors, gold mullions, people) along the top of the bowl.
- **The stage (fighters' gate, east)**: gold pillars with red / blue corner lights over the tunnel mouth,
  a red-lacquer panel with the Pavilion crest screen, and above it the **three-screen stage** of the
  reference: a centre fight screen crowned by three tiers of pointed gold gables (hang hong finials,
  chofa spire) flanked by two big screens (card, scorecard) in ornate gold frames.
- **Concourse**: stone floor, red lacquer walls with a gold lai-thai lattice, gold friezes, warm sconces,
  dark ceiling at 10.6 m with warm downlights, walkers; no position windows.
- **Entrance**: lacquer corridor with walnut dado, gold pilasters, warm LED line, coffered ceiling, steel
  and gold ticket gates, walnut box office, gold header plaque, stone grand stairs with gold nosing, red
  runner and gold handrails.
- **Walkout**: black runway with red / blue LED edges and warm centre dashes, LED lines along the trench
  walls and the tunnel, tunnel lamps; the black focus room (benches, one cold light, both fighters).
- **Screens**: own atlas `src/world/fightScreens.js` (2 × 2 cells, 6 Hz while visible): live fight feed
  (simulated bout, round / clock, names, camps), tonight's card with pricing, official scorecard, Pavilion
  brand. Every label fitted and clipped per cell. Simulated bouts use invented real-style names.
- **Checks**: magenta hole test, 34 views (ringside, cross-aisle, top rows, vomitories, concourse,
  entrance, stairs, tunnel, focus room): 0 pixels. Walk: lift hall → entrance → stairs → concourse →
  vomitory → cross-aisle → down to the front row (stopped at the barrier); focus room → tunnel → ring;
  visitors still locked out of backstage.
- **Perf** (dev machine): worst view 178 draw calls incl. bloom passes, 1.12 M triangles (mostly the
  crowd), ~3.6 ms.

