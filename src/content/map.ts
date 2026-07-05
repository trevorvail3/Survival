/**
 * src/content/map.ts
 * ------------------
 * Procedural generation of a blighted medieval region — "The Vale". A walled
 * home settlement sits near the centre; around it lie dead fields, bramble
 * woods, a river, ruined cottages, a plague-pit graveyard, and the resource
 * nodes (trees, ore, herbs) you range out to harvest. All seeded, so a run
 * reproduces exactly.
 */

import type { GameMap, Prop, TileType, Vec2 } from "../core/types.ts";
import { randInt } from "../core/rng.ts";

export const MAP_W = 76;
export const MAP_H = 76;

export interface Layout {
  map: GameMap;
  props: Prop[];
  playerStart: Vec2;
  home: { x: number; y: number; w: number; h: number };
}

export function generateLayout(rng: () => number): Layout {
  const w = MAP_W;
  const h = MAP_H;
  const tiles: TileType[] = new Array(w * h).fill("grass");
  const indoor: boolean[] = new Array(w * h).fill(false);
  const idx = (x: number, y: number) => y * w + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const set = (x: number, y: number, t: TileType) => { if (inb(x, y)) tiles[idx(x, y)] = t; };
  const get = (x: number, y: number): TileType => (inb(x, y) ? tiles[idx(x, y)]! : "wall");

  const props: Prop[] = [];
  let pid = 1;
  const addProp = (kind: Prop["kind"], x: number, y: number, loot?: string) => {
    props.push({ id: pid++, kind, pos: { x, y }, used: false, ...(loot ? { loot } : {}) });
  };
  const walkableGround = (x: number, y: number): boolean => {
    const t = get(x, y);
    return t === "grass" || t === "dirt" || t === "path";
  };
  const openForFeature = (x: number, y: number, cx: number, cy: number, homeR: number): boolean => {
    if (!inb(x, y)) return false;
    return Math.abs(x - cx) > homeR || Math.abs(y - cy) > homeR;
  };

  // 1. Scatter dirt patches + bramble woods (impassable) + a meandering river.
  for (let i = 0; i < 60; i++) {
    const bx = randInt(rng, 2, w - 3);
    const by = randInt(rng, 2, h - 3);
    for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (rng() < 0.5) set(x, y, "dirt");
  }

  // Border of dense wood so the region is enclosed.
  for (let x = 0; x < w; x++) { set(x, 0, "forest"); set(x, 1, "forest"); set(x, h - 1, "forest"); set(x, h - 2, "forest"); }
  for (let y = 0; y < h; y++) { set(0, y, "forest"); set(1, y, "forest"); set(w - 1, y, "forest"); set(w - 2, y, "forest"); }

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const homeHalf = 11;

  // Bramble-wood blobs (scenery mass) away from the settlement.
  const forestBlobs = 7;
  for (let i = 0; i < forestBlobs; i++) {
    let bx = 0, by = 0, tries = 0;
    do { bx = randInt(rng, 5, w - 6); by = randInt(rng, 5, h - 6); tries++; } while (!openForFeature(bx, by, cx, cy, homeHalf + 4) && tries < 30);
    const r = randInt(rng, 3, 5);
    for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) {
      if ((x - bx) ** 2 + (y - by) ** 2 <= r * r && rng() < 0.85) set(x, y, "forest");
    }
    // Trees to fell on the grassy fringe.
    for (let t = 0; t < 5; t++) {
      const tx = bx + randInt(rng, -r - 2, r + 2);
      const ty = by + randInt(rng, -r - 2, r + 2);
      if (walkableGround(tx, ty) && openForFeature(tx, ty, cx, cy, homeHalf + 1)) addProp("tree", tx, ty, "tree");
    }
  }

  // A river snaking top-to-bottom, with a couple of fordable dirt banks.
  let rx = randInt(rng, 8, w - 8);
  for (let y = 2; y < h - 2; y++) {
    rx += randInt(rng, -1, 1);
    rx = Math.max(4, Math.min(w - 5, rx));
    // Don't drown the settlement.
    if (Math.abs(y - cy) <= homeHalf && Math.abs(rx - cx) <= homeHalf) continue;
    for (let dx = 0; dx < 3; dx++) set(rx + dx, y, "water");
  }

  // 2. The home settlement — a walled compound.
  const x0 = cx - 9, y0 = cy - 7, x1 = cx + 9, y1 = cy + 7;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || y === y0 || y === y1;
    if (edge) set(x, y, "wall");
    else set(x, y, "cobble");
  }
  // Gate at the south wall.
  set(cx, y1, "gate"); set(cx + 1, y1, "gate");
  addProp("gate", cx, y1);
  // A trodden road out from the gate.
  for (let y = y1 + 1; y < h - 3; y++) { set(cx, y, "path"); set(cx + 1, y, "path"); }
  // Two small cottages inside (stone-floored rooms).
  const room = (rx0: number, ry0: number, rw: number, rh: number) => {
    for (let y = ry0; y <= ry0 + rh; y++) for (let x = rx0; x <= rx0 + rw; x++) {
      const edge = x === rx0 || x === rx0 + rw || y === ry0 || y === ry0 + rh;
      set(x, y, edge ? "wall" : "stonefloor");
      if (!edge) indoor[idx(x, y)] = true;
    }
    set(rx0 + Math.floor(rw / 2), ry0 + rh, "gate");
  };
  room(x0 + 2, y0 + 2, 4, 3);
  room(x1 - 6, y0 + 2, 4, 3);

  // Settlement props: hearth, forge, workshop, town board, a starter chest.
  addProp("hearth", cx, cy + 1);
  addProp("forge", cx - 5, cy - 2);
  addProp("workbench", cx + 5, cy - 2);
  addProp("townboard", cx, cy - 4);
  addProp("chest", x0 + 4, y0 + 3, "chest");
  addProp("barrel", x1 - 2, cy + 3, "barrel");

  const playerStart: Vec2 = { x: cx, y: y1 - 2 };
  const home = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  // 3. Ruined cottages out in the wilds — chests, a cart, sometimes a survivor.
  const ruinSites = 5;
  for (let i = 0; i < ruinSites; i++) {
    let bx = 0, by = 0, tries = 0;
    do { bx = randInt(rng, 6, w - 8); by = randInt(rng, 6, h - 8); tries++; } while ((!openForFeature(bx, by, cx, cy, homeHalf + 4) || get(bx, by) === "water" || get(bx, by) === "forest") && tries < 40);
    const rw = randInt(rng, 4, 6), rh = randInt(rng, 3, 5);
    for (let y = by; y <= by + rh; y++) for (let x = bx; x <= bx + rw; x++) {
      const edge = x === bx || x === bx + rw || y === by || y === by + rh;
      if (get(x, y) === "water" || get(x, y) === "forest") continue;
      if (edge) { if (rng() < 0.6) set(x, y, "wall"); else set(x, y, "rubble"); }
      else set(x, y, rng() < 0.4 ? "rubble" : "stonefloor");
    }
    const chests = randInt(rng, 1, 2);
    for (let c = 0; c < chests; c++) {
      const px = randInt(rng, bx + 1, bx + rw - 1), py = randInt(rng, by + 1, by + rh - 1);
      if (get(px, py) === "stonefloor" || get(px, py) === "rubble") addProp(rng() < 0.5 ? "chest" : "crate", px, py, rng() < 0.5 ? "chest" : "crate");
    }
    if (i < 3) {
      // A trapped survivor to rescue.
      const sx = bx + Math.floor(rw / 2), sy = by + Math.floor(rh / 2);
      if (walkableGround(sx, sy) || get(sx, sy) === "stonefloor") addProp("survivor", sx, sy);
    }
    if (rng() < 0.6) addProp("cart", bx - 1, by + rh + 1, "cart");
  }

  // 4. The plague pit — a graveyard of grave tiles and pickable remains.
  let gx = 0, gy = 0, gtries = 0;
  do { gx = randInt(rng, 8, w - 12); gy = randInt(rng, 8, h - 12); gtries++; } while (!openForFeature(gx, gy, cx, cy, homeHalf + 5) && gtries < 40);
  for (let y = gy; y < gy + 8; y++) for (let x = gx; x < gx + 10; x++) {
    if (get(x, y) === "water" || get(x, y) === "forest") continue;
    if (rng() < 0.7) set(x, y, "grave");
    if (rng() < 0.12) addProp("remains", x, y, "remains");
  }

  // 5. Resource nodes + scavenge across the wilds.
  const scatter = (kind: Prop["kind"], n: number, loot: string) => {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 30) {
      const x = randInt(rng, 3, w - 4), y = randInt(rng, 3, h - 4);
      if (!walkableGround(x, y)) continue;
      if (!openForFeature(x, y, cx, cy, homeHalf + 1)) continue;
      addProp(kind, x, y, loot);
      placed++;
    }
  };
  scatter("rock", 14, "rock");
  scatter("herbs", 18, "herbs");
  scatter("tree", 10, "tree");
  scatter("crate", 6, "crate");
  scatter("barrel", 4, "barrel");
  scatter("remains", 6, "remains");

  const map: GameMap = { w, h, tiles, indoor };
  return { map, props, playerStart, home };
}
