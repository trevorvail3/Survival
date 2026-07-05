/**
 * src/content/recipes.ts
 * ----------------------
 * Crafting. Field recipes need no station; others require a built Forge or
 * Workshop at your settlement (and a minimum level). Upgrading those structures
 * is how you unlock better arms and armour — the core progression loop.
 */

import type { Recipe } from "../core/types.ts";

export const RECIPES: Recipe[] = [
  // --- Field (anywhere) ---
  { id: "r_poultice", name: "Poultice", out: "poultice", outQty: 1, inputs: [{ id: "herb", qty: 2 }, { id: "cloth", qty: 1 }] },
  { id: "r_antidote", name: "Antidote", out: "antidote", outQty: 1, inputs: [{ id: "herb", qty: 3 }, { id: "oil", qty: 1 }] },
  { id: "r_firebomb", name: "Firepot", out: "firebomb", outQty: 1, inputs: [{ id: "oil", qty: 1 }, { id: "cloth", qty: 1 }] },
  { id: "r_club", name: "Wooden Club", out: "club", outQty: 1, inputs: [{ id: "wood", qty: 2 }] },
  { id: "r_rope", name: "Rope", out: "rope", outQty: 1, inputs: [{ id: "cloth", qty: 3 }] },

  // --- Workshop ---
  { id: "r_arrows", name: "Arrows ×8", out: "arrow", outQty: 8, workshop: 1, inputs: [{ id: "wood", qty: 2 }, { id: "bone", qty: 1 }] },
  { id: "r_waterskin", name: "Waterskin", out: "waterskin", outQty: 1, workshop: 1, inputs: [{ id: "leather", qty: 2 }] },
  { id: "r_spear", name: "Boar Spear", out: "spear", outQty: 1, workshop: 1, inputs: [{ id: "wood", qty: 1 }, { id: "iron", qty: 1 }, { id: "rope", qty: 1 }] },
  { id: "r_hatchet", name: "Hatchet", out: "hatchet", outQty: 1, workshop: 1, inputs: [{ id: "wood", qty: 1 }, { id: "iron", qty: 2 }] },
  { id: "r_leather_armor", name: "Leather Jack", out: "leather_armor", outQty: 1, workshop: 1, inputs: [{ id: "leather", qty: 4 }, { id: "rope", qty: 1 }] },
  { id: "r_warbow", name: "War Bow", out: "warbow", outQty: 1, workshop: 2, inputs: [{ id: "wood", qty: 3 }, { id: "rope", qty: 2 }] },

  // --- Forge ---
  { id: "r_smelt", name: "Smelt Iron", out: "iron", outQty: 1, forge: 1, inputs: [{ id: "iron_ore", qty: 2 }] },
  { id: "r_iron_sword", name: "Iron Sword", out: "iron_sword", outQty: 1, forge: 1, inputs: [{ id: "iron", qty: 3 }, { id: "wood", qty: 1 }] },
  { id: "r_mail", name: "Chain Mail", out: "mail", outQty: 1, forge: 2, inputs: [{ id: "iron", qty: 8 }] },
  { id: "r_warmace", name: "War Mace", out: "warmace", outQty: 1, forge: 2, inputs: [{ id: "iron", qty: 5 }, { id: "wood", qty: 2 }] },
  { id: "r_steel_sword", name: "Steel Longsword", out: "steel_sword", outQty: 1, forge: 3, inputs: [{ id: "iron", qty: 6 }, { id: "stone", qty: 2 }, { id: "wood", qty: 1 }] },
  { id: "r_plate", name: "Plate Harness", out: "plate", outQty: 1, forge: 3, inputs: [{ id: "iron", qty: 14 }, { id: "leather", qty: 2 }] },
];
