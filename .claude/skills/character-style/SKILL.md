---
name: character-style
description: Visual style rules for every in-game character (CEO, admins, visitors, AI key agents, background staff, Asset Protection guards, cash robots, arena talent, crowds, event states) — proportions, faces, outfits per role, tags/indicators, animation approach and asset pipeline, as decided by the user on 2026-11-18. Use whenever creating, changing or rendering any person, robot, horse, NPC crowd, player avatar, nameplate or the player camera.
---

# Character Style (v1, approved by the user 2026-11-18)

Reference build: the standalone showcase at `showcase/characters.html` (`src/characters/kit.js`,
`roster.js`, `showcase.js`). Run `npx vite --port 5174` and open `/showcase/characters.html`.
The showcase is NOT loaded by the game. Changes to the look go there first, and the user approves
them before they are ported into the game.

## Global style
- **Stylised caricature**: clean low-poly, about 5 heads tall, chunky silhouette, broad padded
  shoulders on suits. Flat-shaded, and matching the luxury-architectural-model buildings.
- **Painted faces**: a texture-swapped face shell over the head. Expressions: `neutral, smug,
  happy, shout, focus, panic, cry`. Events switch expressions (alarm → panic, firing → cry).
- **Animation**: real skeletal motion. In the game, crowds use rigged, GPU-baked
  (vertex-animation-texture) instanced animation; key agents and player avatars get live rigs.
  Clips needed: idle, walk, run, sit, shout, phone-to-ear, headset, cheer, march, cower,
  carry-box, rifle-ready, fight stance, ride, deal, clipboard, cross-arms.
- **Assets are procedural in code** (primitives in Three.js, the same way as the building):
  no external models, and recoloured per role.
- **Cast**: a fully international, even mix of skin tones and hair everywhere (palette `SKINS`
  in roster.js).

## Camera (players)
- **Always third person.** Orbit the camera by **holding right-click and dragging**; the wheel
  zooms (`src/player.js`). The camera is pulled in when a tall collider is in the way.
- **No jumping** (user, 2026-11-18: added and then removed).
- Your own nametag shows above your avatar.

## CEO marker (user, 2026-11-18)
- **Bright green, with an arrow, very noticeable**: a screen-space overlay that is always on top
  (seen through walls and floors). It shows a glowing "♛ CEO · 34 m" pill, the CEO's floor when
  you are elsewhere, and a bobbing arrow pointing down at the CEO. When the CEO is off screen it
  sticks to the screen edge and the arrow points the way. Code: `src/characters/ceoMarker.js`.
- Until multiplayer presence exists, a CEO stand-in paces the OT-05 Command Deck. When you play
  as CEO, the stand-in and the marker are hidden.

## In-game implementation (how to keep it fast)
- `src/characters/crowd.js`: GPU-skinned crowds. Each outfit archetype is baked once from a kit
  Character; one float texture per crowd holds every person's bone matrices, colours and face.
  The old APIs still work: `L.person()`, `peopleInstanced()`, `ctx.npc()`. Pass `kind`
  (`suit | trader | casual | shirt | host | guard | guardFront | guardBaton`), `pose` and `face`.
- Distance bands: under 20 m the detailed figure plus face; under 45 m a simplified figure;
  beyond that a box impostor (about 150 triangles) that still animates.
- CPU budget: people within 10 m animate every frame, and moving figures within 25 m every frame;
  everyone else round-robin, at most 120 per crowd per frame.
- Crowds do not cast shadows (the shadow map is static).

## Roles
| Who | Look | Marker |
|---|---|---|
| CEO (one in the building) | Peak-excess tycoon: cream three-piece suit, black shirt, gold tie, sunglasses, cigar, gold watch and chain. **Scaled 1.25×.** | Gold "Chief Executive Officer" plate, plus a **screen-space CEO tracker visible through walls** with the distance |
| Admins ("Staff") | Charcoal or black suit, white shirt, gold lapel badge | "★ STAFF" plate with name. Never cream or gold; never CEO-sized |
| Visitors | ONE fixed look: **tourist high-roller**: Hawaiian shirt, khaki shorts, white socks and sandals, sunglasses on head, gold chain, GUEST lanyard, cocktail | Username plate |
| Key AI agents | **Named hero characters**, each with a unique signature design | "◉ LIVE AI AGENT" chip, name and title above the head |
| Background staff | **Department uniform + random kit** (random body, skin, hair, accessories) | none |

Department uniforms: traders wear bright exchange jackets with a badge and short tie; quants wear
a light shirt, lanyard and glasses; outreach operators wear a hoodie or polo with a headset;
dealers and hosts wear a waistcoat, bow tie and gold garters.

## Asset Protection guards (from the user's reference photo: black sci-fi armour)
- Matte black segmented armour, a closed helmet with a glowing visor (no face), bulky
  pauldrons and forearm guards, and a mesh under-suit. The chest plate reads "ASSET PROTECTION"
  with the red-triangle emblem.
- Armour **everywhere**. Front-of-house guards (lobby, reception, vault) add **gold trim** and a
  pale visor; corrections guards (yard, escorts, blowout squad) are plain black with a **red visor**.
- They **carry rifles** (low ready), as in the photo.
- The Head of Asset Protection (key agent) has gold pauldrons, a gold crest and a gold visor.

## Non-human
- **Cash robot (ALC)**: an armoured luxury safe-on-wheels. Black gloss with gold bands, a side
  dial, a smug glowing screen face, an amber beacon, and a floating "IN TRANSIT $amount" tag.
- **Racehorses**: sleek low-poly, with a saddle cloth carrying a number.

## Arena talent
- Same caricature proportions as everyone else, with **authentic gear**. Muay Thai fighters wear
  a mongkol, prajioud armbands, red or blue corner shorts and gloves, and ankle wraps. Jockeys
  wear silks and a cap; the referee wears a white shirt and bow tie.
- **Crowds**: mixed LOD. Near seats get full figures with cheer reactions; far tiers use cheap
  impostors that still react; leave some empty seats.

## Event states
- Offboarded: crying face, loosened tie, carrying a box of belongings (plant, frame, mug).
- Replacement hire: "HELLO, I'M NEW!" sticker, coffee, happy face.

## Still open
- Final key-agent names and designs for the remaining departments (OT-03 floor manager, Legal,
  IT, HR).
- Performance plan for porting: bake the poses to VAT and instance per material; budget per the
  `threejs-performance` skill.
