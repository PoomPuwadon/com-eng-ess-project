---
name: threejs-performance
description: Three.js performance rules for the firm's huge rooms — instancing for seats/screens/desks/NPCs, floor streaming (current floor + neighbours), frame-rate and draw-call budgets on an average laptop, shared video/ticker feeds across hundreds of screens, and the mandatory perf check after every change. Use whenever adding or changing anything rendered, any repeated object, any screen, NPC, light, texture or floor loading code.
---

# Three.js Performance

## 1. Targets (average laptop)

"Average laptop" = integrated GPU (Intel Iris Xe / AMD Radeon 680M class), 16 GB RAM, Chrome,
1920 × 1080 window. If it is smooth there it is smooth everywhere.

| Metric | Target | Hard limit |
| --- | --- | --- |
| Frame rate (median over 10 s) | **60 fps** | never below 30 sustained |
| 1 % low fps | ≥ 45 | ≥ 30 |
| Draw calls per frame | ≤ 250 | ≤ 400 (arenas, Leisure Suite) |
| Visible triangles | ≤ 1.5 M | ≤ 2.5 M |
| Main-thread JS per frame | ≤ 8 ms | ≤ 12 ms |
| GPU texture memory | ≤ 512 MB | ≤ 768 MB |
| JS heap | ≤ 500 MB | ≤ 800 MB |
| Floor change (elevator) | ≤ 2 s behind the fade | ≤ 4 s |

Renderer defaults: `setPixelRatio(Math.min(devicePixelRatio, 1.5))`, `antialias: true` only if the
budget allows (else FXAA/SMAA pass off by default), `powerPreference: "high-performance"`.

## 2. Instancing — repeated objects are never separate meshes

Anything that appears more than ~10 times is an `InstancedMesh` (same geometry + material) or a
`BatchedMesh` (few geometries, one material):

- Arena seats, seat-back screens, betting terminals, desks, monitors, chairs, slot machines,
  roulette/blackjack tables, chandeliers crystals, racks in the server room, capsule employees,
  security guards, cash robots, boxes of belongings, columns, railings, lights fixtures.
- **Chunk instances spatially** (e.g. one `InstancedMesh` per arena section / per 20 × 20 m tile)
  so frustum culling can drop off-screen chunks. A single 1,200-seat InstancedMesh is culled as one
  object and is always drawn.
- Per-instance variation goes in instance attributes (`instanceColor`, a custom
  `InstancedBufferAttribute` for screen channel / UV offset / animation phase) — not new materials.
- Share materials globally: a small material palette module (`materials.ts`) exports singletons.
  Never `new MeshStandardMaterial()` inside a loop.
- Merge static architecture per room (`BufferGeometryUtils.mergeGeometries`) into a handful of
  meshes by material.

### NPCs (hundreds)

- Phase 0: instanced capsules.
- Later: one instanced skinned approach — vertex-animation textures (VAT) or instanced skinning —
  not hundreds of `SkinnedMesh` + `AnimationMixer`.
- LOD by distance: < 15 m full mesh + animation; 15–40 m low-poly, animation at 15 Hz; > 40 m
  billboard/impostor or hidden. Off-screen NPCs update logic at ≤ 5 Hz and do not animate.
- Dialogue bubbles: only for the ~5 nearest NPCs, pooled; never one DOM node or text mesh per NPC.

## 3. Load only the current floor and its neighbours

- The scene graph holds: **current floor + floor directly above + floor directly below**, plus the
  bridge when on `OT-04`/`VT-03`, plus the lobby's shell when at `L0`. Everything else is unloaded.
- Each floor module exposes `load(): Promise<FloorHandle>` and `dispose()`. `dispose()` must free
  geometries, materials, textures and render targets (`.dispose()` each) and remove listeners.
- Leak check: after visiting all floors and returning, `renderer.info.memory.geometries` and
  `.textures` must return to within 5 % of the first visit's values.
- Elevator fade covers loading; preload the destination while the doors close.
- Neighbour floors are preloaded but hidden (`group.visible = false`, zero draw cost); only the current
  walk cluster (e.g. OT-04 + BRIDGE + VT-03) renders. Floors with no occlusion between them must never
  all be visible at once.
