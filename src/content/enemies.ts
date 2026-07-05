/**
 * src/content/enemies.ts
 * ----------------------
 * The risen dead and the beasts the plague made. Four silhouettes, four threats:
 *  - risen:    slow, everywhere, deadly in numbers (the shambling villagers).
 *  - hound:    fast, fragile, punishes the open road (plague-maddened dogs).
 *  - wretch:   tough, hits hard — a bloated, festering horror.
 *  - revenant: armoured risen knight; slow, brutal, a wall you must out-play.
 */

import type { EnemyDef, EnemyKind } from "../core/types.ts";

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  risen: { kind: "risen", name: "Risen", hp: 42, damage: 8, speed: 1.4, sense: 6, attackCd: 1200, reach: 1.0, armor: 0, bounty: 1 },
  hound: { kind: "hound", name: "Plague Hound", hp: 26, damage: 12, speed: 3.4, sense: 9, attackCd: 800, reach: 1.0, armor: 0, bounty: 2 },
  wretch: { kind: "wretch", name: "Wretch", hp: 90, damage: 20, speed: 1.6, sense: 5, attackCd: 1100, reach: 1.1, armor: 2, bounty: 4 },
  revenant: { kind: "revenant", name: "Revenant Knight", hp: 220, damage: 34, speed: 1.5, sense: 8, attackCd: 1500, reach: 1.5, armor: 8, bounty: 12 },
  graveking: { kind: "graveking", name: "The Barrow King", hp: 640, damage: 52, speed: 1.5, sense: 11, attackCd: 1500, reach: 1.8, armor: 14, bounty: 60 },
  prior: { kind: "prior", name: "The Pale Prior", hp: 360, damage: 30, speed: 2.0, sense: 11, attackCd: 1100, reach: 1.4, armor: 6, bounty: 40 },
  rotmother: { kind: "rotmother", name: "The Rot-Mother", hp: 1200, damage: 60, speed: 1.3, sense: 13, attackCd: 1600, reach: 2.1, armor: 16, bounty: 150 },
};
