/**
 * src/content/map.ts
 * ------------------
 * Procedural generation of a dead city district — "The Grid". No hand-authored
 * levels: a road lattice is carved, blocks are filled with ruined buildings,
 * and a fortified safehouse is dropped at the centre. Everything is seeded, so
 * a given run reproduces exactly (the deterministic discipline from `world`).
 */

import type { GameMap, Prop, TileType, Vec2 } from "../core/types.ts";
import { randInt } from "../core/rng.ts";

export const MAP_W = 68;
export const MAP_H = 68;

export interface Layout {
  map: GameMap;
  props: Prop[];
  playerStart: Vec2;
  safehouse: { x: number; y: number; w: number; h: number };
}

export function generateLayout(rng: () => number): Layout {
  const w = MAP_W;
  const h = MAP_H;
  const tiles: TileType[] = new Array(w * h).fill("asphalt");
  const indoor: boolean[] = new Array(w * h).fill(false);
  const idx = (x: number, y: number) => y * w + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const set = (x: number, y: number, t: TileType) => {
    if (inb(x, y)) tiles[idx(x, y)] = t;
  };
  const get = (x: number, y: number): TileType => (inb(x, y) ? tiles[idx(x, y)]! : "wall");

  // 1. Base: cracked asphalt everywhere, with patches of dead grass/dirt.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = rng();
      set(x, y, r < 0.12 ? "grass" : r < 0.16 ? "dirt" : "asphalt");
    }
  }

  // 2. Road lattice: wide avenues every BLOCK tiles stay as asphalt; the
  //    interior of each block becomes a "lot" we may build on.
  const BLOCK = 16;
  const ROAD = 4; // road width
  const blocks: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let by = ROAD; by < h - ROAD; by += BLOCK) {
    for (let bx = ROAD; bx < w - ROAD; bx += BLOCK) {
      const x0 = bx + 1;
      const y0 = by + 1;
      const x1 = Math.min(bx + BLOCK - ROAD, w - ROAD - 1);
      const y1 = Math.min(by + BLOCK - ROAD, h - ROAD - 1);
      if (x1 - x0 >= 4 && y1 - y0 >= 4) blocks.push({ x0, y0, x1, y1 });
    }
  }

  // 3. Border wall ring so you can't wander off the world.
  for (let x = 0; x < w; x++) {
    set(x, 0, "wall");
    set(x, h - 1, "wall");
  }
  for (let y = 0; y < h; y++) {
    set(0, y, "wall");
    set(w - 1, y, "wall");
  }

  const props: Prop[] = [];
  let propId = 1;
  const addProp = (kind: Prop["kind"], x: number, y: number, loot?: string) => {
    props.push({ id: propId++, kind, pos: { x, y }, used: false, ...(loot ? { loot } : {}) });
  };

  // Pick the centre-most block as the safehouse.
  const cx = w / 2;
  const cy = h / 2;
  let safeIdx = 0;
  let safeDist = Infinity;
  blocks.forEach((b, i) => {
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    const d = (mx - cx) ** 2 + (my - cy) ** 2;
    if (d < safeDist) {
      safeDist = d;
      safeIdx = i;
    }
  });

  const carveBuilding = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    interior: TileType,
    safe: boolean,
  ) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        set(x, y, edge ? "wall" : interior);
        if (!edge) indoor[idx(x, y)] = true;
      }
    }
    // Doors: punch 1-2 gaps on random edges.
    const doors = safe ? 1 : 1 + (rng() < 0.4 ? 1 : 0);
    for (let d = 0; d < doors; d++) {
      const side = randInt(rng, 0, 3);
      let dx: number, dy: number;
      if (side === 0) {
        dx = randInt(rng, x0 + 1, x1 - 1);
        dy = y0;
      } else if (side === 1) {
        dx = randInt(rng, x0 + 1, x1 - 1);
        dy = y1;
      } else if (side === 2) {
        dx = x0;
        dy = randInt(rng, y0 + 1, y1 - 1);
      } else {
        dx = x1;
        dy = randInt(rng, y0 + 1, y1 - 1);
      }
      set(dx, dy, "door");
      addProp("door", dx, dy);
      indoor[idx(dx, dy)] = true;
    }
  };

  let safehouse = { x: 0, y: 0, w: 0, h: 0 };

  blocks.forEach((b, i) => {
    const safe = i === safeIdx;
    if (safe) {
      // Fortified safehouse: solid floor, workbench + campfire inside.
      carveBuilding(b.x0, b.y0, b.x1, b.y1, "floor", true);
      safehouse = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
      const mx = Math.round((b.x0 + b.x1) / 2);
      const my = Math.round((b.y0 + b.y1) / 2);
      addProp("campfire", mx, my);
      addProp("workbench", mx - 2, my);
      // A stash of starter supplies inside.
      addProp("locker", b.x0 + 1, b.y0 + 1, "locker");
      addProp("crate", b.x1 - 1, b.y1 - 1, "crate");
      return;
    }

    const kind = rng();
    if (kind < 0.62) {
      // A building — sometimes leave a chunk collapsed into rubble.
      carveBuilding(b.x0, b.y0, b.x1, b.y1, "floor", false);
      const searchables = randInt(rng, 1, 3);
      for (let s = 0; s < searchables; s++) {
        const px = randInt(rng, b.x0 + 1, b.x1 - 1);
        const py = randInt(rng, b.y0 + 1, b.y1 - 1);
        if (get(px, py) === "floor") {
          const t = rng();
          addProp(t < 0.45 ? "crate" : t < 0.75 ? "locker" : "corpse", px, py, t < 0.45 ? "crate" : t < 0.75 ? "locker" : "corpse");
        }
      }
      // Collapse a corner into rubble sometimes.
      if (rng() < 0.4) {
        const rw = randInt(rng, 2, 4);
        for (let y = b.y0; y <= b.y0 + rw && y <= b.y1; y++)
          for (let x = b.x0; x <= b.x0 + rw && x <= b.x1; x++)
            if (rng() < 0.6) set(x, y, "rubble");
      }
    } else if (kind < 0.78) {
      // An open lot: rubble + a parked wreck + a barrel.
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++) if (rng() < 0.35) set(x, y, "rubble");
      addProp("car", Math.round((b.x0 + b.x1) / 2), Math.round((b.y0 + b.y1) / 2), "car");
      if (rng() < 0.6) addProp("barrel", b.x0 + 1, b.y1 - 1, "barrel");
    } else if (kind < 0.9) {
      // A dead-grass yard with scattered debris.
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++) if (rng() < 0.7) set(x, y, "grass");
      if (rng() < 0.5) addProp("corpse", Math.round((b.x0 + b.x1) / 2), Math.round((b.y0 + b.y1) / 2), "corpse");
    } else {
      // A stagnant flooded lot.
      for (let y = b.y0 + 1; y < b.y1; y++)
        for (let x = b.x0 + 1; x < b.x1; x++) if (rng() < 0.8) set(x, y, "water");
    }
  });

  // 4. Scatter wrecked cars + barrels along the avenues for cover.
  const streetProps = 26;
  for (let n = 0; n < streetProps; n++) {
    const x = randInt(rng, 2, w - 3);
    const y = randInt(rng, 2, h - 3);
    if (get(x, y) === "asphalt") {
      const t = rng();
      if (t < 0.5) addProp("car", x, y, "car");
      else if (t < 0.75) addProp("barrel", x, y, "barrel");
      else addProp("corpse", x, y, "corpse");
    }
  }

  const map: GameMap = { w, h, tiles, indoor };
  const playerStart: Vec2 = {
    x: safehouse.x + safehouse.w / 2 + 2,
    y: safehouse.y + safehouse.h / 2,
  };
  return { map, props, playerStart, safehouse };
}