- Within huge rooms, hide sub-zones by distance/occlusion (e.g. Leisure Suite split into 4 zones).

## 4. Screens: a few real feeds, reused hundreds of times

Hundreds of screens ≠ hundreds of feeds.

- Render a fixed set of **channels** (6–8): e.g. ticker tape, P&L chart, candle chart, match
  scoreline, odds board, fight feed, race feed, lottery heatmap. Each channel is one
  `CanvasTexture` or `WebGLRenderTarget` at 512 × 288 (or smaller).
- Pack channels into one **atlas texture**; every screen instance picks its channel via a
  per-instance UV offset attribute. All screens of a room = 1 draw call.
- Update channels at **10–15 Hz**, not every frame, and only channels visible on the current floor.
- Scrolling tickers: draw the text once into a long strip texture and scroll with a UV-offset
  uniform in the shader; redraw the strip only when the data changes (≤ once a minute).
- Screens > 40 m away (or tiny on-screen) sample a low mip or show a flat colour.
- At most **2 live `HTMLVideoElement`s** at once (e.g. the arena centre-hung screen); everything
  else is canvas-rendered data.
- In-world text labels: SDF text (e.g. troika-three-text) pooled; floating room signs are a few
  dozen at most per floor.

## 5. Lights, shadows, materials

- ≤ 4 dynamic lights per loaded floor; everything else emissive + environment map / light probes.
- One shadow-casting directional light at most, with a tight shadow camera; prefer baked AO /
  lightmaps for the detailed phase. No point-light shadows.
- Gold/marble look via `MeshStandardMaterial` + one shared PMREM environment map, not
  `MeshPhysicalMaterial` transmission on large surfaces. Glass bridge: simple transparent material,
  `depthWrite: false`, no transmission pass.
- Textures: KTX2/Basis compressed, power-of-two, ≤ 2048 px; mipmaps on.

## 6. CPU side

- Collision: static AABB/capsule colliders in a spatial hash per floor; no general physics engine
  needed for walking.
- No allocation in the render loop (reuse `Vector3`/`Matrix4` scratch objects).
- Only call `instanceMatrix.needsUpdate = true` for instances that moved this frame (use
  `updateRange`/`addUpdateRange` for partial uploads).
- Simulation (robots, NPC paths) ticks at fixed 10–20 Hz; rendering interpolates.
- Multiplayer avatars (up to 50): instanced, interpolated, nameplates pooled.
- Lifts: all car shells are ONE InstancedMesh and all car door panels another (2 draw calls for all
  19 cars). Landing doors are one InstancedMesh per floor. Only cars that moved update matrices.
- Floors that can see each other (atrium L0 ⇄ BRIDGE ⇄ sky lobbies) render together. That is the
  heaviest view (~100 draw calls), so check it first after any change to the lobby or the bridge.

## 7. The perf check — after EVERY change that touches rendering

1. The app must expose `window.__perf` in dev builds:
   `{ fps, fps1Low, frameMs, drawCalls, triangles, geometries, textures, heapMB }`, sampled
   over a rolling 10 s window from `renderer.info` and `performance.memory`.
2. A dev overlay (toggle with `F3`) shows the same numbers.
3. Run the benchmark path: a scripted camera tour (`?bench=1`) that visits each loaded floor's worst
   viewpoint (the view with the most screens/seats/NPCs) for 10 s each and writes results to the
   console as JSON.
4. Compare to `perf/baseline.json` (commit it). Any metric > 10 % worse than baseline, or any hard
   limit broken, must be fixed or explicitly reported to the user — never silently accepted.
5. Update the baseline only when a change intentionally adds content and stays within targets.
6. A hidden/background tab throttles `requestAnimationFrame` to ~1 fps and makes `__perf` meaningless.
   Check `document.hidden` first. If hidden, time N forced `renderer.render()` calls + `gl.finish()` per
   viewpoint instead, and say which method you used.
7. State the measured numbers in the response, including the machine/browser they came from.
   Note: a measurement on a powerful dev machine does not prove laptop performance; when only
   that is available, say so and apply a safety margin (aim ≥ 90 fps there).

The `phase-verification` skill uses this check as one of its gates.
