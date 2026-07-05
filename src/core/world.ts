/**
 * src/core/world.ts
 * -----------------
 * The simulation. Movement is point-and-click (like the sibling `world`
 * project): the player is given an ORDER — move here, search that, kill that —
 * and walks an A* path to carry it out, fighting on weapon-speed ticks once in
 * reach. The core also runs survival meters, the risen's AI, day/night, night
 * raids, and the settlement (building, upgrades, rescued members' tribute).
 *
 * Effects are emitted as `GameEvent` data the client drains for audio + FX; the
 * core never touches the DOM. Randomness + time arrive via `ctx`.
 */

import type {
  Content,
  Enemy,
  EnemyKind,
  InvSlot,
  ItemDef,
  ItemId,
  Player,
  Prop,
  Recipe,
  SettlerRole,
  StructureId,
  Vec2,
  World,
} from "./types.ts";
import { WALKABLE } from "./types.ts";
import { findPath, pathToAdjacent } from "../client/pathfinding.ts";
import { generateHome, generateRegion } from "../content/map.ts";
import { regionById } from "../content/regions.ts";
import { rollLoot } from "../content/loot.ts";
import { settlementCapacity, SETTLER_NAMES } from "../content/settlement.ts";
import { pick } from "./rng.ts";
import { computeMods, nodeUnlocked, SKILLS, xpForNext } from "../content/skills.ts";
import type { Mods } from "../content/skills.ts";
import { levelForXp, SKILL_META } from "../content/trainskills.ts";
import type { SkillId } from "../content/trainskills.ts";

export const PLAYER_RADIUS = 0.34;
export const INV_COLS = 6;
export const INV_ROWS = 5;
export const INV_SIZE = INV_COLS * INV_ROWS;
export const STASH_SIZE = 48;
export const WALK_SPEED = 3.4; // tiles/sec
const RESOURCE_RESPAWN_MS = 45_000;

export const DAY_MS = 300_000;
export function isNight(timeOfDay: number): boolean {
  return timeOfDay > 0.6 || timeOfDay < 0.04;
}
export function daylight(timeOfDay: number): number {
  const v = 0.5 - 0.5 * Math.cos((timeOfDay + 0.2) * Math.PI * 2);
  return Math.max(0.06, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type GameEvent =
  | { t: "melee"; x: number; y: number }
  | { t: "bowshot"; x: number; y: number }
  | { t: "dodge"; x: number; y: number }
  | { t: "noammo" }
  | { t: "hit"; x: number; y: number; dmg: number; crit: boolean }
  | { t: "miss"; x: number; y: number }
  | { t: "throw" }
  | { t: "explode"; x: number; y: number }
  | { t: "kill"; kind: EnemyKind; x: number; y: number }
  | { t: "aggro"; kind: EnemyKind }
  | { t: "playerHurt"; dmg: number }
  | { t: "pickup"; id: ItemId; qty: number }
  | { t: "gather" }
  | { t: "search" }
  | { t: "craft"; id: ItemId }
  | { t: "build"; id: StructureId; level: number }
  | { t: "recruit" }
  | { t: "levelUp"; level: number }
  | { t: "skillup"; skill: string; level: number }
  | { t: "victory" }
  | { t: "heal" }
  | { t: "eat" }
  | { t: "drink" }
  | { t: "cure" }
  | { t: "equip" }
  | { t: "dayBreak"; day: number }
  | { t: "nightFall"; day: number }
  | { t: "downed"; dropped: number; lost: boolean }
  | { t: "log"; msg: string };

// ---------------------------------------------------------------------------
// Walkability + collision
// ---------------------------------------------------------------------------

export function makeTileWalkable(world: World): (x: number, y: number) => boolean {
  const { map } = world;
  return (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = map.tiles[y * map.w + x];
    return t ? WALKABLE[t] : false;
  };
}

function blocked(world: World, x: number, y: number, r: number): boolean {
  const { map } = world;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
      const t = map.tiles[ty * map.w + tx]!;
      if (!WALKABLE[t]) return true;
    }
  }
  return false;
}

function inHome(world: World, x: number, y: number): boolean {
  if (world.zoneId !== "home") return false;
  const h = world.home;
  return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function countItem(player: Player, id: ItemId): number {
  let n = 0;
  for (const s of player.inv) if (s && s.id === id) n += s.qty;
  return n;
}
/** Stack `qty` of `id` into a slot array; returns the remainder that didn't fit. */
function addStack(slots: (InvSlot | null)[], def: ItemDef, id: ItemId, qty: number): number {
  let left = qty;
  for (const s of slots) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < def.stack) {
      const add = Math.min(def.stack - s.qty, left);
      s.qty += add;
      left -= add;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const add = Math.min(def.stack, left);
      slots[i] = { id, qty: add };
      left -= add;
    }
  }
  return left;
}

export function addItem(player: Player, content: Content, id: ItemId, qty: number): number {
  const def = content.items[id];
  if (!def) return qty;
  return addStack(player.inv, def, id, qty);
}

/** Deposit a pack slot into the settlement stash. */
export function storeToStash(world: World, content: Content, packIndex: number): void {
  const s = world.player.inv[packIndex];
  if (!s) return;
  const def = content.items[s.id];
  if (!def) return;
  const left = addStack(world.stash, def, s.id, s.qty);
  if (left <= 0) world.player.inv[packIndex] = null;
  else s.qty = left;
}

