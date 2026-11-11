# Phase 1 — OT-03 Global Client Outreach Centre + OT-04 Asset Protection HQ — 2026-11-09

User requests (same session): (1) redesign OT-03, especially the desks, so it reads as the actual
operation; (2) then "do phase 1 (looks part) for OT-3 and OT-4".

## What was built

### OT-03 desk / operation redesign (`src/floors/outreach.js`, moved out of officeTower.js)
- Partitioned operator stations in rows (3 m pitch, 1.6 m seats, cross aisles at X −89 / −81 / −71),
  operators face away from the void, ~13 % empty seats with handsets still lit, row quota boards,
  row leaders.
- One desk type per tier: **tier 0 Relationship Development** (chat monitor + rack of 8 handsets),
  **tier −5 Client Outreach** (CRM lead card with call timer + script bar, desk phone, handsets, lead
  lists), **tier −10 Remote Device Assistance** (fake security-warning pop-up + lead card).
- Video-call studio sets on tier −5 (Regulatory Liaison Studio, Partner Bank Verification Suite,
  Relationship Wellness Studio) with tripod phones and ring lights; Objection Handling Lab on −10.
- Pit: Multi-Channel Engagement Array (handset/SIM farm, ~3,400 lit handsets, GSM gateways),
  Liquidity Event Gong (swings every 10–22 s), Digital Asset Settlement desks, Associate Rest Pods,
  guards at the bridge, Personal Device Safekeeping lockers.
- Floor-local screen atlas (CHAT / LEAD / ALERT / WALLET, 2 Hz while visible, 1 draw call each).

### Phase 1 look (both floors)
- **`src/floors/luxKit.js`** (new): a Phase 1 adapter. The approved greybox calls
  (box / deco / glassBox / walls / npc / sign) are routed into the Phase 1 kit (`Lux`) with a
  per-floor colour → material map, so layouts are unchanged while the look becomes PBR. Adds shared
  materials: emissive `glow` (bloom), vertex-colour metal / gloss / satin, board-formed concrete,
  carpet tiles, perforated acoustic panel, diamond plate, tinted glass, hazard stripes, the OT-03
  slate/gunmetal/neon set, OT-04 velvet / red carpet / grey epoxy. Signs with a yaw become wall
  plaques.
- **`src/world/lux.js`**: seated low-poly people (`sit: true`: hips on the chair, knees and arms
  forward to the desk); `peopleInstanced()` for floors that animate their own figures;
  `addLuxMaterials()` to register floor materials.
- **`src/floors/luxHall.js`**: the shared Phase 1 lift hall now supports several portals
  (`portals: [{ z, half, top, text, sub, textH, runner }]`), custom flooring (`hallFloor`) and planter
  positions. OT-01 / VT-01 output unchanged (checked OT-01 hall in the browser).
- **OT-03**: dark slate shell (`wallColor`), carpet-tiled tiers, resin pit floor, acoustic pit
  walls, neon troffer grid over the pit, fabric partitions, seated operators, wall plaques for the
  canopy / level / pit-wall signs, Phase 1 lift hall in slate and gunmetal with neon jambs and coffers.
  Lighting profile `outreach` (dark, cool fill, bloom 0.6). Room spawn moved onto the Arrival Bridge
  (the room centre is the void; debug teleports used to drop you into it).
- **OT-04**: agency side in marble, walnut panelling under pale stone with a gold band, onyx wall,
  leather lounge (guards and clients seated), velvet; prison side in board-formed concrete walls, grey
  epoxy floor, diamond-plate catwalks, powder-coated steel; the animated parade, beatings and catwalk
  patrol now use low-poly people. Phase 1 lift hall with two portals (marble client half, dark
  concrete processing half, red carpet only on the client side). Lighting profile `security`.
- NPC facing fixed everywhere it now shows (studio staff face their cameras, yard faces the podium,
  muster lanes face the threat board, etc.).

## Evidence (in-browser, port 5174)

- `vite build` OK; banned-word check OK (35 files); no console errors.
- Walks: OT-03 lift hall → portal → Arrival Bridge → top tier ✓; bridge → −71 aisle → between the
  south rows ✓. OT-04 hall → luxury portal → reception ✓; hall → processing portal → processing ✓.
- Render cost (whole frame, direct render, RTX 3070 dev machine — not an average laptop):
  OT-03 133–137 draw calls / 265k triangles / ~1.0 ms; OT-04 99–107 draw calls / 72k triangles /
  ~0.7 ms. Budgets: ≤ 250 calls, ≤ 1.5 M triangles. Build time OT-03 ~230 ms, OT-04 ~80 ms.
- Real frame rate not measured (the browser pane throttles animation frames).

## Screenshots
1. `01-ot03-arrival-bridge.jpg` — from the bridge: guards, device lockers, core, status screen, neon ceiling
2. `02-ot03-top-tier-from-bridge.jpg` — canopy plaque, top tier, studio level below
3. `03-ot03-seated-operators.jpg` — seated operators, chat monitors, handset racks
4. `04-ot03-lift-hall-portal.jpg` — Phase 1 lift hall and portal
5. `05-ot04-client-reception.jpg` — onyx wall, walnut desk, marble, red carpet (before the planter swap)
6. `06-ot04-alignment-yard.jpg` — yard, catwalks, feedback area, holding suite
7. `07-ot04-yard-concrete-catwalk.jpg` — concrete walls, CFO podium
8. `08-ot04-processing-portal-parade.jpg` — processing portal, the offboarding parade with boxes

## Not done / open
- No reference images were given for this pass, so the look follows the greybox palettes (OT-03
  neon on slate, OT-04 luxury vs prison). Swap in reference-driven details if you have images.
- The video-call studios on OT-03 tier −5 are dimly lit (hemisphere fill only); they could use
  their own fill.
- `perf/baseline.json` not updated.
