/**
 * src/content/recipes.ts
 * ----------------------
 * Crafting. Field recipes (bench:false) can be made anywhere from the pack;
 * bench recipes need the safehouse workbench. Scarcity is the whole game —
 * every bullet you press is powder you didn't keep for a molotov.
 */

import type { Recipe } from "../core/types.ts";

export const RECIPES: Recipe[] = [
  { id: "r_bandage", name: "Bandage", out: "bandage", outQty: 1, bench: false, inputs: [{ id: "cloth", qty: 2 }, { id: "alcohol", qty: 1 }] },
  { id: "r_molotov", name: "Molotov", out: "molotov", outQty: 1, bench: false, inputs: [{ id: "alcohol", qty: 1 }, { id: "cloth", qty: 1 }] },
  { id: "r_antibiotic", name: "Antibiotics", out: "antibiotic", outQty: 1, bench: false, inputs: [{ id: "herb", qty: 2 }, { id: "alcohol", qty: 1 }] },
  { id: "r_spear", name: "Scrap Spear", out: "spear", outQty: 1, bench: false, inputs: [{ id: "wood", qty: 1 }, { id: "scrap", qty: 1 }, { id: "tape", qty: 1 }] },

  { id: "r_ammo", name: "9mm Rounds x6", out: "ammo9mm", outQty: 6, bench: true, inputs: [{ id: "scrap", qty: 1 }, { id: "gunpowder", qty: 2 }] },
  { id: "r_machete", name: "Machete", out: "machete", outQty: 1, bench: true, inputs: [{ id: "scrap", qty: 3 }, { id: "tape", qty: 1 }] },
  { id: "r_pipe", name: "Steel Pipe", out: "pipe", outQty: 1, bench: true, inputs: [{ id: "scrap", qty: 2 }] },
  { id: "r_fireaxe", name: "Fire Axe", out: "fireaxe", outQty: 1, bench: true, inputs: [{ id: "scrap", qty: 4 }, { id: "wood", qty: 2 }, { id: "tape", qty: 2 }] },
  { id: "r_pistol", name: "9mm Pistol", out: "pistol", outQty: 1, bench: true, inputs: [{ id: "scrap", qty: 5 }, { id: "tape", qty: 2 }, { id: "gunpowder", qty: 1 }] },
];
