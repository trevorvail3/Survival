/**
 * src/content/trainskills.ts
 * --------------------------
 * OSRS-style trainable skills — the foundation of progression. Unlike the
 * perk constellations (src/content/skills.ts), these are levelled by *doing*:
 * every chop, mine, craft, build and kill grants experience in the relevant
 * skill, and levels gate what you can gather, wield and make. This is the pure
 * data + curve; the world simulation grants the XP and reads the levels.
 *
 * XP curve is a compressed take on the OSRS formula so a level feels earned
 * without the multi-hundred-hour grind — MAX_SKILL is 50, not 99.
 */

export type SkillId =
  // gathering
  | "woodcutting" | "mining" | "fishing"
  // production
  | "smithing" | "crafting" | "herblore" | "cooking"
  // settlement
  | "construction";

export const SKILL_IDS: SkillId[] = [
  "woodcutting", "mining", "fishing",
  "smithing", "crafting", "herblore", "cooking",
  "construction",
];

export type SkillGroup = "Gathering" | "Production" | "Settlement";

export interface SkillMeta {
  name: string;
  glyph: string;
  group: SkillGroup;
  blurb: string;
}

// Trainable skills are the OSRS side — gathering and processing only. Combat
// power comes from GEAR (Power score) and the perk trees, not from XP-by-doing.
export const SKILL_META: Record<SkillId, SkillMeta> = {
  woodcutting:  { name: "Woodcutting",  glyph: "axe",       group: "Gathering",  blurb: "Fell trees for timber. Harder wood needs the level." },
  mining:       { name: "Mining",       glyph: "pick",      group: "Gathering",  blurb: "Break rock for stone and ore. Deeper lodes need the level." },
  fishing:      { name: "Fishing",      glyph: "fish",      group: "Gathering",  blurb: "Draw food from the cold water." },
  smithing:     { name: "Smithing",     glyph: "anvil",     group: "Production", blurb: "Smelt ore and work metal into parts and upgrades." },
  crafting:     { name: "Crafting",     glyph: "wrench",    group: "Production", blurb: "Work hide, cord and fletch arrows." },
  herblore:     { name: "Herblore",     glyph: "leaf",      group: "Production", blurb: "Brew poultices, cures and draughts." },
  cooking:      { name: "Cooking",      glyph: "meat",      group: "Production", blurb: "Cook raw food — safe to eat, and it mends more." },
  construction: { name: "Construction", glyph: "hammer",    group: "Settlement", blurb: "Rebuild the castle — clear ruin, raise walls and workshops." },
};

export const SKILL_GROUPS: SkillGroup[] = ["Gathering", "Production", "Settlement"];

export const MAX_SKILL = 50;

/** Cumulative XP required to *reach* a given level (level 1 == 0 xp).
 *  Compressed exponential: quick early levels, a real climb to 50. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_SKILL, level));
  if (l <= 1) return 0;
  return Math.floor(8 * Math.pow(l - 1, 2.3));
}

/** The level a given total XP corresponds to. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  while (lvl < MAX_SKILL && xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}

/** Fraction [0,1) of progress from the current level toward the next. */
export function levelProgress(xp: number): number {
  const lvl = levelForXp(xp);
  if (lvl >= MAX_SKILL) return 1;
  const cur = xpForLevel(lvl), next = xpForLevel(lvl + 1);
  return next > cur ? (xp - cur) / (next - cur) : 1;
}
