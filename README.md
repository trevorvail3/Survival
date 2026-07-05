# Ashfall

A dark, top-down **survival-horror crafting game** — a cross of *Resident Evil*
(dread, scarcity, the infected), *The Last of Us* (scavenge-and-craft, brutal
melee, human-were-monsters) and *Elden Ring* (stamina, dodge-rolls, punishing
enemies, checkpoints you earn). Mobile-friendly, single-player, and **built with
no image or audio files** — every sprite, icon, sound and note is generated in
code, exactly like the sibling [`world`](https://github.com/trevorvail3/world)
project it borrows its engine techniques from.

> The cities went quiet a long winter ago. What walks them now was people, once.

## The first playable slice — *The Grid*

A procedurally-generated dead city district you must survive:

- **Move** with WASD, **aim** with the mouse, **click** to swing. Weapons have
  weight: reach, stamina cost and swing speed all differ (pipe → machete →
  fire axe → spear → scavenged pistol).
- **Dodge-roll** (Space) with brief i-frames, **sprint** (Shift) at the cost of
  stamina — and noise: sprinting near a **Stalker** brings the swarm.
- **Four infected**, each a different threat: slow **Shamblers** in numbers, fast
  fragile **Runners**, near-blind sound-hunting **Stalkers**, and the wall-of-hp
  **Brute**. They hunt you with **A\*** pathfinding, flowing around walls and
  through doorways.
- **Survival meters** that bleed you out if ignored: Health, Stamina, Hunger,
  Thirst, and **Infection** (creeps up when the infected land a hit; antibiotics
  and bitterroot fight it back).
- **Scavenge** crates, lockers, bodies, wrecks and barrels; **craft** bandages,
  molotovs, ammo and better weapons — some anywhere, some only at the
  **safehouse workbench**.
- A **day/night cycle**. Night falls near-black, the streets fill, and your only
  light is a small, failing pool. **Rest at the campfire** to reach dawn — if you
  dare sleep with them out there.

Open the **pack** (Tab) to manage inventory and craft. Numbers **1–5** quick-use
consumables (4 throws a molotov at your cursor). **Q** cycles weapons.

## What was lifted from `world`

The `world` game generates everything in code; Ashfall adapts its engine layers
to a survival-horror skin:

| From `world` | Adapted here |
| --- | --- |
| `audio.ts` procedural WebAudio engine | `client/audio.ts` — the synth core (noise/reverb buffers, `tone`/`note`/`noise` voices, drones, autoplay-unlock, bus graph) lifted verbatim; the *vocabulary* rewritten for horror: low dissonant drones, wet impacts, gunfire, wind, and the wet-throat voices of the infected. |
| `itemIcon.ts` + `glyph.ts` icon generators | `client/itemIcon.ts` + `client/glyph.ts` — the color toolkit, `Pal`/`shadeFrom` shading and the `draw(shape, pal, id)` silhouette switch, redrawn for the salvage roster; monochrome `currentColor` glyphs for the HUD. |
| `avatar.ts` + `gearLook.ts` | `client/avatar.ts` — the layered-parts composition, arm-swing animation and `drawTool`-in-hand technique, reworked into a top-down, mouse-aimed survivor. |
| `render.ts` canvas drawing | `client/render.ts` — hash-noise terrain tinting, the cached radial-gradient `discSprite`, and the day/night veil with punched-out warm light pools — pushed toward black, with the veil composed on its own layer so light reveals the world. |
| `pathfinding.ts` A\* | `client/pathfinding.ts` — lifted almost verbatim; here it drives the infected hunting you. |

## Architecture

Same discipline as `world`: a **pure core** and a **client** that only reads it.

- `src/core` — types, a seeded RNG, and the simulation (`world.ts`: survival,
  combat, enemy AI, crafting, day/night). Randomness and time are injected via a
  `Ctx`, so a `?seed=` reproduces a run exactly. The core emits `GameEvent`s as
  data; it never touches the DOM or audio.
- `src/content` — pure data: items, recipes, enemies, loot tables, and the
  procedural map generator.
- `src/client` — audio, icons, avatar, renderer, pathfinding, input, HUD, and the
  game loop that turns core events into sound and particles.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production bundle into dist/
```

`?seed=42` in the URL locks the district layout for repeatable runs.
