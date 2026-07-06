/**
 * src/content/gear.ts
 * -------------------
 * The Destiny-style gear chase. Combat power does NOT come from trainable
 * skills — it comes from GEAR. Every weapon/armour drop is an instance with a
 * rarity (common → legendary) and a rolled Power. Your character Power is the
 * average of what you have equipped; deeper regions recommend higher Power and
 * drop higher Power, so the loot grind is the striving loop.
 *
 * This module is pure data + math over an InvSlot instance (its `power` and
 * `rarity` fields) and its static ItemDef (base damage / armour / archetype).
 */

import type { ArmorSlot, InvSlot, ItemDef } from "../core/types.ts";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** The five armour slots, in head-to-toe order (for stable UI + iteration). */
export const ARMOR_SLOTS: ArmorSlot[] = ["head", "body", "hands", "legs", "feet"];
export function isArmorSlot(slot: string | undefined): slot is ArmorSlot {
  return !!slot && (ARMOR_SLOTS as string[]).includes(slot);
}
/** True for any equippable gear def — a weapon, a shield, or a piece of armour. */
export function isGearDef(def: ItemDef | undefined): boolean {
  return !!def && (!!def.weapon || def.slot === "offhand" || isArmorSlot(def.slot));
}

/** The gathering-skill slots of the tool belt, in display order. */
export const TOOL_SKILLS = ["woodcutting", "mining", "fishing"] as const;

export interface RarityMeta {
  name: string;
  color: string;
  statMult: number; // scales the item's base damage/armour
  powerBonus: number; // added to the rolled Power
  weight: number; // base drop weight (before region danger tilts it)
}

export const RARITY_META: Record<Rarity, RarityMeta> = {
  common:    { name: "Common",    color: "#b6babd", statMult: 1.00, powerBonus: 0,  weight: 100 },
  uncommon:  { name: "Uncommon",  color: "#5fa564", statMult: 1.12, powerBonus: 2,  weight: 52 },
  rare:      { name: "Rare",      color: "#5a90d8", statMult: 1.28, powerBonus: 5,  weight: 22 },
  epic:      { name: "Epic",      color: "#a961d8", statMult: 1.52, powerBonus: 9,  weight: 8 },
  legendary: { name: "Legendary", color: "#d8953a", statMult: 1.85, powerBonus: 15, weight: 2 },
};

export function rarityOf(slot: InvSlot | null | undefined): Rarity {
  const r = slot?.rarity;
  return r && (RARITIES as string[]).includes(r) ? (r as Rarity) : "common";
}

/** Weighted rarity roll; a region's danger tilts the odds toward the rarer end.
 *  `minRarity` clamps the result up (never down) — the guaranteed floor on a
 *  boss's raid-cache drop, for instance. */
export function rollRarity(rng: () => number, danger: number, minRarity?: Rarity): Rarity {
  const tilt = 1 + danger * 0.6; // deeper regions: rarer weights scale up
  const weights = RARITIES.map((r, i) => RARITY_META[r].weight / Math.pow(tilt, RARITIES.length - 1 - i));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let result: Rarity = "common";
  for (let i = 0; i < RARITIES.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) { result = RARITIES[i]!; break; }
  }
  if (minRarity && RARITIES.indexOf(result) < RARITIES.indexOf(minRarity)) return minRarity;
  return result;
}

/** Roll a Power value for a drop around a region's power band + rarity bonus. */
export function rollPower(rng: () => number, band: number, rarity: Rarity): number {
  const spread = Math.round((rng() - 0.4) * 6); // -2.4 .. +3.6
  return Math.max(1, Math.round(band + spread + RARITY_META[rarity].powerBonus));
}

// --- Effective stats: base archetype × rarity, plus a Power scaling term. ---

/** Effective melee/ranged damage of an equipped weapon instance. */
export function weaponDamage(def: ItemDef, slot: InvSlot | null | undefined): number {
  const base = def.weapon?.damage ?? 0;
  const rm = RARITY_META[rarityOf(slot)].statMult;
  const pw = slot?.power ?? 0;
  return Math.round(base * rm * (1 + pw * 0.012));
}

/** Effective armour soak of an equipped body instance. */
export function armorSoak(def: ItemDef, slot: InvSlot | null | undefined): number {
  const base = def.armor ?? 0;
  const rm = RARITY_META[rarityOf(slot)].statMult;
  const pw = slot?.power ?? 0;
  return Math.round(base * rm + pw * 0.18);
}

/** A single gear instance's Power (its rolled Power, or a floor for base gear). */
export function slotPower(slot: InvSlot | null | undefined): number {
  if (!slot) return 0;
  return slot.power ?? 4; // un-rolled starter gear sits at a low floor
}

/** Character Power (gear score) = the average Power of everything you have
 *  equipped — the weapon plus whichever armour slots are filled (Destiny-style
 *  "average of what you have equipped"). Empty slots don't drag it down; you
 *  raise it by equipping higher-Power pieces. */
export function characterPower(weapon: InvSlot | null, armor: (InvSlot | null)[]): number {
  const worn = [weapon, ...armor].filter((s): s is InvSlot => !!s);
  if (worn.length === 0) return 0;
  return Math.round(worn.reduce((n, s) => n + slotPower(s), 0) / worn.length);
}
