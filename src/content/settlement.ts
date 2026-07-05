/**
 * src/content/settlement.ts
 * -------------------------
 * The buildable heart of the game: your settlement's structures. Each is raised
 * and upgraded with gathered materials and pays off in survival — the Forge and
 * Workshop unlock better arms and armour, the Palisade thins the night's
 * attackers, and Quarters house the survivors you rescue.
 */

import type { StructureDef, StructureId } from "../core/types.ts";

export const STRUCTURES: Record<StructureId, StructureDef> = {
  palisade: {
    id: "palisade",
    name: "Palisade",
    maxLevel: 3,
    blurb: "Sharpened stakes and stone. Fewer dead breach the walls at night.",
    costs: [
      [{ id: "wood", qty: 10 }, { id: "stone", qty: 4 }],
      [{ id: "wood", qty: 16 }, { id: "stone", qty: 10 }],
      [{ id: "wood", qty: 24 }, { id: "stone", qty: 20 }, { id: "iron", qty: 4 }],
    ],
    effect: (lvl) => (lvl <= 0 ? "Open to the night" : `Night attackers −${lvl * 25}%`),
  },
  forge: {
    id: "forge",
    name: "Forge",
    maxLevel: 3,
    blurb: "Bellows and anvil. Smelt ore and hammer out weapons and armour.",
    costs: [
      [{ id: "stone", qty: 10 }, { id: "iron_ore", qty: 4 }],
      [{ id: "stone", qty: 16 }, { id: "iron", qty: 10 }],
      [{ id: "stone", qty: 24 }, { id: "iron", qty: 20 }],
    ],
    effect: (lvl) => (lvl <= 0 ? "No smithing" : `Smithing tier ${lvl}`),
  },
  workshop: {
    id: "workshop",
    name: "Workshop",
    maxLevel: 3,
    blurb: "Benches and tools. Craft spears, bows, skins and leathers.",
    costs: [
      [{ id: "wood", qty: 10 }],
      [{ id: "wood", qty: 16 }, { id: "iron", qty: 4 }],
      [{ id: "wood", qty: 24 }, { id: "iron", qty: 10 }, { id: "rope", qty: 4 }],
    ],
    effect: (lvl) => (lvl <= 0 ? "No crafting bench" : `Crafting tier ${lvl}`),
  },
  quarters: {
    id: "quarters",
    name: "Quarters",
    maxLevel: 3,
    blurb: "Beds and hearths. House the survivors you bring home; they bring supplies.",
    costs: [
      [{ id: "wood", qty: 8 }, { id: "cloth", qty: 4 }],
      [{ id: "wood", qty: 14 }, { id: "leather", qty: 4 }],
      [{ id: "wood", qty: 22 }, { id: "iron", qty: 6 }, { id: "leather", qty: 6 }],
    ],
    effect: (lvl) => `Houses ${settlementCapacity(lvl)} survivors`,
  },
};

/** Max settlement population for a given Quarters level. */
export function settlementCapacity(quartersLevel: number): number {
  return 2 + quartersLevel * 2;
}

/** A pool of plain, period names for rescued survivors. */
export const SETTLER_NAMES: string[] = [
  "Aldous", "Bryn", "Cecily", "Doran", "Edith", "Fenn", "Gerta", "Halin",
  "Isolde", "Joss", "Kell", "Lisbet", "Merrick", "Nesta", "Osric", "Perrin",
  "Quill", "Rowan", "Senna", "Tomas", "Ulric", "Vesna", "Wat", "Ysolt",
];
