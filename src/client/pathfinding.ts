/**
 * src/client/pathfinding.ts
 * -------------------------
 * A* pathfinding, lifted from the sibling `world` project. Here it drives the
 * INFECTED: each hunting enemy asks for a route to the player's tile and walks
 * it, so they flow around walls and through doorways instead of grinding into
 * corners. 8-directional, refuses to cut diagonally through wall corners.
 */

import type { Vec2 } from "../core/types.ts";

type Walkable = (x: number, y: number) => boolean;

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

const STRAIGHT = 1;
const DIAGONAL = Math.SQRT2;

const NEIGHBOURS: { dx: number; dy: number; need: Vec2[] }[] = [
  { dx: 1, dy: 0, need: [] },
  { dx: -1, dy: 0, need: [] },
  { dx: 0, dy: 1, need: [] },
  { dx: 0, dy: -1, need: [] },
  { dx: 1, dy: 1, need: [{ x: 1, y: 0 }, { x: 0, y: 1 }] },
  { dx: 1, dy: -1, need: [{ x: 1, y: 0 }, { x: 0, y: -1 }] },
  { dx: -1, dy: 1, need: [{ x: -1, y: 0 }, { x: 0, y: 1 }] },
  { dx: -1, dy: -1, need: [{ x: -1, y: 0 }, { x: 0, y: -1 }] },
];

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return STRAIGHT * (dx + dy) + (DIAGONAL - 2 * STRAIGHT) * Math.min(dx, dy);
}

/**
 * Find a path from `start` to `goal`. Returns the tiles to step onto, in order,
 * NOT including the start tile. Returns [] if unreachable. `maxNodes` caps the
 * search so a far-off or walled-in goal can't stall the frame.
 */
export function findPath(
  walkable: Walkable,
  start: Vec2,
  goal: Vec2,
  maxNodes = 1500,
): Vec2[] {
  const sx = Math.round(start.x);
  const sy = Math.round(start.y);
  const gx = Math.round(goal.x);
  const gy = Math.round(goal.y);

  if (!walkable(gx, gy)) return [];
  if (sx === gx && sy === gy) return [];

  const open: Node[] = [];
  const startNode: Node = { x: sx, y: sy, g: 0, f: octile(sx, sy, gx, gy), parent: null };
  open.push(startNode);

  const key = (x: number, y: number) => `${x},${y}`;
  const openMap = new Map<string, Node>([[key(sx, sy), startNode]]);
  const closed = new Set<string>();
  let expanded = 0;

  while (open.length > 0) {
    if (++expanded > maxNodes) return [];
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIndex]!.f) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0]!;
    openMap.delete(key(current.x, current.y));

    if (current.x === gx && current.y === gy) return reconstruct(current);
    closed.add(key(current.x, current.y));

    for (const n of NEIGHBOURS) {
      const nx = current.x + n.dx;
      const ny = current.y + n.dy;
      if (closed.has(key(nx, ny))) continue;
      if (!walkable(nx, ny)) continue;
      if (n.need.some((o) => !walkable(current.x + o.x, current.y + o.y))) continue;

      const stepCost = n.dx !== 0 && n.dy !== 0 ? DIAGONAL : STRAIGHT;
      const g = current.g + stepCost;
      const existing = openMap.get(key(nx, ny));
      if (existing && g >= existing.g) continue;

      const node: Node = { x: nx, y: ny, g, f: g + octile(nx, ny, gx, gy), parent: current };
      if (existing) {
        existing.g = node.g;
        existing.f = node.f;
        existing.parent = current;
      } else {
        open.push(node);
        openMap.set(key(nx, ny), node);
      }
    }
  }
  return [];
}

function reconstruct(node: Node): Vec2[] {
  const path: Vec2[] = [];
  let cur: Node | null = node;
  while (cur && cur.parent) {
    path.push({ x: cur.x, y: cur.y });
    cur = cur.parent;
  }
  path.reverse();
  return path;
}
