/**
 * src/content/items.ts
 * --------------------
 * The goods of a plague-struck realm: foraged materials, makeshift and forged
 * arms, armour, and the poultices and antidotes that keep the rot at bay. Data
 * only — icons are drawn procedurally from `shape` + `material`.
 */

import type { ItemDef, ItemId } from "../core/types.ts";

const def = (d: ItemDef): ItemDef => d;

export const ITEMS: Record<ItemId, ItemDef> = {
  // --- Raw materials ---
  wood: def({ id: "wood", name: "Timber", shape: "log", material: "wood", stack: 50, use: "none", desc: "Split logs. The bones of every wall and haft." }),
  stone: def({ id: "stone", name: "Stone", shape: "stone", material: "stone", stack: 50, use: "none", desc: "Rough-hewn stone for walls and edges." }),
  iron_ore: def({ id: "iron_ore", name: "Iron Ore", shape: "ore", material: "iron", stack: 50, use: "none", desc: "Raw ore. The forge makes it worth something." }),
  iron: def({ id: "iron", name: "Iron Ingot", shape: "ingot", material: "iron", stack: 50, use: "none", desc: "Smelted iron. Blades, mail, nails." }),
  cloth: def({ id: "cloth", name: "Linen", shape: "cloth", material: "cloth", stack: 50, use: "none", desc: "Torn cloth. Binds wounds and wicks flame." }),
  leather: def({ id: "leather", name: "Hide", shape: "hide", material: "leather", stack: 50, use: "none", desc: "Cured hide for armour and skins." }),
  herb: def({ id: "herb", name: "Feverfew", shape: "herb", material: "herb", stack: 50, use: "none", desc: "A bitter weed that fights the rot in the blood." }),
  bone: def({ id: "bone", name: "Bone", shape: "bone", material: "bone", stack: 50, use: "none", desc: "Not all of it is animal." }),
  rope: def({ id: "rope", name: "Rope", shape: "coil", material: "rope", stack: 30, use: "none", desc: "Twisted hemp. Binds hafts and lashes palisades." }),
  oil: def({ id: "oil", name: "Lamp Oil", shape: "flask", material: "oil", stack: 20, use: "none", desc: "Rendered fat and pitch. It burns eagerly." }),

  // --- Food chain (Fishing -> Cooking) ---
  raw_fish: def({ id: "raw_fish", name: "Raw Fish", shape: "fish", material: "fish", stack: 20, use: "none", desc: "Cold and slick. Cook it before you trust it to your gut." }),
  cooked_fish: def({ id: "cooked_fish", name: "Cooked Fish", shape: "fish", material: "cooked", stack: 20, use: "heal", heal: 22, desc: "Charred over the hearth. A good field meal — mends a little." }),

  // --- Consumables ---
  poultice: def({ id: "poultice", name: "Poultice", shape: "poultice", material: "herb", stack: 15, use: "heal", heal: 40, desc: "Herb and linen packed to a wound. Closes it." }),
  bread: def({ id: "bread", name: "Black Bread", shape: "bread", material: "bread", stack: 15, use: "heal", heal: 20, desc: "Hard, dark, filling. A welcome bite on a long expedition." }),
  waterskin: def({ id: "waterskin", name: "Waterskin", shape: "waterskin", material: "leather", stack: 10, use: "cure", cure: 20, desc: "Boiled clean. A swallow eases the fever in your blood." }),
  antidote: def({ id: "antidote", name: "Antidote", shape: "vial", material: "toxic", stack: 10, use: "cure", cure: 60, heal: 8, desc: "A feverfew brew that beats the plague back." }),
  firebomb: def({ id: "firebomb", name: "Firepot", shape: "firebomb", material: "glass", stack: 8, use: "throw", throwDamage: 55, throwRadius: 2.2, fire: true, desc: "A sealed pot of oil and flame. The dead fear fire." }),

  // --- Ammunition ---
  arrow: def({ id: "arrow", name: "Arrows", shape: "arrow", material: "wood", stack: 80, use: "none", desc: "Fletched shafts. Never enough in the quiver." }),

  // --- Sealed Coffer (the raid payoff) ---
  // A warden's warded strongbox. It carries a guaranteed rarity floor and a
  // power band on its instance (InvSlot.rarity / .power); its true contents are
  // only rolled when you break its seal back at the settlement. Carry it home —
  // fall in the wilds and it's lost with the rest of your pack.
  coffer: def({ id: "coffer", name: "Sealed Coffer", shape: "coffer", material: "iron", stack: 1, use: "none", desc: "A warden's warded strongbox, still sealed. Break it open at your settlement to see what fortune it holds." }),

  // --- Weapons ---
  fists: def({ id: "fists", name: "Bare Hands", shape: "fist", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "fist", damage: 6, reach: 1.0, cooldown: 900 }, desc: "Better than nothing. Barely." }),
  club: def({ id: "club", name: "Wooden Club", shape: "club", material: "wood", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blunt", damage: 14, reach: 1.2, cooldown: 1100 }, desc: "A knot of oak. Cracks skulls, old or risen." }),
  spear: def({ id: "spear", name: "Boar Spear", shape: "spear", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "spear", damage: 20, reach: 2.0, cooldown: 1150 }, desc: "Reach beats strength when the reach is enough." }),
  hatchet: def({ id: "hatchet", name: "Hatchet", shape: "axe", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "axe", damage: 22, reach: 1.3, cooldown: 1250 }, desc: "Fells timber and the things that were men." }),
  rusty_sword: def({ id: "rusty_sword", name: "Rusted Sword", shape: "sword", material: "rust", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 24, reach: 1.4, cooldown: 1000 }, desc: "Pitted and notched, but it still bites." }),
  iron_sword: def({ id: "iron_sword", name: "Iron Sword", shape: "sword", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 34, reach: 1.4, cooldown: 950 }, desc: "Forge-true steel. The soldier's answer." }),
  steel_sword: def({ id: "steel_sword", name: "Steel Longsword", shape: "sword", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 48, reach: 1.5, cooldown: 900 }, desc: "A knight's blade. It remembers its purpose." }),
  warmace: def({ id: "warmace", name: "War Mace", shape: "mace", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blunt", damage: 44, reach: 1.3, cooldown: 1250 }, desc: "Heavy iron head. Armour and bone alike give way." }),
  warbow: def({ id: "warbow", name: "War Bow", shape: "bow", material: "wood", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "bow", damage: 30, reach: 7, cooldown: 1400, ammo: "arrow" }, desc: "Yew and sinew. Death before they reach the wall." }),

  // --- Armour ---
  leather_armor: def({ id: "leather_armor", name: "Leather Jack", shape: "armor", material: "leather", stack: 1, use: "equip", slot: "body", armor: 4, desc: "Boiled hide. Turns a claw, sometimes." }),
  mail: def({ id: "mail", name: "Chain Mail", shape: "armor", material: "iron", stack: 1, use: "equip", slot: "body", armor: 9, desc: "Riveted rings. The weight is worth it." }),
  plate: def({ id: "plate", name: "Plate Harness", shape: "armor", material: "steel", stack: 1, use: "equip", slot: "body", armor: 16, desc: "A knight's harness. The dead break their teeth on it." }),
};

export const ITEM_IDS = Object.keys(ITEMS);
