/**
 * src/content/loot.ts
 * -------------------
 * Loot tables for searchable props and infected kills. A table is a weighted
 * list of drops; each entry has a chance and a quantity range. Rolled with the
 * injected rng so a seed reproduces a run.
 */

import type { ItemId } from "../core/types.ts";
import { randInt } from "../core/rng.ts";

export interface LootEntry {
  id: ItemId;
  chance: number; // 0..1
  min: number;
  max: number;
}

export const LOOT: Record<string, LootEntry[]> = {
  crate: [
    { id: "scrap", chance: 0.7, min: 1, max: 3 },
    { id: "wood", chance: 0.5, min: 1, max: 2 },
    { id: "cloth", chance: 0.5, min: 1, max: 3 },
    { id: "tape", chance: 0.25, min: 1, max: 1 },
    { id: "cannedfood", chance: 0.3, min: 1, max: 2 },
  ],
  locker: [
    { id: "cloth", chance: 0.6, min: 1, max: 2 },
    { id: "bandage", chance: 0.3, min: 1, max: 1 },
    { id: "antibiotic", chance: 0.15, min: 1, max: 1 },
    { id: "alcohol", chance: 0.35, min: 1, max: 1 },
    { id: "ammo9mm", chance: 0.2, min: 2, max: 6 },
  ],
  corpse: [
    { id: "ammo9mm", chance: 0.4, min: 1, max: 5 },
    { id: "scrap", chance: 0.4, min: 1, max: 2 },
    { id: "bandage", chance: 0.25, min: 1, max: 1 },
    { id: "cannedfood", chance: 0.2, min: 1, max: 1 },
    { id: "herb", chance: 0.25, min: 1, max: 2 },
  ],
  car: [
    { id: "scrap", chance: 0.8, min: 2, max: 4 },
    { id: "gunpowder", chance: 0.3, min: 1, max: 2 },
    { id: "tape", chance: 0.3, min: 1, max: 1 },
  ],
  barrel: [
    { id: "alcohol", chance: 0.5, min: 1, max: 2 },
    { id: "gunpowder", chance: 0.3, min: 1, max: 1 },
    { id: "water", chance: 0.4, min: 1, max: 2 },
  ],
  // Dropped by the infected on death.
  kill_common: [
    { id: "scrap", chance: 0.25, min: 1, max: 1 },
    { id: "cloth", chance: 0.25, min: 1, max: 1 },
    { id: "herb", chance: 0.12, min: 1, max: 1 },
  ],
  kill_brute: [
    { id: "ammo9mm", chance: 0.8, min: 3, max: 8 },
    { id: "scrap", chance: 1, min: 2, max: 4 },
    { id: "gunpowder", chance: 0.6, min: 1, max: 3 },
  ],
};

/** Roll a loot table into a flat list of {id, qty}. */
export function rollLoot(rng: () => number, table: string): { id: ItemId; qty: number }[] {
  const entries = LOOT[table] ?? [];
  const out: { id: ItemId; qty: number }[] = [];
  for (const e of entries) {
    if (rng() < e.chance) out.push({ id: e.id, qty: randInt(rng, e.min, e.max) });
  }
  return out;
}
