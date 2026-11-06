# Phase 1 — ground floor (Grand Lobby, Plaza, The Link) — 2026-11-06

User request: start Phase 1 for the floors that are approved — the ground floor. Rebuild it (not a
trace of the greybox) in the tone of the user's reference image, with good lighting; then, during the
work: tone down the over-bright interior and the bridge, rebuild the lifts completely (no gaps, no
overlapping textures), make the screens sharp with no overlapping text, and add a big Chief Executive
Lift (15+ people) in both towers between the low- and high-rise banks.

Scope note: this covers the **visual** half of Phase 1 for the ground floor. Sign-in, multiplayer,
chat and roles (the other half of Phase 1) need the architecture + cost proposal first (CLAUDE.md).

## What was built

- Phase 1 material kit and render pipeline (`src/world/lux.js`, `main.js`): physically based
  materials with procedural textures (marble, walnut, granite, paving, curtain wall, onyx), merged
  per material; image-based reflections; filmic tone mapping; soft sun shadows; bloom on lamps.
  Indoor and outdoor lighting profiles; greybox floors render exactly as before.
- Grand Lobby rebuilt: walnut walls to the roof with bronze reveals, marble floor with bronze inlays
  and a compass star, revolving doors, 2-lane security (arches + bag x-ray), lounges, reflection pool
  with gold sculpture and jets, curved reception desk + onyx wall under a new Members' Mezzanine
  (escalators + stair), cube-crystal chandeliers, staff speed gates, low-poly people (some walking).
- Lifts rebuilt: new cabins for every car; complete lobby portals (shaft enclosure, bronze reveals,
  sill, granite architrave, live floor indicator, call buttons) — fixes the see-through gaps and the
  flickering overlapping surfaces. New Chief Executive Lifts in both towers (low-rise banks moved
  1.6 m north; the vault extended north so the Office car still opens straight into it).
- Screens: dedicated sharp displays at true aspect (dashboard, market boards, monitors).
- Plaza and entrance facade rebuilt; The Link rebuilt in the same style; tower facades textured;
  street and skyline added.

## Evidence (in-browser)

- Build OK; banned-word check OK.
- Routes (route planner + lifts): visitor Plaza → reception ✓; Plaza → Leisure Suite ✓; Plaza → arena
  portal ✓; tour Plaza → Executive Floor via the Chief Executive Lift ✓; CEO Executive Floor → vault ✓;
  admin Plaza → Thai Desk ✓; cleared visitor VT-01 → Link → Trading Floor ✓; visitor → Executive Floor
  refused ✓; visitor stopped at the staff speed gates ✓; visitor refused the Wellness CEO lift, tour
  allowed ✓. Escalator walk to the mezzanine (Y 6.5) ✓. Both cash robots deliver ✓.
- Render cost (whole frame incl. shadow pass and bloom): lobby 173–220 draw calls / ~120k triangles;
  plaza 256 / 125k; The Link 238 / 173k; CPU submit 2–4 ms. Real frame rate not measured (the browser
  pane throttles animation frames).

## Screenshots

1. `01-lobby-hall.jpg` — hall from the security exit: pool, escalators, mezzanine, dashboard
2. `02-reception-mezzanine.jpg` — curved desk, onyx wall, mezzanine (before the glow was toned down)
3. `03-security.jpg` — arches, x-ray machines, guards, screening header
4. `04-lounge.jpg` — lounge
5. `05-lift-portals.jpg` — rebuilt lift portals with live indicators, market board above
6. `06-ceo-lift-cabin.jpg` — inside the Chief Executive Lift through its open doors
7. `07-the-link.jpg` — The Link at the final light levels
8. `08-plaza.jpg` — plaza and entrance facade (taken before the interior light pass)
9. `09-lobby-dashboard.jpg` — the sharp 56 m dashboard (help panel visible after a reload)

## Open points

- Rest of the building is still greybox; the shared screen atlas there still overlaps text.
- Third-person camera + final character model are future work (user note).
