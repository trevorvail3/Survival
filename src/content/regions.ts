/**
 * src/content/regions.ts
 * ----------------------
 * The regions you set out to from the settlement. Each is its own generated
 * zone with a distinct resource bias, danger and cast of the dead. Travel is a
 * loop: leave home by the waystone, scavenge and rescue, return to bank it all
 * at your settlement. Regions regenerate each visit so the wilds keep giving.
 */

import type { RegionDef } from "../core/types.ts";

export const REGIONS: RegionDef[] = [
  {
    id: "woods",
    name: "Frostpine Wood",
    blurb: "Sick pine and feverfew under a grey sky. The risen shamble between the boles — few, but they do not tire.",
    danger: 1,
    treeCount: 22, rockCount: 6, herbCount: 16, chests: 3, survivors: 1,
    enemyMix: ["risen", "risen", "hound"], enemyCount: 12, mx: 0.22, my: 0.30,
  },
  {
    id: "abbey",
    name: "The Ashen Chantry",
    blurb: "A burned hall of the old faith. Its wretches still keep a vigil no living soul asked for.",
    danger: 2,
    treeCount: 6, rockCount: 14, herbCount: 6, chests: 8, survivors: 2,
    enemyMix: ["risen", "wretch", "wretch"], enemyCount: 14,
    boss: "prior", mx: 0.76, my: 0.26,
  },
  {
    id: "mire",
    name: "Reachwater Mire",
    blurb: "Black fen and drowned cairns. Something with too many teeth keeps to the reed-banks.",
    danger: 2,
    treeCount: 10, rockCount: 6, herbCount: 22, chests: 4, survivors: 1,
    enemyMix: ["hound", "hound", "wretch"], enemyCount: 15, mx: 0.24, my: 0.76,
  },
  {
    id: "barrows",
    name: "The Iron Barrows",
    blurb: "Nord dead laid down with their iron, and risen to keep it. The richest ore — bought in blood.",
    danger: 3,
    treeCount: 4, rockCount: 24, herbCount: 4, chests: 5, survivors: 1,
    enemyMix: ["wretch", "revenant", "risen"], enemyCount: 16,
    boss: "graveking", mx: 0.80, my: 0.72,
  },
  {
    id: "heart",
    name: "The Rotcradle",
    blurb: "Where the plague drew its first breath. The Rot-Mother has not stopped breathing since. End her, and end it all.",
    danger: 4,
    treeCount: 2, rockCount: 2, herbCount: 4, chests: 3, survivors: 0,
    enemyMix: ["wretch", "revenant", "wretch"], enemyCount: 14,
    boss: "rotmother", requires: ["graveking", "prior"], final: true,
    mx: 0.5, my: 0.12,
  },
];

export function regionById(id: string): RegionDef | undefined {
  return REGIONS.find((r) => r.id === id);
}
