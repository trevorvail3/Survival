/**
 * src/content/items.ts
 * --------------------
 * The item roster of Ashfall. Scavenged scrap, makeshift weapons, meds you
 * bleed out without. Data only — icons are drawn procedurally from `shape` +
 * `material` (see client/itemIcon.ts), never from files.
 */

import type { ItemDef, ItemId } from "../core/types.ts";

function def(d: ItemDef): ItemDef {
  return d;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // --- Raw materials (scavenged) ---
  scrap: def({ id: "scrap", name: "Scrap Metal", shape: "scrap", material: "iron", stack: 20, use: "none", desc: "Twisted metal. The bones of the old world — good for building." }),
  cloth: def({ id: "cloth", name: "Rag Cloth", shape: "cloth", material: "cloth", stack: 20, use: "none", desc: "Torn fabric. Binds wounds and wicks flame." }),
  wood: def({ id: "wood", name: "Splintered Wood", shape: "wood", material: "wood", stack: 20, use: "none", desc: "Broken furniture, floorboards. Burns; braces; breaks skulls." }),
  alcohol: def({ id: "alcohol", name: "Grain Alcohol", shape: "bottle", material: "glass", stack: 10, use: "none", desc: "Sterilises wounds. Or a wick away from a fire." }),
  tape: def({ id: "tape", name: "Duct Tape", shape: "roll", material: "tape", stack: 10, use: "none", desc: "Holds the world together, mostly." }),
  gunpowder: def({ id: "gunpowder", name: "Gunpowder", shape: "powder", material: "powder", stack: 20, use: "none", desc: "Salvaged from dud shells. Volatile." }),
  herb: def({ id: "herb", name: "Bitterroot", shape: "herb", material: "toxic", stack: 20, use: "none", desc: "A weed that fights the rot in the blood." }),

  // --- Consumables ---
  bandage: def({ id: "bandage", name: "Bandage", shape: "bandage", material: "cloth", stack: 10, use: "heal", heal: 35, desc: "Clean cloth and alcohol. Stops the bleeding." }),
  cannedfood: def({ id: "cannedfood", name: "Canned Food", shape: "can", material: "steel", stack: 10, use: "food", food: 45, desc: "Dented, expired, edible. Beggars, choosers." }),
  water: def({ id: "water", name: "Clean Water", shape: "canteen", material: "blue", stack: 10, use: "drink", drink: 45, desc: "Boiled clean. Worth more than bullets some days." }),
  antibiotic: def({ id: "antibiotic", name: "Antibiotics", shape: "pills", material: "white", stack: 10, use: "heal", heal: 15, desc: "Beats back infection in the blood.", food: 0 }),
  molotov: def({ id: "molotov", name: "Molotov", shape: "molotov", material: "glass", stack: 5, use: "throw", throwDamage: 60, throwRadius: 2.2, fire: true, desc: "A bottle of fire. They hate fire." }),

  // --- Ammo ---
  ammo9mm: def({ id: "ammo9mm", name: "9mm Rounds", shape: "ammo", material: "brass", stack: 60, use: "none", desc: "Brass and lead. Never enough." }),

  // --- Weapons ---
  fists: def({ id: "fists", name: "Bare Hands", shape: "fist", stack: 1, use: "equip", weapon: { kind: "fist", damage: 8, reach: 0.9, stamina: 8, cooldown: 380, arc: 0.9 }, desc: "Better than nothing. Barely." }),
  pipe: def({ id: "pipe", name: "Steel Pipe", shape: "pipe", material: "steel", stack: 1, use: "equip", weapon: { kind: "blunt", damage: 20, reach: 1.3, stamina: 14, cooldown: 520, arc: 1.0 }, desc: "A length of pipe. Rings like a bell on bone." }),
  machete: def({ id: "machete", name: "Machete", shape: "machete", material: "steel", stack: 1, use: "equip", weapon: { kind: "blade", damage: 30, reach: 1.2, stamina: 16, cooldown: 480, arc: 0.9 }, desc: "Keeps an edge. Keeps you alive." }),
  fireaxe: def({ id: "fireaxe", name: "Fire Axe", shape: "axe", material: "blood", stack: 1, use: "equip", weapon: { kind: "cleaver", damage: 48, reach: 1.4, stamina: 28, cooldown: 760, arc: 1.15 }, desc: "Heavy. Slow. Ends things." }),
  spear: def({ id: "spear", name: "Scrap Spear", shape: "spear", material: "iron", stack: 1, use: "equip", weapon: { kind: "spear", damage: 26, reach: 2.0, stamina: 15, cooldown: 560, arc: 0.5 }, desc: "Reach beats strength when the reach is enough." }),
  pistol: def({ id: "pistol", name: "9mm Pistol", shape: "pistol", material: "gunmetal", stack: 1, use: "equip", weapon: { kind: "ranged", damage: 55, reach: 9, stamina: 4, cooldown: 620, ammo: "ammo9mm" }, desc: "Loud. Loud brings more of them. Use it and run." }),
};

export const ITEM_IDS = Object.keys(ITEMS);
