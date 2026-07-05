/**
 * src/content/map.ts
 * ------------------
 * Procedural generation of the two kinds of place in Ashfall:
 *  - `generateHome`  — the persistent walled steading (the hub): hearth, forge,
 *    workshop, town board, a waystone to set out from, and a little yard to
 *    gather in.
 *  - `generateRegion` — a themed expedition zone (woods / abbey / mire /
 *    barrows) with biased resources, ruins, survivors, a return waystone, and
 *    the dead. Regenerated each visit, so the wilds keep giving.
 * All seeded, so a run reproduces.
 */

import type { EnemyKind, GameMap, Prop, RegionDef, TileType, Vec2 } from "../core/types.ts";
import { randInt } from "../core/rng.ts";

export const HOME_W = 40;
export const HOME_H = 40;
export const REGION_W = 74;
export const REGION_H = 74;

export interface Layout {
  map: GameMap;
  props: Prop[];
  playerStart: Vec2;
  home: { x: number; y: number; w: number; h: number };
  enemySpawns?: { kind: EnemyKind; x: number; y: number; boss?: boolean }[];
}

interface Grid {
  w: number; h: number; tiles: TileType[]; indoor: boolean[];
  idx: (x: number, y: number) => number;
  inb: (x: number, y: number) => boolean;
  set: (x: number, y: number, t: TileType) => void;
  get: (x: number, y: number) => TileType;
}
function makeGrid(w: number, h: number, fill: TileType): Grid {
  const tiles: TileType[] = new Array(w * h).fill(fill);
  const indoor: boolean[] = new Array(w * h).fill(false);
  const idx = (x: number, y: number) => y * w + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  return {
    w, h, tiles, indoor, idx, inb,
    set: (x, y, t) => { if (inb(x, y)) tiles[idx(x, y)] = t; },
    get: (x, y) => (inb(x, y) ? tiles[idx(x, y)]! : "wall"),
  };
}

function borderWood(g: Grid): void {
  for (let x = 0; x < g.w; x++) { g.set(x, 0, "forest"); g.set(x, 1, "forest"); g.set(x, g.h - 1, "forest"); g.set(x, g.h - 2, "forest"); }
  for (let y = 0; y < g.h; y++) { g.set(0, y, "forest"); g.set(1, y, "forest"); g.set(g.w - 1, y, "forest"); g.set(g.w - 2, y, "forest"); }
}

const walkableGround = (g: Grid, x: number, y: number): boolean => {
  const t = g.get(x, y);
  return t === "grass" || t === "dirt" || t === "path" || t === "cobble" || t === "field";
};

// ---------------------------------------------------------------------------
// Home settlement (persistent hub)
// ---------------------------------------------------------------------------

