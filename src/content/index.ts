/**
 * src/content/index.ts
 * --------------------
 * Assembles all static content into one `Content` bundle. Content is data;
 * behaviour lives in core + client.
 */

import type { Content } from "../core/types.ts";
import { ITEMS } from "./items.ts";
import { ENEMIES } from "./enemies.ts";
import { RECIPES } from "./recipes.ts";
import { STRUCTURES } from "./settlement.ts";
import { REGIONS } from "./regions.ts";

export const content: Content = {
  items: ITEMS,
  enemies: ENEMIES,
  recipes: RECIPES,
  structures: STRUCTURES,
  regions: REGIONS,
};

export { generateHome, generateRegion, HOME_W, HOME_H, REGION_W, REGION_H } from "./map.ts";
export { rollLoot } from "./loot.ts";
export { settlementCapacity } from "./settlement.ts";
export { regionById } from "./regions.ts";
export { SKILLS, TREE_NAMES, computeMods, xpForNext, pointsInTree } from "./skills.ts";