/** Withdraw a stash slot into the pack. */
export function takeFromStash(world: World, content: Content, stashIndex: number): void {
  const s = world.stash[stashIndex];
  if (!s) return;
  const def = content.items[s.id];
  if (!def) return;
  const left = addStack(world.player.inv, def, s.id, s.qty);
  if (left <= 0) world.stash[stashIndex] = null;
  else s.qty = left;
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
// Progression (XP, levels, skill trees)
// ---------------------------------------------------------------------------

const BASE_HP = 100;
const HP_PER_LEVEL = 5;
const HP_PER_HITPOINT = 4; // each Hitpoints level over 1 adds this to max HP

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function playerMods(player: Player): Mods {
  return computeMods(player.skills);
}

function recomputeMaxHp(player: Player): void {
  const old = player.maxHp;
  const hpLvl = levelForXp(player.trained["hitpoints"] ?? 0);
  player.maxHp = BASE_HP + (player.level - 1) * HP_PER_LEVEL + (hpLvl - 1) * HP_PER_HITPOINT + playerMods(player).maxHpBonus;
  if (player.maxHp > old) player.hp += player.maxHp - old; // gains apply to current HP too
  if (player.hp > player.maxHp) player.hp = player.maxHp;
}

export function grantXp(world: World, amount: number, out: GameEvent[]): void {
  const p = world.player;
  if (!p.alive) return;
  p.xp += amount;
  while (p.xp >= xpForNext(p.level)) {
    p.xp -= xpForNext(p.level);
    p.level++;
    p.points++;
    recomputeMaxHp(p);
    p.hp = p.maxHp; // a level-up mends you fully
    out.push({ t: "levelUp", level: p.level });
  }
}

/** Current level in a trainable (OSRS-style) skill. */
export function skillLevel(world: World, id: SkillId): number {
  return levelForXp(world.player.trained[id] ?? 0);
}

/** Grant XP-by-doing to a trainable skill; emits `skillup` on each new level. */
export function grantSkillXp(world: World, id: SkillId, amount: number, out: GameEvent[]): void {
  const p = world.player;
  if (!p.alive || amount <= 0) return;
  const before = levelForXp(p.trained[id] ?? 0);
  p.trained[id] = (p.trained[id] ?? 0) + Math.round(amount);
  const after = levelForXp(p.trained[id]!);
  if (after > before) {
    if (id === "hitpoints") recomputeMaxHp(p); // a tougher body, more life
    out.push({ t: "skillup", skill: id, level: after });
  }
}

/** Award combat XP for a kill, split by the style used (weapon kind). */
function grantCombatXp(world: World, content: Content, base: number, out: GameEvent[]): void {
  const wk = world.player.equipped ? content.items[world.player.equipped]?.weapon?.kind : undefined;
  if (wk === "bow") {
    grantSkillXp(world, "ranged", base, out);
    grantSkillXp(world, "hitpoints", base * 0.5, out);
  } else {
    grantSkillXp(world, "attack", base * 0.5, out);
    grantSkillXp(world, "strength", base * 0.5, out);
    grantSkillXp(world, "defence", base * 0.35, out);
    grantSkillXp(world, "hitpoints", base * 0.5, out);
  }
}

export function canSpendSkill(world: World, nodeId: string): boolean {
  const p = world.player;
  if (p.points <= 0) return false;
  const node = SKILLS.find((n) => n.id === nodeId);
  if (!node) return false;
  if ((p.skills[nodeId] ?? 0) >= node.maxRank) return false;
  return nodeUnlocked(p.skills, node); // every prerequisite has a rank
}

export function spendSkill(world: World, nodeId: string): boolean {
  if (!canSpendSkill(world, nodeId)) return false;
  const p = world.player;
  p.skills[nodeId] = (p.skills[nodeId] ?? 0) + 1;
  p.points--;
  recomputeMaxHp(p);
  return true;
}

/** Settler cap: Quarters level plus any Quartermaster bonus. */
export function capacity(world: World): number {
  return settlementCapacity(world.settlement.structures.quarters) + playerMods(world.player).capBonus;
}

/** A structure's next-level cost, reduced by Master Builder. */
export function buildCost(world: World, content: Content, id: StructureId): { id: ItemId; qty: number }[] | null {
  const def = content.structures[id];
  const level = world.settlement.structures[id];
  const base = def.costs[level];
  if (!base) return null;
  const mult = playerMods(world.player).buildCostMult;
  return base.map((c) => ({ id: c.id, qty: Math.max(1, Math.round(c.qty * mult)) }));
}

// ---------------------------------------------------------------------------
// World creation
// ---------------------------------------------------------------------------

export function createWorld(content: Content, rng: () => number): World {
  const layout = generateHome(rng);
  const inv: (InvSlot | null)[] = new Array(INV_SIZE).fill(null);
  const player: Player = {
    pos: { x: layout.playerStart.x + 0.5, y: layout.playerStart.y + 0.5 },
    facing: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    hunger: 80,
    thirst: 70,
    path: [],
    order: { type: "none" },
    inv,
    equipped: "rusty_sword",
    armor: null,
    nextAttack: 0,
    infection: 0,
    alive: true,
    invulnUntil: 0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDir: { x: 1, y: 0 },
    level: 1,
    xp: 0,
    points: 0,
    skills: {},
    trained: {},
  };
  addItem(player, content, "rusty_sword", 1);
  addItem(player, content, "poultice", 2);
  addItem(player, content, "bread", 1);
  addItem(player, content, "waterskin", 1);
  addItem(player, content, "wood", 4);
  addItem(player, content, "cloth", 3);

  const world: World = {
    map: layout.map,
    player,
    enemies: [],
    ground: [],
    props: layout.props,
    settlement: { structures: { palisade: 1, forge: 0, workshop: 0, quarters: 1 }, population: 0, roles: { gatherer: 0, forager: 0, guard: 0 }, names: [] },
    stash: new Array(STASH_SIZE).fill(null),
    home: layout.home,
    zoneId: "home",
    entry: { ...layout.playerStart },
    homeCache: null,
    bossesSlain: [],
    won: false,
    onboard: { step: 0, seen: [] },
    timeOfDay: 0.28,
    day: 1,
    clock: 0,
    nextId: 1,
    log: [],
  };
  return world;
}

/** Build the live Enemy list for a freshly-generated region. */
function buildEnemies(world: World, content: Content, spawns: { kind: EnemyKind; x: number; y: number; boss?: boolean }[]): Enemy[] {
  return spawns.map((s) => {
    const e = makeEnemy(world, content, s.kind, s.x + 0.5, s.y + 0.5);
    if (s.boss) e.boss = true;
    return e;
  });
}

/**
 * Travel to another zone. The home settlement is cached so its layout + looted
 * state persist; regions regenerate on each visit. Inventory, settlement and
 * the clock all carry over — only the ground you stand on changes.
 */
export function travelTo(world: World, content: Content, rng: () => number, targetId: string, out: GameEvent[]): boolean {
  if (targetId === world.zoneId) return false;
  const p = world.player;

  // Snapshot the home zone before leaving it.
  if (world.zoneId === "home") {
    world.homeCache = { map: world.map, props: world.props, enemies: world.enemies, ground: world.ground };
  }

  if (targetId === "home") {
    const cache = world.homeCache;
    if (cache) {
      world.map = cache.map; world.props = cache.props; world.enemies = cache.enemies; world.ground = cache.ground;
      world.entry = homeEntry(world);
    } else {
      const layout = generateHome(rng);
      world.map = layout.map; world.props = layout.props; world.enemies = []; world.ground = [];
      world.home = layout.home; world.entry = { ...layout.playerStart };
    }
    out.push({ t: "log", msg: "You return to your settlement." });
  } else {
    const def = regionById(targetId);
    if (!def) return false;
    if (def.requires && !def.requires.every((k) => world.bossesSlain.includes(k))) {
      out.push({ t: "log", msg: "The way is sealed until the Vale's wardens have fallen." });
      return false;
    }
    const layout = generateRegion(rng, def);
    world.map = layout.map; world.props = layout.props; world.ground = [];
    // A boss that has already been slain this run does not return.
    const spawns = (layout.enemySpawns ?? []).filter((s) => !(s.boss && world.bossesSlain.includes(s.kind)));
    world.enemies = buildEnemies(world, content, spawns);
    world.entry = { ...layout.playerStart };
    out.push({ t: "log", msg: `You set out for ${def.name}.` });
  }

  world.zoneId = targetId;
  p.pos = { x: world.entry.x + 0.5, y: world.entry.y + 0.5 };
  p.path = [];
  p.order = { type: "none" };
  return true;
}

/** The tile just inside the home gate — where you arrive when you return. */
function homeEntry(world: World): Vec2 {
  const h = world.home;
  return { x: h.x + Math.floor(h.w / 2) + 2, y: h.y + h.h - 2 };
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
// Orders (set by the client from clicks; the core carries them out)
// ---------------------------------------------------------------------------

export function orderMove(world: World, tx: number, ty: number): void {
  const walk = makeTileWalkable(world);
  world.player.order = { type: "move", to: { x: tx, y: ty } };
  world.player.path = findPath(walk, world.player.pos, { x: tx, y: ty });
}
export function orderInteract(world: World, prop: Prop): void {
  const walk = makeTileWalkable(world);
  world.player.order = { type: "interact", propId: prop.id };
  const r = pathToAdjacent(walk, world.player.pos, prop.pos);
  world.player.path = r.path;
}
export function orderAttack(world: World, enemy: Enemy): void {
  const walk = makeTileWalkable(world);
  world.player.order = { type: "attack", enemyId: enemy.id };
  const r = pathToAdjacent(walk, world.player.pos, enemy.pos);
  world.player.path = r.path;
}
export function stop(world: World): void {
  world.player.order = { type: "none" };
  world.player.path = [];
}

export const DODGE_COOLDOWN = 1600;

/** A quick evasive dash toward (tx,ty) with brief invulnerability. The one
 *  active-defense verb: time it to slip a blow, especially a boss's. */
export function dodge(world: World, tx: number, ty: number, out: GameEvent[]): boolean {
  const p = world.player;
  if (!p.alive || world.clock < p.dashReadyAt || world.clock < p.dashUntil) return false;
  let dx = tx - p.pos.x, dy = ty - p.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.3) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
  else { dx /= len; dy /= len; }
  p.dashDir = { x: dx, y: dy };
  p.dashUntil = world.clock + 240;
  p.invulnUntil = world.clock + 300;
  p.dashReadyAt = world.clock + DODGE_COOLDOWN;
  p.facing = Math.atan2(dy, dx);
  out.push({ t: "dodge", x: p.pos.x, y: p.pos.y });
  return true;
}

// ---------------------------------------------------------------------------
// Player advance: follow path, execute order, auto-fight
// ---------------------------------------------------------------------------

function stepToward(world: World, tx: number, ty: number, speed: number, dt: number): boolean {
  const p = world.player;
  const dx = tx - p.pos.x, dy = ty - p.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return true;
  p.facing = Math.atan2(dy, dx);
  const step = Math.min(d, speed * dt);
  const nx = p.pos.x + (dx / d) * step;
  const ny = p.pos.y + (dy / d) * step;
  if (!blocked(world, nx, p.pos.y, PLAYER_RADIUS)) p.pos.x = nx;
  if (!blocked(world, p.pos.x, ny, PLAYER_RADIUS)) p.pos.y = ny;
  return false;
}

function followPath(world: World, dt: number): boolean {
  const p = world.player;
  if (p.path.length === 0) return true;
  const node = p.path[0]!;
  const speed = WALK_SPEED * playerMods(p).moveMult;
  if (stepToward(world, node.x + 0.5, node.y + 0.5, speed, dt)) p.path.shift();
  return p.path.length === 0;
}

const DASH_SPEED = 10;

function advancePlayer(world: World, content: Content, ctx: { rng: () => number }, dt: number, out: GameEvent[]): void {
  const p = world.player;
  if (!p.alive) return;
  // A dodge in progress overrides orders: a fast lunge, then normal control.
  if (world.clock < p.dashUntil) {
    const nx = p.pos.x + p.dashDir.x * DASH_SPEED * dt;
    const ny = p.pos.y + p.dashDir.y * DASH_SPEED * dt;
    if (!blocked(world, nx, p.pos.y, PLAYER_RADIUS)) p.pos.x = nx;
    if (!blocked(world, p.pos.x, ny, PLAYER_RADIUS)) p.pos.y = ny;
    return;
  }
  const order = p.order;

  if (order.type === "attack") {
    const e = world.enemies.find((x) => x.id === order.enemyId);
    if (!e || e.state === "dead") { stop(world); return; }
    const def = p.equipped ? content.items[p.equipped] : content.items["fists"];
    const wep = def?.weapon ?? content.items["fists"]!.weapon!;
    const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    p.facing = Math.atan2(dy, dx);
    if (dist <= wep.reach + PLAYER_RADIUS) {
      p.path = []; // in reach — plant and fight
      if (world.clock >= p.nextAttack) {
        p.nextAttack = world.clock + wep.cooldown * playerMods(p).cooldownMult; // Alacrity
        attackTarget(world, content, ctx, e, out);
      }
    } else {
      if (p.path.length === 0) {
        const r = pathToAdjacent(makeTileWalkable(world), p.pos, e.pos);
        p.path = r.path;
        if (!r.reachable) { stop(world); return; }
      }
      followPath(world, dt);
    }
    return;
  }

  if (order.type === "interact") {
    if (followPath(world, dt)) {
      const prop = world.props.find((x) => x.id === order.propId);
      if (prop) resolveInteract(world, content, ctx, prop, out);
      stop(world);
    }
    return;
  }

  if (order.type === "move") {
    if (followPath(world, dt)) stop(world);
    return;
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function attackTarget(world: World, content: Content, ctx: { rng: () => number }, e: Enemy, out: GameEvent[]): void {
  const p = world.player;
  const def = p.equipped ? content.items[p.equipped] : content.items["fists"];
  const wep = def?.weapon ?? content.items["fists"]!.weapon!;
  if (wep.kind === "bow") {
    if (countItem(p, wep.ammo!) <= 0) { out.push({ t: "noammo" }); return; }
    removeItem(p, wep.ammo!, 1);
    out.push({ t: "bowshot", x: p.pos.x, y: p.pos.y });
  } else {
    out.push({ t: "melee", x: p.pos.x, y: p.pos.y });
  }
  const eDef = content.enemies[e.kind];
  const m = playerMods(p);
  const ranged = wep.kind === "bow";
  // Accuracy: your combat level in this style vs the foe's armour. Never a
  // sure thing, never hopeless — OSRS-style roll, so misses happen.
  const acc = ranged ? skillLevel(world, "ranged") : skillLevel(world, "attack");
  const hitChance = clamp((acc + 10) / (acc + 10 + eDef.armor * 1.6), 0.4, 0.97);
  if (ctx.rng() > hitChance) { out.push({ t: "miss", x: e.pos.x, y: e.pos.y }); return; }
  // Power: Strength drives melee max hit, Ranged drives the bow.
  const powLvl = ranged ? skillLevel(world, "ranged") : skillLevel(world, "strength");
  const powMult = 1 + powLvl * 0.028; // level 50 ~ +140%
  const crit = ctx.rng() < m.critChance;
  const berserk = p.hp / p.maxHp < 0.4 ? 1 + m.lowHpDmg : 1; // Berserker
  let dmg = Math.round(wep.damage * m.meleeMult * powMult * berserk * (0.85 + ctx.rng() * 0.3) * (crit ? 1.8 : 1));
  dmg = Math.max(1, dmg - Math.max(0, eDef.armor - m.armorPen));
  damageEnemy(world, content, ctx, e, dmg, crit, out);
  // Knockback + brief stagger on solid hits.
  const kl = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) || 1;
  e.pos.x += ((e.pos.x - p.pos.x) / kl) * 0.2;
  e.pos.y += ((e.pos.y - p.pos.y) / kl) * 0.2;
  e.staggerUntil = world.clock + 220;
  // Cleave: the blow carries to every foe within reach around you.
  if (m.cleave && wep.kind !== "bow") {
    for (const o of world.enemies) {
      if (o === e || o.state === "dead") continue;
      if (Math.hypot(o.pos.x - p.pos.x, o.pos.y - p.pos.y) <= wep.reach + 0.6) {
        const od = Math.max(1, Math.round(dmg * 0.5) - Math.max(0, content.enemies[o.kind].armor - m.armorPen));
        damageEnemy(world, content, ctx, o, od, false, out);
      }
    }
  }
}

function damageEnemy(world: World, content: Content, ctx: { rng: () => number }, e: Enemy, dmg: number, crit: boolean, out: GameEvent[]): void {
  e.hp -= dmg;
  out.push({ t: "hit", x: e.pos.x, y: e.pos.y, dmg, crit });
  if (e.hp <= 0) {
    e.state = "dead";
    out.push({ t: "kill", kind: e.kind, x: e.pos.x, y: e.pos.y });
    const table = e.boss ? `kill_${e.kind}` : e.kind === "revenant" ? "kill_revenant" : "kill_common";
    for (const d of rollLoot(ctx.rng, table)) spawnGround(world, d.id, d.qty, e.pos.x, e.pos.y);
    if (e.boss) {
      if (!world.bossesSlain.includes(e.kind)) world.bossesSlain.push(e.kind);
      out.push({ t: "log", msg: `${content.enemies[e.kind].name} falls. Its hoard is yours.` });
      if (e.kind === "rotmother" && !world.won) { world.won = true; out.push({ t: "victory" }); }
    }
    grantXp(world, content.enemies[e.kind].bounty * 8 + 5, out);
    grantCombatXp(world, content, content.enemies[e.kind].bounty * 6 + 8, out);
  } else if (e.state === "idle" || e.state === "wander") {
    e.state = "hunt";
    out.push({ t: "aggro", kind: e.kind });
  }
}

function spawnGround(world: World, id: ItemId, qty: number, x: number, y: number): void {
  world.ground.push({ id: world.nextId++, item: { id, qty }, pos: { x: x + (world.nextId % 5) * 0.05 - 0.12, y: y + (world.nextId % 3) * 0.05 } });
}

function attackPlayer(world: World, content: Content, e: Enemy, out: GameEvent[]): void {
  const p = world.player;
  if (world.clock < p.invulnUntil) return; // dodged — no damage
  const eDef = content.enemies[e.kind];
  const defL = skillLevel(world, "defence");
  // Defence turns some blows aside outright (capped), and softens the rest.
  if (Math.random() < clamp(defL * 0.006, 0, 0.35)) { out.push({ t: "miss", x: p.pos.x, y: p.pos.y }); return; }
  const armorVal = p.armor ? content.items[p.armor]?.armor ?? 0 : 0;
  const defSoak = Math.floor(defL * 0.35);
  const dmg = Math.max(1, Math.round(eDef.damage * (0.9 + Math.random() * 0.2)) - armorVal - defSoak - playerMods(p).dmgReduce);
  p.hp -= dmg;
  out.push({ t: "playerHurt", dmg });
  const infect = (e.kind === "revenant" ? 8 : e.kind === "wretch" ? 12 : e.boss ? 10 : 6) * playerMods(p).infectionMult;
  p.infection = Math.min(100, p.infection + infect);
}

/**
 * You don't die for good — your people drag you back to the settlement. The
 * extraction stake: fall OUT IN THE WILDS and you lose the unbanked pack you
 * were carrying (but keep what you wield and wear, your level, skills, whatever
 * you banked in storage, and the settlement). Fall behind your own walls and
 * you keep everything — home is safe. Bank your haul before you get greedy.
 */
function downPlayer(world: World, content: Content, rng: () => number, out: GameEvent[]): void {
  const p = world.player;
  const inField = world.zoneId !== "home";
  let lost = 0;
  if (inField) {
    // The haul you hadn't banked is gone.
    lost = p.inv.filter(Boolean).length;
    for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
    if (p.equipped) addItem(p, content, p.equipped, 1); // you keep your loadout
    if (p.armor) addItem(p, content, p.armor, 1);
  }
  p.hp = Math.max(1, Math.round(p.maxHp * 0.5));
  p.infection = 0;
  p.hunger = Math.max(p.hunger, 25);
  p.thirst = Math.max(p.thirst, 25);
  p.nextAttack = 0; p.dashUntil = 0; p.invulnUntil = 0;
  if (inField) travelTo(world, content, rng, "home", out);
  else { p.pos = { x: world.entry.x + 0.5, y: world.entry.y + 0.5 }; stop(world); }
  world.timeOfDay = 0.28;
  out.push({ t: "downed", dropped: lost, lost: inField });
}

// ---------------------------------------------------------------------------
// Interaction — search, gather, rescue, open the town board
// ---------------------------------------------------------------------------

export function nearestProp(world: World, maxDist: number): Prop | null {
  const p = world.player;
  let best: Prop | null = null;
  let bd = maxDist * maxDist;
  for (const pr of world.props) {
    const dx = pr.pos.x + 0.5 - p.pos.x, dy = pr.pos.y + 0.5 - p.pos.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = pr; }
  }
  return best;
}

/** Non-searchable stations open UI instead of giving loot. */
export function isStation(kind: Prop["kind"]): boolean {
  return kind === "forge" || kind === "workbench" || kind === "hearth" || kind === "townboard" || kind === "maptable" || kind === "stash" || kind === "gate";
}

function resolveInteract(world: World, content: Content, ctx: { rng: () => number }, pr: Prop, out: GameEvent[]): void {
  // Stations are handled by the client (open panels); nothing to roll here.
  if (isStation(pr.kind)) return;
  if (pr.kind === "survivor") {
    if (pr.used) return;
    if (world.settlement.population >= capacity(world)) {
      out.push({ t: "log", msg: "No room. Build up your Quarters to house more." });
      return;
    }
    pr.used = true;
    world.settlement.population++;
    const name = pick(ctx.rng, SETTLER_NAMES);
    world.settlement.names.push(name);
    out.push({ t: "recruit" });
    out.push({ t: "log", msg: `${name} joins your settlement.` });
    grantXp(world, 45, out);
    return;
  }
  // Searchable / gatherable.
  if (pr.used) { out.push({ t: "log", msg: "Nothing left here." }); return; }
  const nodeSkill = NODE_SKILL[pr.kind]; // set only for gather nodes
  const isNode = !!nodeSkill;
  pr.used = true;
  if (isNode) { pr.respawnAt = world.clock + RESOURCE_RESPAWN_MS; out.push({ t: "gather" }); }
  else out.push({ t: "search" });
  const drops = rollLoot(ctx.rng, pr.loot ?? pr.kind);
  if (drops.length === 0) { out.push({ t: "log", msg: "Empty." }); return; }
  const pm = playerMods(world.player);
  // Gathering skill: a higher level in the node's skill draws out more each time.
  const skillBonus = nodeSkill ? Math.floor(skillLevel(world, nodeSkill) / 12) : 0;
  const bonus = (isNode ? pm.gatherBonus : pm.lootLuck) + skillBonus; // Forager / Scavenger
  for (const d of drops) {
    const qty = d.qty + bonus;
    const left = addItem(world.player, content, d.id, qty);
    const got = qty - left;
    if (got > 0) out.push({ t: "pickup", id: d.id, qty: got });
    if (left > 0) spawnGround(world, d.id, left, pr.pos.x + 0.5, pr.pos.y + 0.5);
  }
  grantXp(world, isNode ? 4 : 6, out);
  if (nodeSkill) grantSkillXp(world, nodeSkill, nodeSkill === "fishing" ? 14 : 16, out);
}

/** Which trainable skill each gather-node prop trains (absent = not a node). */
const NODE_SKILL: Partial<Record<Prop["kind"], SkillId>> = {
  tree: "woodcutting", rock: "mining", herbs: "herblore", fishpool: "fishing",
};

export function restAtHearth(world: World, content: Content, rng: () => number, out: GameEvent[]): void {
  const p = world.player;
  // You bed down for the NIGHT — resting is what carries you to dawn. This is
  // also what stops the hearth being spam-clicked for free heals + tribute:
  // once you rest it is day again, and you cannot rest until the next night.
  if (!isNight(world.timeOfDay)) {
    out.push({ t: "log", msg: "No need to rest yet — the dead come by night." });
    return;
  }
  p.hp = p.maxHp;
  p.hunger = Math.max(0, p.hunger - 10);
  p.thirst = Math.max(0, p.thirst - 12);
  p.infection = Math.max(0, p.infection - 40);
  // Sleeping through to dawn: a day passes and your settlers bring their tribute.
  world.timeOfDay = 0.28;
  world.day++;
  deliverTribute(world, content, rng, out);
  out.push({ t: "dayBreak", day: world.day });
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
  const heal = playerMods(p).healMult; // Field Medic
  switch (def.use) {
    case "heal": p.hp = Math.min(p.maxHp, p.hp + (def.heal ?? 0) * heal); removeItem(p, slot.id, 1); out.push({ t: "heal" }); break;
    case "food": p.hunger = Math.min(100, p.hunger + (def.food ?? 0)); if (def.heal) p.hp = Math.min(p.maxHp, p.hp + def.heal * heal); removeItem(p, slot.id, 1); out.push({ t: "eat" }); break;
    case "drink": p.thirst = Math.min(100, p.thirst + (def.drink ?? 0)); removeItem(p, slot.id, 1); out.push({ t: "drink" }); break;
    case "cure":
      p.infection = Math.max(0, p.infection - (def.cure ?? 0));
      if (def.heal) p.hp = Math.min(p.maxHp, p.hp + def.heal * heal);
      removeItem(p, slot.id, 1); out.push({ t: "cure" }); break;
    case "equip":
      if (def.reqLevel && def.reqSkill && skillLevel(world, def.reqSkill as SkillId) < def.reqLevel) {
        const sk = SKILL_META[def.reqSkill as SkillId]?.name ?? def.reqSkill;
        out.push({ t: "log", msg: `You need ${sk} ${def.reqLevel} to use the ${def.name}.` });
        break;
      }
      if (def.slot === "body") p.armor = def.id;
      else p.equipped = def.id;
      out.push({ t: "equip" });
      break;
    default: break;
  }
}

export function throwFirepot(world: World, content: Content, ctx: { rng: () => number }, slotIndex: number, tx: number, ty: number, out: GameEvent[]): void {
  const p = world.player;
  const slot = p.inv[slotIndex];
  if (!slot) return;
  const def = content.items[slot.id];
  if (!def || def.use !== "throw") return;
  removeItem(p, slot.id, 1);
  out.push({ t: "throw" });
  out.push({ t: "explode", x: tx, y: ty });
  const radius = def.throwRadius ?? 2, dmg = def.throwDamage ?? 40;
  for (const e of world.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.pos.x - tx, e.pos.y - ty);
    if (d <= radius) damageEnemy(world, content, ctx, e, Math.max(6, Math.round(dmg * (1 - d / (radius + 0.5)))), false, out);
  }
}

