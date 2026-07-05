/**
 * src/content/skills.ts
 * ---------------------
 * Character progression: three skill constellations, Skyrim/Cyberpunk style.
 * Each node sits at a position in its tree and is unlocked by its prerequisite
 * node(s) — you follow branching chains from a root to the capstones. The trees
 * are wide enough to support distinct builds: a fast-crit or low-health
 * berserker or armour-breaking bruiser; a foraging, stealthy, or self-healing
 * survivor; a turtling settlement lord.
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
  x: number; // column 0..2
  y: number; // row 0..3 (top = root)
  requires: string[];
  effect: (rank: number) => string;
}

export const TREE_NAMES: Record<SkillTree, string> = {
  warfare: "Warfare",
  endurance: "Endurance",
  dominion: "Dominion",
};

export const SKILLS: SkillNode[] = [
  // --- Warfare ---
  { id: "w_butchery", tree: "warfare", name: "Butchery", maxRank: 3, x: 1, y: 0, requires: [], effect: (r) => `+${r * 8}% weapon damage` },
  { id: "w_keen", tree: "warfare", name: "Keen Edge", maxRank: 2, x: 0, y: 1, requires: ["w_butchery"], effect: (r) => `+${r * 5}% critical chance` },
  { id: "w_vigor", tree: "warfare", name: "Vigour", maxRank: 3, x: 1, y: 1, requires: ["w_butchery"], effect: (r) => `+${r * 12} max health` },
  { id: "w_sunder", tree: "warfare", name: "Sunder", maxRank: 2, x: 2, y: 1, requires: ["w_butchery"], effect: (r) => `Ignore ${r * 3} enemy armour` },
  { id: "w_rapid", tree: "warfare", name: "Alacrity", maxRank: 2, x: 0, y: 2, requires: ["w_keen"], effect: (r) => `+${r * 10}% attack speed` },
  { id: "w_bulwark", tree: "warfare", name: "Bulwark", maxRank: 2, x: 1, y: 2, requires: ["w_vigor"], effect: (r) => `−${r * 5} damage taken` },
  { id: "w_cleave", tree: "warfare", name: "Cleave", maxRank: 1, x: 2, y: 2, requires: ["w_sunder"], effect: () => `Blows strike all foes around you` },
  { id: "w_berserk", tree: "warfare", name: "Berserker", maxRank: 2, x: 1, y: 3, requires: ["w_bulwark"], effect: (r) => `+${r * 25}% damage below half health` },

  // --- Endurance ---
  { id: "e_irongut", tree: "endurance", name: "Iron Gut", maxRank: 3, x: 1, y: 0, requires: [], effect: (r) => `−${r * 12}% hunger & thirst loss` },
  { id: "e_forager", tree: "endurance", name: "Forager", maxRank: 2, x: 0, y: 1, requires: ["e_irongut"], effect: (r) => `+${r} to what you gather` },
  { id: "e_plaguewer", tree: "endurance", name: "Plague-ward", maxRank: 2, x: 1, y: 1, requires: ["e_irongut"], effect: (r) => `−${r * 25}% infection taken` },
  { id: "e_fleet", tree: "endurance", name: "Fleet-foot", maxRank: 2, x: 2, y: 1, requires: ["e_irongut"], effect: (r) => `+${r * 8}% move speed` },
  { id: "e_scavenger", tree: "endurance", name: "Scavenger", maxRank: 2, x: 0, y: 2, requires: ["e_forager"], effect: (r) => `+${r} from chests & bodies` },
  { id: "e_recover", tree: "endurance", name: "Second Wind", maxRank: 2, x: 1, y: 2, requires: ["e_plaguewer"], effect: (r) => `Recover ${(r * 0.6).toFixed(1)} health/sec` },
  { id: "e_prowl", tree: "endurance", name: "Prowl", maxRank: 2, x: 2, y: 2, requires: ["e_fleet"], effect: (r) => `Foes notice you ${r * 20}% later` },
  { id: "e_darksight", tree: "endurance", name: "Dark-sight", maxRank: 1, x: 1, y: 3, requires: ["e_recover"], effect: () => `See far further in the dark` },

  // --- Dominion ---
  { id: "d_builder", tree: "dominion", name: "Master Builder", maxRank: 2, x: 1, y: 0, requires: [], effect: (r) => `−${r * 15}% build costs` },
  { id: "d_bountiful", tree: "dominion", name: "Bountiful", maxRank: 2, x: 0, y: 1, requires: ["d_builder"], effect: (r) => `+${r * 50}% settler tribute` },
  { id: "d_warden", tree: "dominion", name: "Warden", maxRank: 2, x: 1, y: 1, requires: ["d_builder"], effect: (r) => `Guards strike +${r * 50}% harder` },
  { id: "d_medic", tree: "dominion", name: "Field Medic", maxRank: 2, x: 2, y: 1, requires: ["d_builder"], effect: (r) => `+${r * 25}% healing` },
  { id: "d_fortify", tree: "dominion", name: "Fortify", maxRank: 2, x: 1, y: 2, requires: ["d_warden"], effect: (r) => `−${r * 20}% night attackers` },
  { id: "d_quarter", tree: "dominion", name: "Quartermaster", maxRank: 1, x: 2, y: 2, requires: ["d_medic"], effect: () => `+3 settlers may be housed` },
  { id: "d_rally", tree: "dominion", name: "Rally", maxRank: 1, x: 1, y: 3, requires: ["d_fortify"], effect: () => `Heal steadily within your walls` },
];

export interface Mods {
  meleeMult: number;
  critChance: number;
  armorPen: number;
  cleave: boolean;
  maxHpBonus: number;
  dmgReduce: number;
  cooldownMult: number;
  lowHpDmg: number;
  decayMult: number;
  gatherBonus: number;
  lootLuck: number;
  moveMult: number;
  infectionMult: number;
  regen: number;
  senseMult: number;
  lightBonus: number;
  buildCostMult: number;
  tributeMult: number;
  healMult: number;
  guardMult: number;
  raidMult: number;
  rallyRegen: number;
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
    dmgReduce: 5 * r("w_bulwark"),
    cooldownMult: Math.max(0.5, 1 - 0.1 * r("w_rapid")),
    lowHpDmg: 0.25 * r("w_berserk"),
    decayMult: Math.max(0.3, 1 - 0.12 * r("e_irongut")),
    gatherBonus: r("e_forager"),
    lootLuck: r("e_scavenger"),
    moveMult: 1 + 0.08 * r("e_fleet"),
    infectionMult: Math.max(0, 1 - 0.25 * r("e_plaguewer")),
    regen: 0.6 * r("e_recover"),
    senseMult: Math.max(0.4, 1 - 0.2 * r("e_prowl")),
    lightBonus: 3 * r("e_darksight"),
    buildCostMult: Math.max(0.4, 1 - 0.15 * r("d_builder")),
    tributeMult: 1 + 0.5 * r("d_bountiful"),
    healMult: 1 + 0.25 * r("d_medic"),
    guardMult: 1 + 0.5 * r("d_warden"),
    raidMult: Math.max(0.2, 1 - 0.2 * r("d_fortify")),
    rallyRegen: 0.8 * r("d_rally"),
    capBonus: 3 * r("d_quarter"),
  };
}

/** A node is reachable once every prerequisite has at least one rank. */
export function nodeUnlocked(ranks: Record<string, number>, node: SkillNode): boolean {
  return node.requires.every((id) => (ranks[id] ?? 0) >= 1);
}

export function xpForNext(level: number): number {
  return Math.floor(70 * Math.pow(1.4, level - 1));
}

export function pointsInTree(ranks: Record<string, number>, tree: SkillTree): number {
  let n = 0;
  for (const node of SKILLS) if (node.tree === tree) n += ranks[node.id] ?? 0;
  return n;
}
