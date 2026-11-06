# Phase 1 — OT-01 Trading Floor — 2026-11-06

User request: Phase 1 for OT-01 only, in the tone and lighting of the user's stylised exchange-floor
image; remove the guest viewing gallery. During the work: the Chief Executive Lift must serve every
Office floor (not just the Executive Floor); then "more dense, more chaos, more people walking around".

## What was built

- **Look** (reference image): warm tan oak floor with navy/red inlays, cream walls with gunmetal
  pilasters, cream coffered ceiling with warm yellow light panels, heavy gunmetal truss grid with
  diagonals and columns, yellow pendant lamps, recessed bays of blue windows on the back wall with the
  navy firm banner and the bell balcony between them, the flag on the north wall, a hanging navy
  bell sign over the aisle. Own lighting profile (`trading` in `main.js`): bright, warm, even, no sun.
- **Trading posts**: the approved hollow-ring design, recoloured grey with red accent stripes and a navy
  lettering band. All screens (crown facets, arm monitors, specialists' monitors, stands, booths, pods,
  hall pylons — 718) sample ONE sharp, static atlas (`src/world/tradingScreens.js`): every cell clipped
  to itself and every label measured to fit, so no text overlaps; static, so no uploads or stutter.
  Member-logo band labels are now measured to fit their segment too.
- **Crowd**: 505 people — specialists inside every post, a full ring of traders at each counter and
  a second rank behind them (they turn and bounce as if shouting), 81 walkers (runners circling the
  posts, aisle traffic, pacing in front of the booths, the lift hall), broker booth rows along the
  window wall, portal wall and south wall, 26 monitor pods between the posts, 2,600 trading slips on
  the floor. TV booth rebuilt.
- **Guest viewing gallery removed** (zone, rail and its two figures).
- **Lift hall rebuilt** in the same style: cream core wall with gunmetal portals, satin reveals,
  bronze sills, live indicators and call buttons for every door that stops here; navy dado with a
  red cap; tan terrazzo floor, navy runners; kiosks, planters, market pylons, market boards.
  The Chief Executive Lift stands proud of the core with its own portal and plaque.
- **The Link checkpoint** now sits in a recess in the core: speed gates with a wide escort lane
  (cash robots), glass side panels, guards; the access barrier is invisible (the gates are the gate).
- **Chief Executive Lift (Office)** now stops at B1, L, OT-01…OT-05.

## Evidence (in-browser)

- Build OK; banned-word check OK; no console errors.
- Routes: cleared visitor VT-01 → The Link → Trading Floor ✓; tour L0 → Trading ✓; CEO Trading → vault ✓;
  admin L0 → Thai Desk ✓. Chief Executive Lift from OT-01 → OT-05 → OT-02 → OT-01 ✓ (doors open into
  the new hall). Visitor stopped at the Link gates (x −33.05) ✓, cleared visitor passes ✓.
  Both cash robots deliver (ALC-02 crosses the Link through the escort lane) ✓.
- Walkers move (81) and standing traders animate (227 sampled mid-bounce) ✓.
- Render cost (whole frame): 99–108 draw calls / ~235k triangles across the floor; 315 / 346k looking
  east through the hall (the lobby and bridge are drawn too). CPU submit ~1.2 ms. Real frame rate not
  measured (the browser pane throttles animation frames).

## Screenshots

1. `01-aisle-crowd.jpg` — the aisle from the portal: posts, bell sign, banner, crowd, slips
2. `02-post-crown-screens.jpg` — crown screens close up (sharp, no overlap), truss grid, flag
3. `03-broker-booths.jpg` — south wall broker booths and market boards
4. `04-bell-balcony-windows.jpg` — back wall: window bays, banner, bell balcony
5. `05-lift-hall.jpg` — lift hall (taken before the CEO-lift dado was added)
6. `06-ceo-lift-portal.jpg` — Chief Executive Lift portal with live indicator
7. `07-link-checkpoint.jpg` — The Link recess with speed gates and guards