// ---------------------------------------------------------------------------
// Crafting + building
// ---------------------------------------------------------------------------

export function canCraft(world: World, content: Content, recipeId: string): boolean {
  const r = content.recipes.find((x) => x.id === recipeId);
  if (!r) return false;
  const s = world.settlement.structures;
  if (r.forge && s.forge < r.forge) return false;
  if (r.workshop && s.workshop < r.workshop) return false;
  const sk = recipeSkill(r);
  if (r.reqLevel && skillLevel(world, sk) < r.reqLevel) return false;
  return r.inputs.every((i) => countItem(world.player, i.id) >= i.qty);
}

/** Which trainable skill a recipe trains — explicit, else inferred from station. */
function recipeSkill(r: Recipe): SkillId {
  if (r.skill) return r.skill as SkillId;
  if (r.forge) return "smithing";
  if (r.workshop) return "crafting";
  return "herblore";
}
export function craft(world: World, content: Content, recipeId: string, out: GameEvent[]): boolean {
  const r = content.recipes.find((x) => x.id === recipeId);
  if (!r || !canCraft(world, content, recipeId)) return false;
  for (const i of r.inputs) removeItem(world.player, i.id, i.qty);
  addItem(world.player, content, r.out, r.outQty);
  out.push({ t: "craft", id: r.out });
  grantXp(world, 6, out);
  grantSkillXp(world, recipeSkill(r), r.xp ?? 18, out);
  return true;
}