export function generateHome(rng: () => number): Layout {
  const g = makeGrid(HOME_W, HOME_H, "grass");
  for (let i = 0; i < 30; i++) {
    const bx = randInt(rng, 2, g.w - 3), by = randInt(rng, 2, g.h - 3);
    for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (rng() < 0.5) g.set(x, y, rng() < 0.5 ? "dirt" : "field");
  }
  borderWood(g);

  const cx = Math.floor(g.w / 2), cy = Math.floor(g.h / 2);
  const props: Prop[] = [];
  let pid = 1;
  const addProp = (kind: Prop["kind"], x: number, y: number, loot?: string) => { props.push({ id: pid++, kind, pos: { x, y }, used: false, ...(loot ? { loot } : {}) }); };

  const x0 = cx - 9, y0 = cy - 7, x1 = cx + 9, y1 = cy + 7;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y, x === x0 || x === x1 || y === y0 || y === y1 ? "wall" : "cobble");
  g.set(cx, y1, "gate"); g.set(cx + 1, y1, "gate");
  addProp("gate", cx, y1);
  for (let y = y1 + 1; y < g.h - 3; y++) { g.set(cx, y, "path"); g.set(cx + 1, y, "path"); }

  const room = (rx0: number, ry0: number, rw: number, rh: number) => {
    for (let y = ry0; y <= ry0 + rh; y++) for (let x = rx0; x <= rx0 + rw; x++) {
      const edge = x === rx0 || x === rx0 + rw || y === ry0 || y === ry0 + rh;
      g.set(x, y, edge ? "wall" : "stonefloor");
      if (!edge) g.indoor[g.idx(x, y)] = true;
    }
    g.set(rx0 + Math.floor(rw / 2), ry0 + rh, "gate");
  };
  room(x0 + 2, y0 + 2, 4, 3);
  room(x1 - 6, y0 + 2, 4, 3);

  addProp("hearth", cx, cy + 1);
  addProp("forge", cx - 5, cy - 2);
  addProp("workbench", cx + 5, cy - 2);
  addProp("townboard", cx - 1, cy - 4);
  addProp("waystone", cx + 2, cy - 4);
  addProp("chest", x0 + 4, y0 + 3, "chest");
  addProp("barrel", x1 - 2, cy + 3, "barrel");

  // A little yard to gather in right by home.
  const yard = (kind: Prop["kind"], n: number, loot: string) => {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 30) {
      const x = randInt(rng, 3, g.w - 4), y = randInt(rng, y1 + 2, g.h - 4);
      if (walkableGround(g, x, y)) { addProp(kind, x, y, loot); placed++; }
    }
  };
  yard("tree", 5, "tree");
  yard("rock", 3, "rock");
  yard("herbs", 4, "herbs");

  return { map: { w: g.w, h: g.h, tiles: g.tiles, indoor: g.indoor }, props, playerStart: { x: cx + 2, y: y1 - 2 }, home: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// ---------------------------------------------------------------------------
// Expedition regions
// ---------------------------------------------------------------------------

export function generateRegion(rng: () => number, def: RegionDef): Layout {
  const g = makeGrid(REGION_W, REGION_H, "grass");
  for (let i = 0; i < 70; i++) {
    const bx = randInt(rng, 2, g.w - 3), by = randInt(rng, 2, g.h - 3);
    for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (rng() < 0.5) g.set(x, y, "dirt");
  }
  borderWood(g);

  const props: Prop[] = [];
  let pid = 1;
  const addProp = (kind: Prop["kind"], x: number, y: number, loot?: string) => { props.push({ id: pid++, kind, pos: { x, y }, used: false, ...(loot ? { loot } : {}) }); };

  // Entrance + waystone at the south edge; player spawns just inside.
  const ex = Math.floor(g.w / 2), ey = g.h - 5;
  for (let y = ey - 1; y < g.h - 2; y++) for (let x = ex - 2; x <= ex + 2; x++) g.set(x, y, "path");
  addProp("waystone", ex, ey);
  const entry: Vec2 = { x: ex, y: ey + 1 };
  const nearEntry = (x: number, y: number) => Math.abs(x - ex) < 6 && Math.abs(y - ey) < 6;

  // Theme terrain.
  const blob = (t: TileType, count: number, minR: number, maxR: number, density = 0.85) => {
    for (let i = 0; i < count; i++) {
      const bx = randInt(rng, 5, g.w - 6), by = randInt(rng, 5, g.h - 10);
      if (nearEntry(bx, by)) continue;
      const r = randInt(rng, minR, maxR);
      for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++)
        if ((x - bx) ** 2 + (y - by) ** 2 <= r * r && rng() < density) g.set(x, y, t);
    }
  };
  if (def.id === "woods") blob("forest", 9, 3, 5);
  else if (def.id === "mire") { blob("water", 7, 2, 5, 0.75); blob("dirt", 6, 2, 4, 0.6); }
  else if (def.id === "barrows") { blob("rubble", 6, 2, 4); for (let i = 0; i < 40; i++) { const x = randInt(rng, 4, g.w - 5), y = randInt(rng, 4, g.h - 8); if (!nearEntry(x, y) && rng() < 0.5) g.set(x, y, "grave"); } }
  else blob("rubble", 4, 2, 3); // abbey handled by ruins below

  // Ruins with the region's chests + survivors.
  const searchables: Prop["kind"][] = ["chest", "crate", "barrel"];
  const ruinCount = Math.max(3, Math.round(def.chests / 1.5));
  let chestsLeft = def.chests, survLeft = def.survivors;
  for (let i = 0; i < ruinCount; i++) {
    let bx = 0, by = 0, tries = 0;
    do { bx = randInt(rng, 6, g.w - 9); by = randInt(rng, 6, g.h - 12); tries++; } while ((nearEntry(bx, by) || g.get(bx, by) === "water") && tries < 40);
    const rw = randInt(rng, 4, 6), rh = randInt(rng, 3, 5);
    for (let y = by; y <= by + rh; y++) for (let x = bx; x <= bx + rw; x++) {
      if (g.get(x, y) === "water") continue;
      const edge = x === bx || x === bx + rw || y === by || y === by + rh;
      if (edge) { if (rng() < 0.6) g.set(x, y, "wall"); else g.set(x, y, "rubble"); }
      else g.set(x, y, rng() < 0.4 ? "rubble" : "stonefloor");
    }
    const here = Math.min(chestsLeft, randInt(rng, 1, 2));
    for (let c = 0; c < here; c++) {
      const px = randInt(rng, bx + 1, bx + rw - 1), py = randInt(rng, by + 1, by + rh - 1);
      if (g.get(px, py) === "stonefloor" || g.get(px, py) === "rubble") { const k = searchables[randInt(rng, 0, 2)]!; addProp(k, px, py, k === "chest" ? `${def.id}_chest` : k); chestsLeft--; }
    }
    if (survLeft > 0) { const sx = bx + Math.floor(rw / 2), sy = by + Math.floor(rh / 2); if (walkableGround(g, sx, sy) || g.get(sx, sy) === "stonefloor") { addProp("survivor", sx, sy); survLeft--; } }
    if (rng() < 0.6) addProp("cart", bx - 1, by + rh + 1, "cart");
  }
  // Any leftover chests/survivors scattered.
  const scatterProp = (kind: Prop["kind"], n: number, loot?: string) => {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 40) {
      const x = randInt(rng, 3, g.w - 4), y = randInt(rng, 3, g.h - 8);
      if (walkableGround(g, x, y) && !nearEntry(x, y)) { addProp(kind, x, y, loot); placed++; }
    }
  };
  if (chestsLeft > 0) scatterProp("chest", chestsLeft, `${def.id}_chest`);
  if (survLeft > 0) scatterProp("survivor", survLeft);

  // Resource nodes, biased by region.
  scatterProp("tree", def.treeCount, "tree");
  scatterProp("rock", def.rockCount, "rock");
  scatterProp("herbs", def.herbCount, "herbs");
  scatterProp("remains", 5, "remains");

  // Enemy spawns, away from the entrance.
  const enemySpawns: { kind: EnemyKind; x: number; y: number; boss?: boolean }[] = [];
  let placed = 0, tries = 0;
  while (placed < def.enemyCount && tries++ < def.enemyCount * 40) {
    const x = randInt(rng, 3, g.w - 4), y = randInt(rng, 3, g.h - 6);
    if (!walkableGround(g, x, y)) continue;
    if (Math.abs(x - ex) < 9 && Math.abs(y - ey) < 9) continue;
    const kind = def.enemyMix[randInt(rng, 0, def.enemyMix.length - 1)]!;
    enemySpawns.push({ kind, x, y });
    placed++;
  }

  // A region boss: the Barrow King, deep in the barrows, away from the entrance.
  // Grave/rubble tiles ARE walkable, so accept any standable ground; on the
  // rare bad roll, scan outward from a known-open spot so he's never walled in.
  if (def.id === "barrows") {
    const standable = (x: number, y: number): boolean => { const t = g.get(x, y); return t !== "water" && t !== "forest" && t !== "wall"; };
    let bx = ex, by = ey - 16, tries2 = 0;
    do { bx = randInt(rng, 6, g.w - 7); by = randInt(rng, 4, Math.floor(g.h / 2)); tries2++; } while (!standable(bx, by) && tries2 < 120);
    if (!standable(bx, by)) {
      search: for (let dy = 10; dy < g.h - 6; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (standable(ex + dx, ey - dy)) { bx = ex + dx; by = ey - dy; break search; }
        }
      }
    }
    enemySpawns.push({ kind: "graveking", x: bx, y: by, boss: true });
  }

  return { map: { w: g.w, h: g.h, tiles: g.tiles, indoor: g.indoor }, props, playerStart: entry, home: { x: -10, y: -10, w: 0, h: 0 }, enemySpawns };
}
