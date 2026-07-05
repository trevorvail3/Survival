/**
 * src/content/loot.ts
 * -------------------
 * Weighted loot tables for searchables, gathered resource nodes, and the drops
 * of the risen. Rolled with the injected rng so a seed reproduces a run.
 */

import type { ItemId } from "../core/types.ts";
import { randInt } from "../core/rng.ts";

export interface LootEntry {
  id: ItemId;
  chance: number;
  min: number;
  max: number;
}

export const LOOT: Record<string, LootEntry[]> = {
  chest: [
    { id: "iron", chance: 0.4, min: 1, max: 3 },
    { id: "cloth", chance: 0.5, min: 1, max: 3 },
    { id: "poultice", chance: 0.35, min: 1, max: 2 },
    { id: "leather", chance: 0.4, min: 1, max: 2 },
    { id: "arrow", chance: 0.3, min: 3, max: 10 },
    { id: "oil", chance: 0.25, min: 1, max: 2 },
  ],
  crate: [
    { id: "wood", chance: 0.7, min: 1, max: 3 },
    { id: "cloth", chance: 0.5, min: 1, max: 2 },
    { id: "rope", chance: 0.3, min: 1, max: 1 },
    { id: "bread", chance: 0.35, min: 1, max: 2 },
  ],
  barrel: [
    { id: "oil", chance: 0.5, min: 1, max: 2 },
    { id: "waterskin", chance: 0.3, min: 1, max: 1 },
    { id: "bread", chance: 0.3, min: 1, max: 2 },
  ],
  remains: [
    { id: "bone", chance: 0.6, min: 1, max: 2 },
    { id: "cloth", chance: 0.4, min: 1, max: 2 },
    { id: "iron", chance: 0.25, min: 1, max: 1 },
    { id: "herb", chance: 0.2, min: 1, max: 2 },
  ],
  cart: [
    { id: "wood", chance: 0.8, min: 2, max: 4 },
    { id: "iron_ore", chance: 0.4, min: 1, max: 2 },
    { id: "leather", chance: 0.3, min: 1, max: 2 },
  ],
  // Resource nodes.
  tree: [{ id: "wood", chance: 1, min: 2, max: 4 }],
  rock: [
    { id: "stone", chance: 1, min: 2, max: 3 },
    { id: "iron_ore", chance: 0.5, min: 1, max: 2 },
  ],
  herbs: [
    { id: "herb", chance: 1, min: 1, max: 3 },
    { id: "bread", chance: 0.2, min: 1, max: 1 },
  ],
  // --- Region-flavoured chest tables (each region rewards something different) ---
  woods_chest: [
    { id: "wood", chance: 0.7, min: 2, max: 4 },
    { id: "cloth", chance: 0.5, min: 1, max: 3 },
    { id: "herb", chance: 0.4, min: 1, max: 2 },
    { id: "poultice", chance: 0.3, min: 1, max: 1 },
    { id: "leather", chance: 0.25, min: 1, max: 1 },
  ],
  abbey_chest: [
    { id: "iron", chance: 0.5, min: 1, max: 3 },
    { id: "cloth", chance: 0.5, min: 2, max: 4 },
    { id: "poultice", chance: 0.45, min: 1, max: 2 },
    { id: "arrow", chance: 0.4, min: 4, max: 12 },
    { id: "oil", chance: 0.3, min: 1, max: 2 },
    { id: "leather_armor", chance: 0.08, min: 1, max: 1 }, // a rare piece of gear
  ],
  mire_chest: [
    { id: "herb", chance: 0.7, min: 2, max: 4 },
    { id: "oil", chance: 0.5, min: 1, max: 3 },
    { id: "waterskin", chance: 0.35, min: 1, max: 1 },
    { id: "leather", chance: 0.4, min: 1, max: 2 },
    { id: "antidote", chance: 0.2, min: 1, max: 1 },
  ],
  barrows_chest: [
    { id: "iron", chance: 0.8, min: 2, max: 5 },
    { id: "leather", chance: 0.4, min: 1, max: 3 },
    { id: "oil", chance: 0.3, min: 1, max: 2 },
    { id: "iron_sword", chance: 0.12, min: 1, max: 1 }, // forged gear, found not made
    { id: "mail", chance: 0.08, min: 1, max: 1 },
  ],
  // Kill drops.
  kill_common: [
    { id: "bone", chance: 0.3, min: 1, max: 1 },
    { id: "cloth", chance: 0.25, min: 1, max: 1 },
    { id: "herb", chance: 0.12, min: 1, max: 1 },
  ],
  kill_revenant: [
    { id: "iron", chance: 1, min: 2, max: 5 },
    { id: "leather", chance: 0.6, min: 1, max: 2 },
    { id: "poultice", chance: 0.5, min: 1, max: 2 },
  ],
  // The Barrow King — a hoard, and the makings of the finest gear.
  kill_graveking: [
    { id: "iron", chance: 1, min: 12, max: 20 },
    { id: "leather", chance: 1, min: 4, max: 8 },
    { id: "steel_sword", chance: 0.5, min: 1, max: 1 },
    { id: "plate", chance: 0.4, min: 1, max: 1 },
    { id: "poultice", chance: 1, min: 2, max: 4 },
  ],
  // The Rot-Mother — the run's end; her death is its own reward, plus a hoard.
  kill_rotmother: [
    { id: "iron", chance: 1, min: 20, max: 30 },
    { id: "steel_sword", chance: 1, min: 1, max: 1 },
    { id: "plate", chance: 1, min: 1, max: 1 },
    { id: "poultice", chance: 1, min: 4, max: 6 },
    { id: "antidote", chance: 1, min: 3, max: 5 },
  ],
  // The Pale Prior — physic, mail, and a warbow from the abbey's armoury.
  kill_prior: [
    { id: "iron", chance: 1, min: 6, max: 12 },
    { id: "mail", chance: 0.4, min: 1, max: 1 },
    { id: "warbow", chance: 0.3, min: 1, max: 1 },
    { id: "arrow", chance: 1, min: 8, max: 16 },
    { id: "poultice", chance: 1, min: 2, max: 3 },
    { id: "antidote", chance: 0.5, min: 1, max: 2 },
  ],
};

export function rollLoot(rng: () => number, table: string): { id: ItemId; qty: number }[] {
  const entries = LOOT[table] ?? [];
  const out: { id: ItemId; qty: number }[] = [];
  for (const e of entries) if (rng() < e.chance) out.push({ id: e.id, qty: randInt(rng, e.min, e.max) });
  return out;
}
