/**
 * src/content/skills.ts
 * ---------------------
 * Character progression: three thematic skill trees and the derived modifiers
 * they grant. XP comes from doing (kills, gathering, crafting, rescues); each
 * level grants a skill point spent on a node. Nodes gate by tier (points already
 * sunk into that tree), giving each tree a shape without a full node-graph.
 *
 * `computeMods` folds a rank map into a flat `Mods` bag the simulation reads —
 * so the trees stay pure data and the effects live in one place.
 */

export type SkillTree = "warfare" | "endurance" | "dominion";

export interface SkillNode {
  id: string;
  tree: SkillTree;
  name: string;
  maxRank: number;
  /** Points that must already be spent in this tree to unlock the node. */
  reqTree: number;
  /** Effect summary for the panel, given a rank. */
  effect: (rank: number) => string;
}

export const TREE_NAMES: Record<SkillTree, string> = {
  warfare: "Warfare",
  endurance: "Endurance",
  dominion: "Dominion",
};

export const SKILLS: SkillNode[] = [
  // --- Warfare ---
  { id: "w_butchery", tree: "warfare", name: "Butchery", maxRank: 3, reqTree: 0, effect: (r) => `+${r * 8}% melee damage` },
  { id: "w_keen", tree: "warfare", name: "Keen Edge", maxRank: 2, reqTree: 0, effect: (r) => `+${r * 5}% critical chance` },
  { id: "w_vigor", tree: "warfare", name: "Vigour", maxRank: 3, reqTree: 0, effect: (r) => `+${r * 12} max health` },
  { id: "w_sunder", tree: "warfare", name: "Sunder", maxRank: 2, reqTree: 3, effect: (r) => `Ignore ${r * 3} enemy armour` },
  { id: "w_cleave", tree: "warfare", name: "Cleave", maxRank: 1, reqTree: 6, effect: () => `Blows strike all foes around you` },

  // --- Endurance ---
  { id: "e_irongut", tree: "endurance", name: "Iron Gut", maxRank: 3, reqTree: 0, effect: (r) => `−${r * 12}% hunger & thirst loss` },
  { id: "e_forager", tree: "endurance", name: "Forager", maxRank: 2, reqTree: 0, effect: (r) => `+${r} to what you gather` },
  { id: "e_fleet", tree: "endurance", name: "Fleet-foot", maxRank: 2, reqTree: 0, effect: (r) => `+${r * 8}% move speed` },
  { id: "e_plaguewer", tree: "endurance", name: "Plague-ward", maxRank: 2, reqTree: 3, effect: (r) => `−${r * 25}% infection taken` },
  { id: "e_darksight", tree: "endurance", name: "Dark-sight", maxRank: 1, reqTree: 6, effect: () => `See far further in the dark` },

  // --- Dominion ---
  { id: "d_builder", tree: "dominion", name: "Master Builder", maxRank: 2, reqTree: 0, effect: (r) => `−${r * 15}% build costs` },
  { id: "d_bountiful", tree: "dominion", name: "Bountiful", maxRank: 2, reqTree: 0, effect: (r) => `+${r * 50}% settler tribute` },
  { id: "d_medic", tree: "dominion", name: "Field Medic", maxRank: 2, reqTree: 0, effect: (r) => `+${r * 25}% healing` },
  { id: "d_warden", tree: "dominion", name: "Warden", maxRank: 2, reqTree: 3, effect: (r) => `Guards strike +${r * 50}% harder` },
  { id: "d_quarter", tree: "dominion", name: "Quartermaster", maxRank: 1, reqTree: 6, effect: () => `+3 settlers may be housed` },
];

export interface Mods {
  meleeMult: number;
  critChance: number;
  armorPen: number;
  cleave: boolean;
  maxHpBonus: number;
  decayMult: number;
  gatherBonus: number;
  moveMult: number;
  infectionMult: number;
  lightBonus: number;
  buildCostMult: number;
  tributeMult: number;
  healMult: number;
  guardMult: number;
  capBonus: number;
}

export function computeMods(ranks: Record<string, number>): Mods {
  const r = (id: string) => ranks[id] ?? 0;
  return {
    meleeMult: 1 + 0.08 * r("w_butchery"),
    critChance: 0.12 + 0.05 * r("w_keen"),
    armorPen: 3 * r("w_sunder"),
    cleave: r("w_cleave") > 0,
    maxHpBonus: 12 * r("w_vigor"),
    decayMult: Math.max(0.3, 1 - 0.12 * r("e_irongut")),
    gatherBonus: r("e_forager"),
    moveMult: 1 + 0.08 * r("e_fleet"),
    infectionMult: Math.max(0, 1 - 0.25 * r("e_plaguewer")),
    lightBonus: 3 * r("e_darksight"),
    buildCostMult: Math.max(0.4, 1 - 0.15 * r("d_builder")),
    tributeMult: 1 + 0.5 * r("d_bountiful"),
    healMult: 1 + 0.25 * r("d_medic"),
    guardMult: 1 + 0.5 * r("d_warden"),
    capBonus: 3 * r("d_quarter"),
  };
}

/** XP needed to advance FROM the given level to the next. */
export function xpForNext(level: number): number {
  return Math.floor(70 * Math.pow(1.4, level - 1));
}

/** Points already spent in a tree (for tier gating + panel display). */
export function pointsInTree(ranks: Record<string, number>, tree: SkillTree): number {
  let n = 0;
  for (const node of SKILLS) if (node.tree === tree) n += ranks[node.id] ?? 0;
  return n;
}
