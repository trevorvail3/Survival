/**
 * src/core/world.ts
 * -----------------
 * The simulation. Given a `World` and a `Ctx` (clock + rng), it advances time:
 * survival meters bleed, the infected hunt (A* from the client), combat lands,
 * night falls and brings more of them. All behaviour funnels through here so
 * the render layer only ever *reads* the world — the read/write split proven in
 * the sibling `world` project.
 *
 * Functions push `GameEvent`s into an out-array; the loop drains them to fire
 * audio, floating text and particles. Keeping effects as data (not calls) means
 * the core never touches the DOM or the AudioContext.
 */

import type {
  Content,
  Enemy,
  EnemyKind,
  InvSlot,
  ItemId,
  Player,
  Prop,
  World,
} from "./types.ts";
import { WALKABLE } from "./types.ts";
import { randInt } from "./rng.ts";
import { findPath } from "../client/pathfinding.ts";
import { generateLayout } from "../content/map.ts";
import { rollLoot } from "../content/loot.ts";

export const PLAYER_RADIUS = 0.34;
export const INV_COLS = 6;
export const INV_ROWS = 5;
export const INV_SIZE = INV_COLS * INV_ROWS;

/** One full day/night in ms of game time. Night is roughly the back half. */
export const DAY_MS = 300_000; // 5 real minutes if unscaled
const DAY_START = 0.0; // dawn
export function isNight(timeOfDay: number): boolean {
  // Night from ~0.62 through ~0.98 of the cycle.
  return timeOfDay > 0.6 || timeOfDay < 0.04;
}
/** 0 = pitch dark, 1 = full daylight. */
export function daylight(timeOfDay: number): number {
  // Smooth cosine curve: brightest at 0.3, darkest at 0.8.
  const v = 0.5 - 0.5 * Math.cos((timeOfDay + 0.2) * Math.PI * 2);
  return Math.max(0.06, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type GameEvent =
  | { t: "melee"; x: number; y: number }
  | { t: "hit"; x: number; y: number; dmg: number; crit: boolean }
  | { t: "gunshot"; x: number; y: number }
  | { t: "dryfire" }
  | { t: "throw" }
  | { t: "explode"; x: number; y: number }
  | { t: "dodge" }
  | { t: "kill"; kind: EnemyKind; x: number; y: number }
  | { t: "aggro"; kind: EnemyKind }
  | { t: "playerHurt"; dmg: number }
  | { t: "pickup"; id: ItemId; qty: number }
  | { t: "craft"; id: ItemId }
  | { t: "heal" }
  | { t: "eat" }
  | { t: "drink" }
  | { t: "search" }
  | { t: "equip" }
  | { t: "dayBreak"; day: number }
  | { t: "nightFall"; day: number }
  | { t: "death" }
  | { t: "log"; msg: string };

// ---------------------------------------------------------------------------
// Walkability
// ---------------------------------------------------------------------------

export function makeTileWalkable(world: World): (x: number, y: number) => boolean {
  const { map } = world;
  return (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = map.tiles[y * map.w + x];
    return t ? WALKABLE[t] : false;
  };
}

/** Solid (square) collision test for a circle-ish body of half-size r. */
function blocked(world: World, x: number, y: number, r: number): boolean {
  const { map } = world;
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
      const t = map.tiles[ty * map.w + tx]!;
      if (!WALKABLE[t]) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------

export function countItem(player: Player, id: ItemId): number {
  let n = 0;
  for (const s of player.inv) if (s && s.id === id) n += s.qty;
  return n;
}

export function addItem(player: Player, content: Content, id: ItemId, qty: number): number {
  const def = content.items[id];
  if (!def) return qty;
  let left = qty;
  // Fill existing stacks first.
  for (const s of player.inv) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < def.stack) {
      const room = def.stack - s.qty;
      const add = Math.min(room, left);
      s.qty += add;
      left -= add;
    }
  }
  // Then empty slots.
  for (let i = 0; i < player.inv.length && left > 0; i++) {
    if (!player.inv[i]) {
      const add = Math.min(def.stack, left);
      player.inv[i] = { id, qty: add };
      left -= add;
    }
  }
  return left; // remainder that didn't fit
}

export function removeItem(player: Player, id: ItemId, qty: number): boolean {
  if (countItem(player, id) < qty) return false;
  let left = qty;
  for (let i = 0; i < player.inv.length && left > 0; i++) {
    const s = player.inv[i];
    if (s && s.id === id) {
      const take = Math.min(s.qty, left);
      s.qty -= take;
      left -= take;
      if (s.qty <= 0) player.inv[i] = null;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// World creation
// ---------------------------------------------------------------------------

export function createWorld(content: Content, rng: () => number): World {
  const layout = generateLayout(rng);
  const inv: (InvSlot | null)[] = new Array(INV_SIZE).fill(null);

  const player: Player = {
    pos: { x: layout.playerStart.x + 0.5, y: layout.playerStart.y + 0.5 },
    facing: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    hunger: 80,
    thirst: 70,
    sprinting: false,
    inv,
    equipped: "pipe",
    nextAttack: 0,
    invulnUntil: 0,
    rollUntil: 0,
    rollDir: { x: 1, y: 0 },
    infection: 0,
    alive: true,
  };

  // Starting kit — enough to survive the first night if you're careful.
  addItem(player, content, "pipe", 1);
  addItem(player, content, "bandage", 2);
  addItem(player, content, "cannedfood", 1);
  addItem(player, content, "water", 1);
  addItem(player, content, "scrap", 3);
  addItem(player, content, "cloth", 2);

  const world: World = {
    map: layout.map,
    player,
    enemies: [],
    ground: [],
    props: layout.props,
    timeOfDay: DAY_START + 0.28, // start mid-morning
    day: 1,
    clock: 0,
    nextId: 1,
    log: [],
  };

  // Initial scatter of the infected across the streets, away from the safehouse.
  const walk = makeTileWalkable(world);
  let placed = 0;
  let guard = 0;
  while (placed < 14 && guard++ < 500) {
    const x = randInt(rng, 2, world.map.w - 3);
    const y = randInt(rng, 2, world.map.h - 3);
    const dx = x - player.pos.x;
    const dy = y - player.pos.y;
    if (!walk(x, y)) continue;
    if (dx * dx + dy * dy < 100) continue; // keep a breathing radius at spawn
    const r = rng();
    const kind: EnemyKind = r < 0.6 ? "shambler" : r < 0.85 ? "runner" : "stalker";
    world.enemies.push(makeEnemy(world, content, kind, x + 0.5, y + 0.5));
    placed++;
  }

  return world;
}

function makeEnemy(world: World, content: Content, kind: EnemyKind, x: number, y: number): Enemy {
  const def = content.enemies[kind];
  return {
    id: world.nextId++,
    kind,
    pos: { x, y },
    hp: def.hp,
    maxHp: def.hp,
    facing: 0,
    state: "idle",
    path: [],
    nextAttack: 0,
    nextThink: 0,
    staggerUntil: 0,
    seed: Math.floor((x * 71 + y * 131) % 1000),
  };
}

// ---------------------------------------------------------------------------
// Player movement (called by the loop each frame with an input vector)
// ---------------------------------------------------------------------------

export function movePlayer(world: World, dx: number, dy: number, dtMs: number, speed: number): void {
  const p = world.player;
  if (!p.alive) return;
  const dt = dtMs / 1000;

  // Dodge roll overrides input: fixed lunge with i-frames.
  if (world.clock < p.rollUntil) {
    const rollSpeed = 9;
    const nx = p.pos.x + p.rollDir.x * rollSpeed * dt;
    const ny = p.pos.y + p.rollDir.y * rollSpeed * dt;
    if (!blocked(world, nx, p.pos.y, PLAYER_RADIUS)) p.pos.x = nx;
    if (!blocked(world, p.pos.x, ny, PLAYER_RADIUS)) p.pos.y = ny;
    return;
  }

  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const vx = (dx / len) * speed * dt;
  const vy = (dy / len) * speed * dt;
  if (!blocked(world, p.pos.x + vx, p.pos.y, PLAYER_RADIUS)) p.pos.x += vx;
  if (!blocked(world, p.pos.x, p.pos.y + vy, PLAYER_RADIUS)) p.pos.y += vy;
}

export function dodge(world: World, _ctx: { now: number }, dirx: number, diry: number, out: GameEvent[]): boolean {
  const p = world.player;
  if (!p.alive || p.stamina < 22 || world.clock < p.rollUntil) return false;
  const len = Math.hypot(dirx, diry) || 1;
  p.rollDir = { x: dirx / len, y: diry / len };
  p.rollUntil = world.clock + 300;
  p.invulnUntil = world.clock + 320;
  p.stamina -= 22;
  out.push({ t: "dodge" });
  return true;
}

// ---------------------------------------------------------------------------
// Combat — player attacking
// ---------------------------------------------------------------------------

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function playerAttack(world: World, content: Content, ctx: { rng: () => number }, out: GameEvent[]): void {
  const p = world.player;
  if (!p.alive || world.clock < p.nextAttack || world.clock < p.rollUntil) return;
  const def = p.equipped ? content.items[p.equipped] : content.items["fists"];
  const wep = def?.weapon ?? content.items["fists"]!.weapon!;
  if (p.stamina < wep.stamina * 0.5) return; // too gassed to swing

  p.nextAttack = world.clock + wep.cooldown;
  p.stamina = Math.max(0, p.stamina - wep.stamina);

  if (wep.kind === "ranged") {
    const ammoId = wep.ammo!;
    if (countItem(p, ammoId) <= 0) {
      out.push({ t: "dryfire" });
      return;
    }
    removeItem(p, ammoId, 1);
    out.push({ t: "gunshot", x: p.pos.x, y: p.pos.y });
    // Hitscan: the nearest enemy along the aim ray within range + narrow cone.
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const e of world.enemies) {
      if (e.state === "dead") continue;
      const ex = e.pos.x - p.pos.x;
      const ey = e.pos.y - p.pos.y;
      const dist = Math.hypot(ex, ey);
      if (dist > wep.reach) continue;
      if (angDiff(Math.atan2(ey, ex), p.facing) > 0.16) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    if (best) damageEnemy(world, content, ctx, best, wep.damage, true, out);
    return;
  }

  // Melee: everything in reach within the swing arc takes the hit.
  out.push({ t: "melee", x: p.pos.x, y: p.pos.y });
  const arc = wep.arc ?? 0.9;
  for (const e of world.enemies) {
    if (e.state === "dead") continue;
    const ex = e.pos.x - p.pos.x;
    const ey = e.pos.y - p.pos.y;
    const dist = Math.hypot(ex, ey);
    if (dist > wep.reach + 0.5) continue;
    if (angDiff(Math.atan2(ey, ex), p.facing) > arc) continue;
    const crit = ctx.rng() < 0.12;
    const dmg = Math.round(wep.damage * (0.85 + ctx.rng() * 0.3) * (crit ? 1.8 : 1));
    damageEnemy(world, content, ctx, e, dmg, crit, out);
    // Knockback + stagger.
    const kl = dist || 1;
    e.pos.x += (ex / kl) * 0.3;
    e.pos.y += (ey / kl) * 0.3;
    e.staggerUntil = world.clock + 260;
    e.state = "stagger";
  }
}

function damageEnemy(
  world: World,
  _content: Content,
  ctx: { rng: () => number },
  e: Enemy,
  dmg: number,
  crit: boolean,
  out: GameEvent[],
): void {
  e.hp -= dmg;
  out.push({ t: "hit", x: e.pos.x, y: e.pos.y, dmg, crit });
  if (e.hp <= 0) {
    e.state = "dead";
    out.push({ t: "kill", kind: e.kind, x: e.pos.x, y: e.pos.y });
    // Drop loot on the ground where it fell.
    const table = e.kind === "brute" ? "kill_brute" : "kill_common";
    for (const d of rollLoot(ctx.rng, table)) spawnGround(world, d.id, d.qty, e.pos.x, e.pos.y);
  } else {
    // Wake it up if it wasn't already hunting.
    if (e.state === "idle" || e.state === "wander") {
      e.state = "hunt";
      out.push({ t: "aggro", kind: e.kind });
    }
  }
}

function spawnGround(world: World, id: ItemId, qty: number, x: number, y: number): void {
  const jx = x + (world.nextId % 5) * 0.06 - 0.15;
  const jy = y + (world.nextId % 3) * 0.06 - 0.1;
  world.ground.push({ id: world.nextId++, item: { id, qty }, pos: { x: jx, y: jy } });
}

// ---------------------------------------------------------------------------
// Throwables
// ---------------------------------------------------------------------------

export function throwEquippedThrowable(
  world: World,
  content: Content,
  ctx: { rng: () => number },
  slotIndex: number,
  tx: number,
  ty: number,
  out: GameEvent[],
): void {
  const p = world.player;
  const slot = p.inv[slotIndex];
  if (!slot) return;
  const def = content.items[slot.id];
  if (!def || def.use !== "throw") return;
  removeItem(p, slot.id, 1);
  out.push({ t: "throw" });
  out.push({ t: "explode", x: tx, y: ty });
  const radius = def.throwRadius ?? 2;
  const dmg = def.throwDamage ?? 40;
  for (const e of world.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.pos.x - tx, e.pos.y - ty);
    if (d <= radius) {
      const scaled = Math.round(dmg * (1 - d / (radius + 0.5)));
      damageEnemy(world, content, ctx, e, Math.max(6, scaled), false, out);
    }
  }
}

// ---------------------------------------------------------------------------
// Using items
// ---------------------------------------------------------------------------

export function useSlot(world: World, content: Content, slotIndex: number, out: GameEvent[]): void {
  const p = world.player;
  const slot = p.inv[slotIndex];
  if (!slot) return;
  const def = content.items[slot.id];
  if (!def) return;
  switch (def.use) {
    case "heal":
      p.hp = Math.min(p.maxHp, p.hp + (def.heal ?? 0));
      if (def.id === "antibiotic") p.infection = Math.max(0, p.infection - 45);
      removeItem(p, slot.id, 1);
      out.push({ t: "heal" });
      break;
    case "food":
      p.hunger = Math.min(100, p.hunger + (def.food ?? 0));
      removeItem(p, slot.id, 1);
      out.push({ t: "eat" });
      break;
    case "drink":
      p.thirst = Math.min(100, p.thirst + (def.drink ?? 0));
      removeItem(p, slot.id, 1);
      out.push({ t: "drink" });
      break;
    case "equip":
      if (def.weapon) {
        p.equipped = def.id;
        out.push({ t: "equip" });
      }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Interaction — search props, open doors, rest at campfire
// ---------------------------------------------------------------------------

export function nearestProp(world: World, maxDist: number): Prop | null {
  const p = world.player;
  let best: Prop | null = null;
  let bd = maxDist * maxDist;
  for (const pr of world.props) {
    if (pr.kind === "door") continue; // doors are ambient, not "search" targets
    const dx = pr.pos.x + 0.5 - p.pos.x;
    const dy = pr.pos.y + 0.5 - p.pos.y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = pr;
    }
  }
  return best;
}

export interface InteractResult {
  kind: "search" | "rest" | "bench" | "none";
  prop?: Prop;
}

export function interact(world: World, content: Content, ctx: { rng: () => number }, out: GameEvent[]): InteractResult {
  const pr = nearestProp(world, 1.4);
  if (!pr) return { kind: "none" };
  if (pr.kind === "campfire") return { kind: "rest", prop: pr };
  if (pr.kind === "workbench") return { kind: "bench", prop: pr };
  if (pr.used) {
    out.push({ t: "log", msg: "Already searched." });
    return { kind: "none" };
  }
  pr.used = true;
  out.push({ t: "search" });
  const table = pr.loot ?? pr.kind;
  const drops = rollLoot(ctx.rng, table);
  if (drops.length === 0) {
    out.push({ t: "log", msg: "Nothing but dust." });
  } else {
    for (const d of drops) {
      const left = addItem(world.player, content, d.id, d.qty);
      const got = d.qty - left;
      if (got > 0) out.push({ t: "pickup", id: d.id, qty: got });
      if (left > 0) spawnGround(world, d.id, left, pr.pos.x + 0.5, pr.pos.y + 0.5);
    }
  }
  return { kind: "search", prop: pr };
}

/** Rest at the campfire: passes time to the next dawn, restores, but the night
 *  still comes for you — resting into the dark is a gamble. */
export function restAtFire(world: World, out: GameEvent[]): void {
  const p = world.player;
  p.hp = p.maxHp;
  p.stamina = p.maxStamina;
  p.hunger = Math.max(0, p.hunger - 10);
  p.thirst = Math.max(0, p.thirst - 12);
  // Jump to dawn of the next day.
  world.timeOfDay = 0.28;
  out.push({ t: "log", msg: "You rest. The fire keeps the dark back — for now." });
}

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

export function canCraft(world: World, content: Content, recipeId: string, atBench: boolean): boolean {
  const r = content.recipes.find((x) => x.id === recipeId);
  if (!r) return false;
  if (r.bench && !atBench) return false;
  return r.inputs.every((i) => countItem(world.player, i.id) >= i.qty);
}

export function craft(world: World, content: Content, recipeId: string, atBench: boolean, out: GameEvent[]): boolean {
  const r = content.recipes.find((x) => x.id === recipeId);
  if (!r || !canCraft(world, content, recipeId, atBench)) return false;
  for (const i of r.inputs) removeItem(world.player, i.id, i.qty);
  addItem(world.player, content, r.out, r.outQty);
  out.push({ t: "craft", id: r.out });
  return true;
}

// ---------------------------------------------------------------------------
// The tick — survival, enemy AI, spawns, day/night
// ---------------------------------------------------------------------------

export function tick(world: World, content: Content, ctx: { now: number; rng: () => number }, dtMs: number, out: GameEvent[]): void {
  const p = world.player;
  world.clock += dtMs;
  const dt = dtMs / 1000;

  // --- Day/night ---
  const prevNight = isNight(world.timeOfDay);
  world.timeOfDay = (world.timeOfDay + dtMs / DAY_MS) % 1;
  const nowNight = isNight(world.timeOfDay);
  if (nowNight && !prevNight) out.push({ t: "nightFall", day: world.day });
  if (!nowNight && prevNight) {
    world.day++;
    out.push({ t: "dayBreak", day: world.day });
  }

  if (!p.alive) {
    cleanupDead(world);
    return;
  }

  // --- Survival meters ---
  p.hunger = Math.max(0, p.hunger - 0.35 * dt);
  p.thirst = Math.max(0, p.thirst - 0.5 * dt);
  // Stamina regenerates when not sprinting; slower if starving.
  if (!p.sprinting) {
    const regen = (p.hunger > 15 ? 20 : 8) * dt;
    p.stamina = Math.min(p.maxStamina, p.stamina + regen);
  }
  // Starvation / dehydration / infection bleed HP.
  let bleed = 0;
  if (p.hunger <= 0) bleed += 2.5;
  if (p.thirst <= 0) bleed += 3.5;
  p.infection = Math.min(100, p.infection);
  if (p.infection >= 100) bleed += 4;
  else if (p.infection > 0) p.infection = Math.max(0, p.infection - 0.15 * dt); // slowly fought off
  if (bleed > 0) p.hp -= bleed * dt;

  if (p.hp <= 0 && p.alive) {
    p.hp = 0;
    p.alive = false;
    out.push({ t: "death" });
    return;
  }

  // --- Night spawning: the dark fills the streets. ---
  if (nowNight) {
    const cap = 18 + world.day * 4;
    const alive = world.enemies.filter((e) => e.state !== "dead").length;
    if (alive < cap && ctx.rng() < 0.9 * dt * (1 + world.day * 0.15)) {
      spawnNearPlayer(world, content, ctx, out);
    }
  }

  // --- Enemy AI ---
  const walk = makeTileWalkable(world);
  for (const e of world.enemies) {
    if (e.state === "dead") continue;
    const def = content.enemies[e.kind];
    const dx = p.pos.x - e.pos.x;
    const dy = p.pos.y - e.pos.y;
    const dist = Math.hypot(dx, dy);

    // Sensing: stalkers are near-blind but a sprinting player is loud.
    let sense = def.sense;
    if (e.kind === "stalker" && p.sprinting) sense *= 2.6;
    const canSee = dist <= sense;

    if (world.clock < e.staggerUntil) {
      e.state = "stagger";
      continue;
    }

    if (canSee && (e.state === "idle" || e.state === "wander")) {
      e.state = "hunt";
      out.push({ t: "aggro", kind: e.kind });
    }

    if (e.state === "hunt" || e.state === "stagger") {
      e.facing = Math.atan2(dy, dx);
      // Attack when in reach.
      if (dist <= def.reach + PLAYER_RADIUS) {
        if (world.clock >= e.nextAttack) {
          e.nextAttack = world.clock + def.attackCd;
          e.state = "attack";
          attackPlayer(world, content, e, def.damage, out);
        }
      } else {
        // Repath occasionally toward the player; step along the route.
        if (e.path.length === 0 || e.nextThink <= world.clock) {
          e.nextThink = world.clock + 400 + Math.floor(ctx.rng() * 300);
          if (dist < 22) {
            e.path = findPath(walk, e.pos, p.pos, 900);
          } else {
            e.path = [];
          }
        }
        stepAlongPath(world, e, def.speed, dt, dx, dy, dist);
      }
      // Lost the player entirely? Drift back to wandering.
      if (dist > sense * 2.4 && e.kind !== "shambler") {
        e.state = "wander";
        e.path = [];
      }
    } else if (e.state === "idle") {
      if (ctx.rng() < 0.4 * dt) e.state = "wander";
    } else if (e.state === "wander") {
      // Aimless shuffle; no pathing.
      const wx = Math.cos(e.seed + world.clock / 2000);
      const wy = Math.sin(e.seed + world.clock / 2000);
      tryMoveEnemy(world, e, wx, wy, def.speed * 0.35, dt);
      if (ctx.rng() < 0.25 * dt) e.state = "idle";
    }
    // Post-attack recovery back to hunt.
    if (e.state === "attack" && world.clock >= e.nextAttack - def.attackCd * 0.6) e.state = "hunt";

    separate(world, e);
  }

  // --- Ground item pickup (auto, when walked over) ---
  for (const g of world.ground) {
    const d = Math.hypot(g.pos.x - p.pos.x, g.pos.y - p.pos.y);
    if (d < 0.55) {
      const left = addItem(p, content, g.item.id, g.item.qty);
      const got = g.item.qty - left;
      if (got > 0) out.push({ t: "pickup", id: g.item.id, qty: got });
      g.item.qty = left;
    }
  }
  world.ground = world.ground.filter((g) => g.item.qty > 0);

  cleanupDead(world);
}

function stepAlongPath(world: World, e: Enemy, speed: number, dt: number, dx: number, dy: number, dist: number): void {
  if (e.path.length > 0) {
    const node = e.path[0]!;
    const nx = node.x + 0.5 - e.pos.x;
    const ny = node.y + 0.5 - e.pos.y;
    const nd = Math.hypot(nx, ny);
    if (nd < 0.25) {
      e.path.shift();
      return;
    }
    tryMoveEnemy(world, e, nx, ny, speed, dt);
  } else {
    // No route (very close / open ground): beeline.
    tryMoveEnemy(world, e, dx, dy, speed, dt);
  }
  void dist;
}

function tryMoveEnemy(world: World, e: Enemy, dx: number, dy: number, speed: number, dt: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const vx = (dx / len) * speed * dt;
  const vy = (dy / len) * speed * dt;
  if (!blocked(world, e.pos.x + vx, e.pos.y, 0.3)) e.pos.x += vx;
  if (!blocked(world, e.pos.x, e.pos.y + vy, 0.3)) e.pos.y += vy;
}

/** Light separation so a pack doesn't collapse into one point. */
function separate(world: World, e: Enemy): void {
  for (const o of world.enemies) {
    if (o === e || o.state === "dead") continue;
    const dx = e.pos.x - o.pos.x;
    const dy = e.pos.y - o.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.0001 && d2 < 0.36) {
      const d = Math.sqrt(d2);
      const push = (0.6 - d) * 0.5;
      const px = (dx / d) * push;
      const py = (dy / d) * push;
      if (!blocked(world, e.pos.x + px, e.pos.y, 0.3)) e.pos.x += px;
      if (!blocked(world, e.pos.x, e.pos.y + py, 0.3)) e.pos.y += py;
    }
  }
}

function attackPlayer(world: World, content: Content, e: Enemy, damage: number, out: GameEvent[]): void {
  const p = world.player;
  if (world.clock < p.invulnUntil) return; // dodged
  const dmg = Math.round(damage * 0.9 + damage * 0.2 * Math.random());
  p.hp -= dmg;
  out.push({ t: "playerHurt", dmg });
  // The infected raise your infection when they land a hit.
  p.infection = Math.min(100, p.infection + (e.kind === "brute" ? 10 : e.kind === "stalker" ? 12 : 6));
  void content;
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    out.push({ t: "death" });
  }
}

function spawnNearPlayer(world: World, content: Content, ctx: { rng: () => number }, out: GameEvent[]): void {
  const p = world.player;
  const walk = makeTileWalkable(world);
  for (let tries = 0; tries < 20; tries++) {
    const ang = ctx.rng() * Math.PI * 2;
    const rad = 12 + ctx.rng() * 8;
    const x = Math.round(p.pos.x + Math.cos(ang) * rad);
    const y = Math.round(p.pos.y + Math.sin(ang) * rad);
    if (!walk(x, y)) continue;
    const r = ctx.rng();
    const kind: EnemyKind =
      world.day >= 3 && r < 0.1 ? "brute" : r < 0.5 ? "shambler" : r < 0.8 ? "runner" : "stalker";
    const e = makeEnemy(world, content, kind, x + 0.5, y + 0.5);
    e.state = "hunt";
    world.enemies.push(e);
    void out;
    return;
  }
}

function cleanupDead(world: World): void {
  // Keep corpses briefly for the death pop, then drop them.
  if (world.enemies.length > 120) {
    world.enemies = world.enemies.filter((e) => e.state !== "dead");
  }
}