/** Settlers not yet put to a task. */
export function idleSettlers(world: World): number {
  const r = world.settlement.roles;
  return world.settlement.population - r.gatherer - r.forager - r.guard;
}

/** Move a settler to/from a role (delta +1 assign, -1 unassign). */
export function assignRole(world: World, role: SettlerRole, delta: number): void {
  const r = world.settlement.roles;
  if (delta > 0 && idleSettlers(world) > 0) r[role]++;
  else if (delta < 0 && r[role] > 0) r[role]--;
}

export function canBuild(world: World, content: Content, id: StructureId): boolean {
  const def = content.structures[id];
  if (world.settlement.structures[id] >= def.maxLevel) return false;
  const cost = buildCost(world, content, id);
  if (!cost) return false;
  return cost.every((c) => countItem(world.player, c.id) >= c.qty);
}
export function build(world: World, content: Content, id: StructureId, out: GameEvent[]): boolean {
  if (!canBuild(world, content, id)) return false;
  const level = world.settlement.structures[id];
  const cost = buildCost(world, content, id)!;
  for (const c of cost) removeItem(world.player, c.id, c.qty);
  world.settlement.structures[id] = level + 1;
  out.push({ t: "build", id, level: level + 1 });
  grantSkillXp(world, "construction", 40 + level * 35, out);
  return true;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

export function tick(world: World, content: Content, ctx: { now: number; rng: () => number }, dtMs: number, out: GameEvent[]): void {
  const p = world.player;
  world.clock += dtMs;
  const dt = dtMs / 1000;

  const prevNight = isNight(world.timeOfDay);
  world.timeOfDay = (world.timeOfDay + dtMs / DAY_MS) % 1;
  const nowNight = isNight(world.timeOfDay);
  if (nowNight && !prevNight) out.push({ t: "nightFall", day: world.day });
  if (!nowNight && prevNight) {
    world.day++;
    out.push({ t: "dayBreak", day: world.day });
    deliverTribute(world, content, ctx.rng, out);
  }

  // Regrow depleted resource nodes.
  for (const pr of world.props) {
    if (pr.used && pr.respawnAt != null && world.clock >= pr.respawnAt) { pr.used = false; delete pr.respawnAt; }
  }

  if (!p.alive) return;

  // Survival (Iron Gut slows the drain).
  const decay = playerMods(p).decayMult;
  p.hunger = Math.max(0, p.hunger - 0.26 * decay * dt);
  p.thirst = Math.max(0, p.thirst - 0.38 * decay * dt);
  let bleed = 0;
  if (p.hunger <= 0) bleed += 2.5;
  if (p.thirst <= 0) bleed += 3.5;
  if (p.infection >= 100) bleed += 4;
  else if (p.infection > 0) p.infection = Math.max(0, p.infection - 0.12 * dt);
  if (bleed > 0) p.hp -= bleed * dt;
  // Regeneration: Second Wind everywhere, Rally within your own walls.
  const pm = playerMods(p);
  let regen = pm.regen;
  if (world.zoneId === "home") regen += pm.rallyRegen;
  if (regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + regen * dt);

  // Night raids — at home, thinned by the Palisade + Guards and kept outside the
  // walls; in the wilds they come unchecked.
  if (nowNight) {
    const atHome = world.zoneId === "home";
    const cap = 16 + world.day * 4;
    const alive = world.enemies.filter((e) => e.state !== "dead").length;
    let mult = 1;
    if (atHome) {
      const palisadeMult = Math.max(0, 1 - world.settlement.structures.palisade * 0.25);
      const guardMult = Math.max(0.25, 1 - world.settlement.roles.guard * 0.12);
      mult = palisadeMult * guardMult * playerMods(p).raidMult; // Fortify
    }
    if (alive < cap && ctx.rng() < 0.85 * dt * (1 + world.day * 0.12) * mult) spawnNearPlayer(world, content, ctx);
    // The watch looses arrows: guards cull attackers near home.
    if (atHome && world.settlement.roles.guard > 0) guardDefense(world, content, ctx, dt, out);
  }

  // Enemy AI.
  const walk = makeTileWalkable(world);
  const senseMult = pm.senseMult;
  for (const e of world.enemies) {
    if (e.state === "dead") continue;
    const def = content.enemies[e.kind];
    const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y;
    const dist = Math.hypot(dx, dy);
    if (world.clock < e.staggerUntil) { e.state = "stagger"; continue; }
    const sense = def.sense * senseMult; // Prowl makes you harder to notice
    if (dist <= sense && (e.state === "idle" || e.state === "wander")) { e.state = "hunt"; out.push({ t: "aggro", kind: e.kind }); }

    if (e.state === "hunt" || e.state === "attack" || e.state === "stagger") {
      e.facing = Math.atan2(dy, dx);
      if (dist <= def.reach + PLAYER_RADIUS) {
        if (world.clock >= e.nextAttack) { e.nextAttack = world.clock + def.attackCd; e.state = "attack"; attackPlayer(world, content, e, out); }
      } else {
        if (e.path.length === 0 || e.nextThink <= world.clock) {
          e.nextThink = world.clock + 450 + Math.floor(ctx.rng() * 300);
          e.path = dist < 24 ? findPath(walk, e.pos, p.pos, 900) : [];
        }
        moveEnemyAlong(world, e, def.speed, dt, dx, dy);
      }
      if (dist > sense * 2.6 && e.kind !== "risen") { e.state = "wander"; e.path = []; }
    } else if (e.state === "idle") {
      if (ctx.rng() < 0.4 * dt) e.state = "wander";
    } else if (e.state === "wander") {
      moveEnemy(world, e, Math.cos(e.seed + world.clock / 2000), Math.sin(e.seed + world.clock / 2000), def.speed * 0.3, dt);
      if (ctx.rng() < 0.25 * dt) e.state = "idle";
    }
    if (e.state === "attack" && world.clock >= e.nextAttack - def.attackCd * 0.6) e.state = "hunt";
    separate(world, e);
  }

  advancePlayer(world, content, ctx, dt, out);

  // Auto-pickup ground loot.
  for (const g of world.ground) {
    if (Math.hypot(g.pos.x - p.pos.x, g.pos.y - p.pos.y) < 0.6) {
      const left = addItem(p, content, g.item.id, g.item.qty);
      const got = g.item.qty - left;
      if (got > 0) out.push({ t: "pickup", id: g.item.id, qty: got });
      g.item.qty = left;
    }
  }
  world.ground = world.ground.filter((g) => g.item.qty > 0);

  // Fall → dragged home (not a permadeath wipe).
  if (p.hp <= 0) downPlayer(world, content, ctx.rng, out);

  if (world.enemies.length > 140) world.enemies = world.enemies.filter((e) => e.state !== "dead");
}

function deliverTribute(world: World, content: Content, rng: () => number, out: GameEvent[]): void {
  const s = world.settlement;
  const pop = s.population;
  if (pop <= 0) return;
  const idle = idleSettlers(world);
  let wood = 0, stone = 0, ore = 0, food = 0, herb = 0;
  // Gatherers work timber, stone and ore.
  for (let i = 0; i < s.roles.gatherer; i++) { wood += 1; if (rng() < 0.6) stone += 1; if (rng() < 0.4) ore += 1; }
  // Foragers bring food and physic.
  for (let i = 0; i < s.roles.forager; i++) { food += 1; if (rng() < 0.6) herb += 1; }
  // Idle hands still scrape a little together; guards hold the wall, no tribute.
  for (let i = 0; i < idle; i++) { if (rng() < 0.5) food += 1; else wood += 1; }
  // Bountiful sends your folk home with more.
  const t = playerMods(world.player).tributeMult;
  wood = Math.round(wood * t); stone = Math.round(stone * t); ore = Math.round(ore * t);
  food = Math.round(food * t); herb = Math.round(herb * t);
  // Spill anything that won't fit onto the ground at your feet, so nothing the
  // log promises is silently destroyed.
  const add = (id: ItemId, n: number) => {
    if (n <= 0) return;
    const left = addItem(world.player, content, id, n);
    if (left > 0) spawnGround(world, id, left, world.player.pos.x, world.player.pos.y);
  };
  add("wood", wood); add("stone", stone); add("iron_ore", ore); add("bread", food); add("herb", herb);
  const total = wood + stone + ore + food + herb;
  if (total > 0) out.push({ t: "log", msg: `Your settlers bring supplies (+${total}).` });
}

function moveEnemyAlong(world: World, e: Enemy, speed: number, dt: number, dx: number, dy: number): void {
  if (e.path.length > 0) {
    const node = e.path[0]!;
    const nx = node.x + 0.5 - e.pos.x, ny = node.y + 0.5 - e.pos.y;
    if (Math.hypot(nx, ny) < 0.25) { e.path.shift(); return; }
    moveEnemy(world, e, nx, ny, speed, dt);
  } else {
    moveEnemy(world, e, dx, dy, speed, dt);
  }
}
function moveEnemy(world: World, e: Enemy, dx: number, dy: number, speed: number, dt: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const vx = (dx / len) * speed * dt, vy = (dy / len) * speed * dt;
  if (!blocked(world, e.pos.x + vx, e.pos.y, 0.3)) e.pos.x += vx;
  if (!blocked(world, e.pos.x, e.pos.y + vy, 0.3)) e.pos.y += vy;
}
function separate(world: World, e: Enemy): void {
  for (const o of world.enemies) {
    if (o === e || o.state === "dead") continue;
    const dx = e.pos.x - o.pos.x, dy = e.pos.y - o.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.0001 && d2 < 0.36) {
      const d = Math.sqrt(d2), push = (0.6 - d) * 0.5;
      if (!blocked(world, e.pos.x + (dx / d) * push, e.pos.y, 0.3)) e.pos.x += (dx / d) * push;
      if (!blocked(world, e.pos.x, e.pos.y + (dy / d) * push, 0.3)) e.pos.y += (dy / d) * push;
    }
  }
}
/** Guards on the wall pick off the dead nearest the settlement centre. */
function guardDefense(world: World, content: Content, ctx: { rng: () => number }, dt: number, out: GameEvent[]): void {
  const guards = world.settlement.roles.guard;
  if (ctx.rng() > guards * 0.2 * dt) return; // ~ one volley every few seconds per guard
  const h = world.home;
  const hx = h.x + h.w / 2, hy = h.y + h.h / 2;
  let best: Enemy | null = null;
  let bd = 16 * 16;
  for (const e of world.enemies) {
    if (e.state === "dead") continue;
    const d = (e.pos.x - hx) ** 2 + (e.pos.y - hy) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) damageEnemy(world, content, ctx, best, Math.round((14 + guards * 4) * playerMods(world.player).guardMult), false, out);
}

function spawnNearPlayer(world: World, content: Content, ctx: { rng: () => number }): void {
  const p = world.player;
  const walk = makeTileWalkable(world);
  for (let tries = 0; tries < 24; tries++) {
    const ang = ctx.rng() * Math.PI * 2, rad = 13 + ctx.rng() * 8;
    const x = Math.round(p.pos.x + Math.cos(ang) * rad), y = Math.round(p.pos.y + Math.sin(ang) * rad);
    if (!walk(x, y) || inHome(world, x, y)) continue;
    const r = ctx.rng();
    const kind: EnemyKind = world.day >= 3 && r < 0.1 ? "revenant" : r < 0.5 ? "risen" : r < 0.8 ? "hound" : "wretch";
    const e = makeEnemy(world, content, kind, x + 0.5, y + 0.5);
    e.state = "hunt";
    world.enemies.push(e);
    return;
  }
}
