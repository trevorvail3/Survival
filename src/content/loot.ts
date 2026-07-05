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
};

export function rollLoot(rng: () => number, table: string): { id: ItemId; qty: number }[] {
  const entries = LOOT[table] ?? [];
  const out: { id: ItemId; qty: number }[] = [];
  for (const e of entries) if (rng() < e.chance) out.push({ id: e.id, qty: randInt(rng, e.min, e.max) });
  return out;
}
