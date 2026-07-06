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
  bolt: def({ id: "bolt", name: "Bolts", shape: "arrow", material: "iron", stack: 60, use: "none", desc: "Stubby iron quarrels. A crossbow spits them through mail." }),

  // --- Sealed Coffer (the raid payoff) ---
  // A warden's warded strongbox. It carries a guaranteed rarity floor and a
  // power band on its instance (InvSlot.rarity / .power); its true contents are
  // only rolled when you break its seal back at the settlement. Carry it home —
  // fall in the wilds and it's lost with the rest of your pack.
  coffer: def({ id: "coffer", name: "Sealed Coffer", shape: "coffer", material: "iron", stack: 1, use: "none", desc: "A warden's warded strongbox, still sealed. Break it open at your settlement to see what fortune it holds." }),

  // --- Weapons ---
  // Every weapon is viable in its own way — read the stat block: fast crit-
  // fishers (daggers/estoc), reach (spear/halberd), armour-piercers (mace/
  // hammer/crossbow), cleaving great weapons, and ranged (bows/crossbow).
  fists: def({ id: "fists", name: "Bare Hands", shape: "fist", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "fist", damage: 6, reach: 1.0, cooldown: 900 }, desc: "Better than nothing. Barely." }),

  // Daggers & thrusting blades — fast, short, crit-hungry. Glass-cannon DPS.
  rusty_dagger: def({ id: "rusty_dagger", name: "Rusted Dagger", shape: "dagger", material: "rust", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "dagger", damage: 11, reach: 1.0, cooldown: 550, crit: 0.12 }, desc: "A quick, mean little blade. In and out before they turn." }),
  iron_dagger: def({ id: "iron_dagger", name: "Iron Dagger", shape: "dagger", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "dagger", damage: 16, reach: 1.0, cooldown: 560, crit: 0.14 }, desc: "Balanced for the throat. Fast hands win the exchange." }),
  estoc: def({ id: "estoc", name: "Estoc", shape: "dagger", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 22, reach: 1.5, cooldown: 720, crit: 0.10, armorPen: 3 }, desc: "A stiff thrusting blade that finds the gaps in mail." }),

  // Swords — the balanced all-rounders.
  club: def({ id: "club", name: "Wooden Club", shape: "club", material: "wood", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blunt", damage: 14, reach: 1.2, cooldown: 1100 }, desc: "A knot of oak. Cracks skulls, old or risen." }),
  hatchet: def({ id: "hatchet", name: "Hatchet", shape: "axe", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "axe", damage: 22, reach: 1.3, cooldown: 1250, armorPen: 2 }, desc: "Fells timber and the things that were men." }),
  rusty_sword: def({ id: "rusty_sword", name: "Rusted Sword", shape: "sword", material: "rust", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 24, reach: 1.4, cooldown: 1000 }, desc: "Pitted and notched, but it still bites." }),
  iron_sword: def({ id: "iron_sword", name: "Iron Sword", shape: "sword", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 34, reach: 1.4, cooldown: 950 }, desc: "Forge-true steel. The soldier's answer." }),
  steel_sword: def({ id: "steel_sword", name: "Steel Longsword", shape: "sword", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 48, reach: 1.5, cooldown: 900 }, desc: "A knight's blade. It remembers its purpose." }),

  // Reach — polearms hold foes at bay; the halberd sweeps (two-handed).
  spear: def({ id: "spear", name: "Boar Spear", shape: "spear", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "spear", damage: 20, reach: 2.0, cooldown: 1150 }, desc: "Reach beats strength when the reach is enough. Leaves a hand for a shield." }),
  halberd: def({ id: "halberd", name: "Halberd", shape: "halberd", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "spear", damage: 34, reach: 2.5, cooldown: 1300, cleave: true, twoHanded: true }, desc: "Axe, spike and hook on a long haft. It sweeps a whole rank." }),

  // Blunt & anti-armour — slow, but they pierce the dead's plate and bone.
  warmace: def({ id: "warmace", name: "War Mace", shape: "mace", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blunt", damage: 44, reach: 1.3, cooldown: 1250, armorPen: 6 }, desc: "Heavy iron head. Armour and bone alike give way — and a hand to spare for a shield." }),
  warhammer: def({ id: "warhammer", name: "War Hammer", shape: "warhammer", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blunt", damage: 50, reach: 1.3, cooldown: 1350, armorPen: 9, twoHanded: true }, desc: "A great spiked maul. Nothing's armour means much to it." }),

  // Great weapons — heavy, slow, two-handed, and they cleave everything in the arc.
  battleaxe: def({ id: "battleaxe", name: "Battle Axe", shape: "greataxe", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "axe", damage: 40, reach: 1.5, cooldown: 1300, armorPen: 4, cleave: true, twoHanded: true }, desc: "Two hands, one wide arc. It doesn't stop at the first body." }),
  greataxe: def({ id: "greataxe", name: "Headsman's Axe", shape: "greataxe", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "axe", damage: 58, reach: 1.6, cooldown: 1500, armorPen: 6, cleave: true, twoHanded: true }, desc: "A great crescent of steel. It ends arguments." }),
  greatsword: def({ id: "greatsword", name: "Greatsword", shape: "greatsword", material: "steel", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "blade", damage: 52, reach: 1.8, cooldown: 1250, cleave: true, twoHanded: true }, desc: "As long as a man is tall. Wide, sweeping ruin." }),

  // Ranged — bows and the armour-piercing crossbow (all two-handed).
  shortbow: def({ id: "shortbow", name: "Short Bow", shape: "bow", material: "wood", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "bow", damage: 20, reach: 6, cooldown: 800, ammo: "arrow", twoHanded: true }, desc: "Quick to draw, quick to loose. Keeps them at arm's reach." }),
  warbow: def({ id: "warbow", name: "War Bow", shape: "bow", material: "wood", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "bow", damage: 30, reach: 7, cooldown: 1400, ammo: "arrow", twoHanded: true }, desc: "Yew and sinew. Death before they reach the wall." }),
  longbow: def({ id: "longbow", name: "Long Bow", shape: "bow", material: "wood", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "bow", damage: 38, reach: 9, cooldown: 1500, ammo: "arrow", twoHanded: true }, desc: "A tall bow of war. It reaches farther than anything walks." }),
  crossbow: def({ id: "crossbow", name: "Crossbow", shape: "crossbow", material: "iron", stack: 1, use: "equip", slot: "weapon", weapon: { kind: "crossbow", damage: 54, reach: 8, cooldown: 1900, armorPen: 6, ammo: "bolt", twoHanded: true }, desc: "Slow to crank, but a bolt punches clean through mail." }),

  // --- Armour ---
  // Five slots (head/body/hands/legs/feet), three material tiers each. Body is
  // the anchor; the smaller slots add up so a full head-to-toe set soaks far
  // more than any one piece. Rolled Power/rarity scale each on top.

  // Head
  leather_cap: def({ id: "leather_cap", name: "Leather Cap", shape: "helm", material: "leather", stack: 1, use: "equip", slot: "head", armor: 2, desc: "A boiled cap. Better than a bare skull." }),
  mail_coif: def({ id: "mail_coif", name: "Mail Coif", shape: "helm", material: "iron", stack: 1, use: "equip", slot: "head", armor: 4, desc: "A hood of rings. Keeps teeth off your throat." }),
  plate_helm: def({ id: "plate_helm", name: "Plate Helm", shape: "helm", material: "steel", stack: 1, use: "equip", slot: "head", armor: 7, desc: "A closed great-helm. The world narrows to a slit — and you live." }),

  // Body
  leather_armor: def({ id: "leather_armor", name: "Leather Jack", shape: "armor", material: "leather", stack: 1, use: "equip", slot: "body", armor: 4, desc: "Boiled hide. Turns a claw, sometimes." }),
  mail: def({ id: "mail", name: "Chain Mail", shape: "armor", material: "iron", stack: 1, use: "equip", slot: "body", armor: 9, desc: "Riveted rings. The weight is worth it." }),
  plate: def({ id: "plate", name: "Plate Harness", shape: "armor", material: "steel", stack: 1, use: "equip", slot: "body", armor: 16, desc: "A knight's harness. The dead break their teeth on it." }),

  // Hands
  leather_gloves: def({ id: "leather_gloves", name: "Leather Gloves", shape: "gauntlet", material: "leather", stack: 1, use: "equip", slot: "hands", armor: 1, desc: "Worn grips. Keeps the haft from your blood." }),
  mail_gauntlets: def({ id: "mail_gauntlets", name: "Mail Gauntlets", shape: "gauntlet", material: "iron", stack: 1, use: "equip", slot: "hands", armor: 3, desc: "Ringed backs, leather palms. A soldier's hands." }),
  plate_gauntlets: def({ id: "plate_gauntlets", name: "Plate Gauntlets", shape: "gauntlet", material: "steel", stack: 1, use: "equip", slot: "hands", armor: 5, desc: "Articulated steel. A fist that fears nothing." }),

  // Legs
  leather_leggings: def({ id: "leather_leggings", name: "Leather Leggings", shape: "greaves", material: "leather", stack: 1, use: "equip", slot: "legs", armor: 2, desc: "Hide over the thighs. Keeps you moving." }),
  mail_chausses: def({ id: "mail_chausses", name: "Mail Chausses", shape: "greaves", material: "iron", stack: 1, use: "equip", slot: "legs", armor: 5, desc: "Ringed leggings. Heavy, but the hounds get nothing." }),
  plate_greaves: def({ id: "plate_greaves", name: "Plate Greaves", shape: "greaves", material: "steel", stack: 1, use: "equip", slot: "legs", armor: 9, desc: "Plated shins and thighs. You wade in where others fall." }),

  // Feet
  worn_boots: def({ id: "worn_boots", name: "Worn Boots", shape: "boots", material: "leather", stack: 1, use: "equip", slot: "feet", armor: 1, desc: "Cracked leather. Dry feet, most days." }),
  mail_sabatons: def({ id: "mail_sabatons", name: "Mail Sabatons", shape: "boots", material: "iron", stack: 1, use: "equip", slot: "feet", armor: 3, desc: "Ringed overshoes. The mire still finds a way in." }),
  plate_sabatons: def({ id: "plate_sabatons", name: "Plate Sabatons", shape: "boots", material: "steel", stack: 1, use: "equip", slot: "feet", armor: 5, desc: "Steel-shod feet. You stand where you please." }),

  // --- Shields (off-hand) ---
  // A shield trades a two-handed weapon's raw power for heavy soak. It fills the
  // off-hand, so you can only carry one alongside a ONE-handed weapon — the
  // sword-and-board playstyle against the great-weapon glass cannon.
  buckler: def({ id: "buckler", name: "Buckler", shape: "shield", material: "wood", stack: 1, use: "equip", slot: "offhand", armor: 4, desc: "A small round shield. Turns a blow, if you're quick with it." }),
  kite_shield: def({ id: "kite_shield", name: "Kite Shield", shape: "shield", material: "iron", stack: 1, use: "equip", slot: "offhand", armor: 8, desc: "Iron-rimmed and tall. A wall you carry on one arm." }),
  tower_shield: def({ id: "tower_shield", name: "Tower Shield", shape: "shield", material: "steel", stack: 1, use: "equip", slot: "offhand", armor: 13, desc: "A slab of banded steel. Behind it, the dead break." }),
};

export const ITEM_IDS = Object.keys(ITEMS);
