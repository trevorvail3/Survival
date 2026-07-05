# Ashfall

A **medieval plague-horror survival & settlement game**. The plague took the
living and would not let them lie still; now the risen walk the vale. You hold
one walled steading against the dark — **rescue survivors, raise your forge and
walls, arm your people, and range out to gather what you need to endure**.

Point-and-click, mobile-friendly, single-player, and **built with no image or
audio files**: every tile, icon, sound and note is generated in code, adapting
engine techniques from the sibling [`world`](https://github.com/trevorvail3/world)
project.

> The plague took the living, and would not let them lie still.

## How it plays

- **Point-and-click, like `world`/old-school RuneScape.** Click the ground to
  walk there (A\* pathfinding), click a foe to close in and fight it on
  weapon-speed ticks, click a chest / tree / ore / body to walk over and use it.
- **Survive.** Health, Hunger, Thirst and **Infection** all bleed you out if
  ignored; the risen raise your infection when they land a blow (antidotes and
  feverfew fight it back).
- **Build your settlement.** A walled home holds a Hearth, Forge, Workshop and a
  Town Board. Spend gathered timber, stone and iron to **raise and upgrade**:
  - **Palisade** — thins the numbers that breach the walls at night.
  - **Forge** — smelt ore and smith swords, maces, mail and plate (tiered).
  - **Workshop** — craft spears, bows, waterskins and leathers.
  - **Quarters** — house the survivors you rescue.
- **Set out on expeditions.** Your settlement is the hub. A **waystone** by the
  gate opens *The Ways* — travel to distinct regions, each its own generated
  zone with a bias of resources, its own dangers and survivors to find:
  - **The Blighted Woods** (danger ◆) — timber & feverfew, risen and hounds.
  - **The Ruined Abbey** (◆◆) — stone & stores, wretches, more survivors.
  - **The Drowned Mire** (◆◆) — water & herbs, packs of hounds.
  - **The Iron Barrows** (◆◆◆) — the richest ore, guarded by grave-knights.
  Scavenge, then return by the region's waystone to bank it all at home. Regions
  regenerate each visit; the settlement (and your pack) persist across travel.
  The clock keeps ticking on the road — be home before the light fails.
- **Gather & explore.** Fell trees for timber, break rock for stone and ore,
  pick feverfew, and loot chests, carts and the plague-dead out in the wilds.
- **Recruit.** Free survivors trapped in ruined cottages; they join your
  settlement (up to your Quarters capacity) and **bring supplies each dawn**.
- **Hold the night.** Nightfall drops the world near-black — your torch is a
  small, failing pool of light — and fills the vale with the dead. Rest at the
  hearth to reach dawn.

**Controls:** click to move / fight / use · **1–5** use hotbar items (4 hurls a
firepot at the cursor) · **Tab** pack & crafting · click the **town board** to
build · **Esc** closes panels.

## What was lifted from `world`

Engine techniques from the sibling game, re-skinned for a medieval plague:

| From `world` | Used here |
| --- | --- |
| `pathfinding.ts` (A\*) | `client/pathfinding.ts` — click-to-walk, walk-to-adjacent for interaction, and the risen hunting you. Lifted almost verbatim. |
| `audio.ts` WebAudio engine | `client/audio.ts` — synth core (noise/reverb buffers, `tone`/`note`/`noise` voices, drones, bus graph, autoplay-unlock) kept; vocabulary rewritten for horror: drones, wet blows, bowfire, the wet-throat voices of the risen. |
| `itemIcon.ts` + `glyph.ts` | `client/itemIcon.ts` + `client/glyph.ts` — the colour toolkit, `Pal`/`shadeFrom` shading and `draw(shape,pal,id)` switch, redrawn for arms, armour, materials and consumables; `currentColor` HUD glyphs. |
| `avatar.ts` + `gearLook.ts` | `client/avatar.ts` — layered-parts + swing + `drawTool` technique as a top-down survivor, with a worn-armour overlay. |
| `render.ts` | `client/render.ts` — hash-noise terrain tinting, cached `discSprite` glows, and the day/night veil with light pools punched into their own layer (so light reveals the world). Cranked toward black. |

## Architecture

A **pure core** the client only reads from (the `world` discipline):

- `src/core` — types, seeded RNG, and the simulation (`world.ts`): movement
  orders, tick-based combat, survival, the risen's AI, day/night, night raids,
  crafting, and the settlement (building, upgrades, rescued-member tribute).
  Time + randomness arrive via `Ctx`; effects are emitted as `GameEvent` data.
- `src/content` — data only: items, enemies, recipes, structures, loot tables,
  and the procedural region generator.
- `src/client` — audio, icons, avatar, renderer, pathfinding, input, HUD, and
  the loop that turns clicks into orders and core events into sound + FX.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production bundle into dist/
```

`?seed=7` locks the region layout for repeatable runs.

## Roadmap

Next: deeper settler roles (assign the people you rescue to gather or defend),
boss-tier grave-knights guarding the barrows, per-region gear/loot tables, and
persistent region state (regions that stay cleared for a while after a raid).
