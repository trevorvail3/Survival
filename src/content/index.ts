/**
 * src/content/index.ts
 * --------------------
 * Assembles all static content into one `Content` bundle the rest of the game
 * reads from. Content is data; behaviour lives in core + client.
 */

import type { Content } from "../core/types.ts";
import { ITEMS } from "./items.ts";
import { ENEMIES } from "./enemies.ts";
import { RECIPES } from "./recipes.ts";

export const content: Content = {
  items: ITEMS,
  enemies: ENEMIES,
  recipes: RECIPES,
};

export { generateLayout, MAP_W, MAP_H } from "./map.ts";
export { rollLoot } from "./loot.ts";
