/**
 * src/content/enemies.ts
 * ----------------------
 * The infected. Four silhouettes, each a different threat grammar:
 *  - shambler: slow, everywhere, dangerous in numbers (Resident Evil crowd).
 *  - runner:   fast + fragile, punishes standing still (The Last of Us).
 *  - stalker:  near-blind, hunts by sound; sprint near it and it swarms (Clicker).
 *  - brute:    slow, huge, staggers you — a hard gate you learn to dodge (Elden Ring).
 */

import type { EnemyDef, EnemyKind } from "../core/types.ts";

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: { kind: "shambler", name: "Shambler", hp: 44, damage: 9, speed: 1.5, sense: 6, attackCd: 1100, reach: 1.0, bounty: 1 },
  runner: { kind: "runner", name: "Runner", hp: 28, damage: 13, speed: 3.6, sense: 9, attackCd: 720, reach: 1.0, bounty: 2 },
  stalker: { kind: "stalker", name: "Stalker", hp: 60, damage: 26, speed: 2.8, sense: 3.5, attackCd: 900, reach: 1.1, bounty: 4 },
  brute: { kind: "brute", name: "Brute", hp: 220, damage: 40, speed: 1.4, sense: 8, attackCd: 1500, reach: 1.6, bounty: 12 },
};
