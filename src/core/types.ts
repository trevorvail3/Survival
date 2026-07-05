/**
 * src/core/types.ts
 * -----------------
 * The shared vocabulary of Ashfall. Only *shapes* live here — no logic, no DOM.
 *
 * Design borrowed from the sibling `world` project: time and randomness are
 * never read from globals inside game logic. Anything that needs "now" or a
 * random roll receives a `Ctx`. That keeps the simulation deterministic and
 * testable, and leaves the door open to a shared-authority multiplayer core.
 */

/** Everything game logic needs from the outside: a clock and a dice bag. */
export interface Ctx {
  /** Monotonic time in ms (resets per reload). Drives cooldowns + animation. */
  now: number;
  /** Random number in [0, 1). A seeded generator in play; Math.random at worst. */
  rng: () => number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// World tiles
// ---------------------------------------------------------------------------

/**
 * The ground/structure a tile is. Walkability + look are derived from this.
 * A dead city block: cracked asphalt, dead grass poking through, rubble,
 * standing walls, doorways, and stagnant water you don't want to drink.
 */
export type TileType =
  | "asphalt"
  | "concrete"
  | "grass"
  | "dirt"
  | "rubble"
  | "wall"
  | "door" // passable, but a wall visually until opened
  | "water"
  | "floor" // interior floorboards
  | "blood"; // stained ground — cosmetic, walkable

export const WALKABLE: Record<TileType, boolean> = {
  asphalt: true,
  concrete: true,
  grass: true,
  dirt: true,
  rubble: true,
  wall: false,
  door: true,
  water: false,
  floor: true,
  blood: true,
};

export interface GameMap {
  w: number;
  h: number;
  /** Row-major tile grid, length w*h. */
  tiles: TileType[];
  /** True where the tile is under a roof (interiors get lit differently). */
  indoor: boolean[];
}

// ---------------------------------------------------------------------------
// Items, inventory, crafting
// ---------------------------------------------------------------------------

export type ItemId = string;

/** How an item can be used from the pack. */
export type ItemUse = "heal" | "food" | "drink" | "throw" | "equip" | "light" | "none";

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Icon silhouette key (see client/itemIcon.ts). */
  shape: string;
  /** Base material tint keyword, feeds the icon palette. */
  material?: string;
  stack: number; // max stack size
  use: ItemUse;
  /** For weapons. */
  weapon?: WeaponDef;
  /** heal/food/drink magnitudes. */
  heal?: number;
  food?: number;
  drink?: number;
  /** throwable damage + radius (molotov, brick). */
  throwDamage?: number;
  throwRadius?: number;
  fire?: boolean;
  desc: string;
}

export type WeaponKind = "fist" | "blade" | "blunt" | "cleaver" | "ranged" | "spear";

export interface WeaponDef {
  kind: WeaponKind;
  damage: number;
  /** Melee reach in tiles / ranged max range. */
  reach: number;
  /** Stamina drained per swing. */
  stamina: number;
  /** ms between swings. */
  cooldown: number;
  /** Swing arc half-angle in radians (melee). */
  arc?: number;
  /** For ranged: ammo item + spread. */
  ammo?: ItemId;
}

export interface InvSlot {
  id: ItemId;
  qty: number;
}

export interface Recipe {
  id: string;
  out: ItemId;
  outQty: number;
  inputs: { id: ItemId; qty: number }[];
  /** Requires being at a workbench (safehouse), or craftable anywhere. */
  bench: boolean;
  name: string;
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export type EnemyKind = "shambler" | "runner" | "stalker" | "brute";

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  damage: number;
  /** tiles/sec when hunting. */
  speed: number;
  /** aggro/sense radius in tiles. */
  sense: number;
  /** ms between attacks. */
  attackCd: number;
  /** melee reach in tiles. */
  reach: number;
  /** xp/scrap value on kill (fed to loot). */
  bounty: number;
}

export type EnemyState = "idle" | "wander" | "hunt" | "attack" | "stagger" | "dead";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  maxHp: number;
  facing: number; // radians
  state: EnemyState;
  /** current path (tiles) toward target, if hunting. */
  path: Vec2[];
  /** ms timestamp when the enemy may next act (attack/repath). */
  nextAttack: number;
  nextThink: number;
  staggerUntil: number;
  /** small per-enemy phase for idle bob animation. */
  seed: number;
}

// ---------------------------------------------------------------------------
// Ground items + props
// ---------------------------------------------------------------------------

export interface GroundItem {
  id: number;
  item: InvSlot;
  pos: Vec2;
}

export type PropKind =
  | "crate" // searchable, gives loot once
  | "locker"
  | "corpse" // searchable
  | "car" // blocks + searchable
  | "workbench"
  | "campfire" // rest / save / cook
  | "barrel"
  | "door"; // openable

export interface Prop {
  id: number;
  kind: PropKind;
  pos: Vec2;
  /** searched/used already. */
  used: boolean;
  /** loot table id for searchables. */
  loot?: string;
  /** doors: open state. */
  open?: boolean;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface Player {
  pos: Vec2;
  facing: number; // radians, aim direction
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** 0..100, drops over time; 0 → HP bleeds. */
  hunger: number;
  thirst: number;
  /** true while sprinting (drains stamina, moves faster). */
  sprinting: boolean;
  inv: (InvSlot | null)[]; // fixed-size grid
  equipped: ItemId | null; // weapon in hand
  /** ms timestamp the player may next swing / act. */
  nextAttack: number;
  /** ms until i-frames (dodge roll) end. */
  invulnUntil: number;
  /** ms until the current dodge-roll motion ends. */
  rollUntil: number;
  rollDir: Vec2;
  /** infection 0..100 — creeps up when hit by infected, kills at 100. */
  infection: number;
  alive: boolean;
}

// ---------------------------------------------------------------------------
// The whole world
// ---------------------------------------------------------------------------

export interface World {
  map: GameMap;
  player: Player;
  enemies: Enemy[];
  ground: GroundItem[];
  props: Prop[];
  /** 0..1 through the current day; 0 = dawn, 0.5 = dusk, wraps. */
  timeOfDay: number;
  /** integer day count; night survived → +1. */
  day: number;
  /** ms of accumulated game time, for cooldown comparisons. */
  clock: number;
  /** next entity id to hand out. */
  nextId: number;
  /** floating combat/status text + particles live client-side; kept out of core. */
  log: string[];
}

/** All static content, resolved once at boot. */
export interface Content {
  items: Record<ItemId, ItemDef>;
  enemies: Record<EnemyKind, EnemyDef>;
  recipes: Recipe[];
}
