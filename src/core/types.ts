/**
 * src/core/types.ts
 * -----------------
 * The shared vocabulary of Ashfall — a medieval plague-horror survival game.
 * Only *shapes* live here (no logic, no DOM).
 *
 * Discipline borrowed from the sibling `world` project: time + randomness are
 * injected via `Ctx`, never read from globals, so the simulation is
 * deterministic and a shared-authority core stays possible. Movement is
 * point-and-click (like `world`/OSRS): the player is given ORDERS and walks A*
 * paths to carry them out.
 */

export interface Ctx {
  now: number;
  rng: () => number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// World tiles — a blighted medieval countryside
// ---------------------------------------------------------------------------

export type TileType =
  | "grass"
  | "path" // trodden dirt road
  | "dirt"
  | "cobble" // village paving
  | "stonefloor" // interiors / keep
  | "field" // tilled farmland
  | "wall" // stone/wood barrier (blocks)
  | "gate" // passable opening
  | "water" // river/moat (blocks)
  | "forest" // dense bramble/trees (blocks)
  | "rubble"
  | "grave"
  | "blood";

export const WALKABLE: Record<TileType, boolean> = {
  grass: true,
  path: true,
  dirt: true,
  cobble: true,
  stonefloor: true,
  field: true,
  wall: false,
  gate: true,
  water: false,
  forest: false,
  rubble: true,
  grave: true,
  blood: true,
};

export interface GameMap {
  w: number;
  h: number;
  tiles: TileType[];
  /** True where the tile is under a roof (interiors lit differently). */
  indoor: boolean[];
}

// ---------------------------------------------------------------------------
// Items, inventory, crafting
// ---------------------------------------------------------------------------

export type ItemId = string;

export type ItemUse = "heal" | "food" | "drink" | "throw" | "equip" | "cure" | "none";

export interface ItemDef {
  id: ItemId;
  name: string;
  shape: string; // icon silhouette key (client/itemIcon.ts)
  material?: string; // tint keyword for the icon palette
  stack: number;
  use: ItemUse;
  weapon?: WeaponDef;
  armor?: number; // damage soaked per hit when equipped as armour
  slot?: "weapon" | "body"; // equip slot
  heal?: number;
  food?: number;
  drink?: number;
  cure?: number; // infection removed
  throwDamage?: number;
  throwRadius?: number;
  fire?: boolean;
  desc: string;
}

export type WeaponKind = "fist" | "blade" | "blunt" | "axe" | "spear" | "bow";

export interface WeaponDef {
  kind: WeaponKind;
  damage: number;
  reach: number; // tiles; bows reach far
  cooldown: number; // ms between blows (attack speed)
  ammo?: ItemId; // bows consume arrows
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
  name: string;
  /** Minimum Forge level required (0 = craftable in the field). */
  forge?: number;
  /** Minimum Workshop level required. */
  workshop?: number;
}

// ---------------------------------------------------------------------------
// Enemies — the risen dead and plague-beasts
// ---------------------------------------------------------------------------

export type EnemyKind = "risen" | "hound" | "wretch" | "revenant" | "graveking" | "prior";

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  damage: number;
  speed: number; // tiles/sec when hunting
  sense: number; // aggro radius in tiles
  attackCd: number; // ms between attacks
  reach: number;
  armor: number; // flat damage reduction
  bounty: number;
}

export type EnemyState = "idle" | "wander" | "hunt" | "attack" | "stagger" | "dead";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  maxHp: number;
  facing: number;
  state: EnemyState;
  path: Vec2[];
  nextAttack: number;
  nextThink: number;
  staggerUntil: number;
  seed: number;
  /** A named region boss — bigger, richer drops, shows a health bar. */
  boss?: boolean;
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
  | "chest"
  | "crate"
  | "barrel"
  | "remains" // searchable corpse
  | "cart" // blocks + searchable
  | "forge" // build/upgrade + weapon crafting
  | "workbench" // workshop crafting
  | "hearth" // rest / save / light
  | "townboard" // open the settlement panel
  | "tree" // gather wood (depletes + regrows)
  | "rock" // gather stone/iron (depletes + regrows)
  | "herbs" // gather herbs/food (depletes + regrows)
  | "survivor" // rescuable settlement member
  | "waystone" // travel between the settlement and the regions
  | "gate"; // openable

export interface Prop {
  id: number;
  kind: PropKind;
  pos: Vec2;
  used: boolean;
  loot?: string;
  /** ms clock time a depleted resource node regrows. */
  respawnAt?: number;
}

// ---------------------------------------------------------------------------
// Player + orders (point-and-click)
// ---------------------------------------------------------------------------

export type PlayerOrder =
  | { type: "none" }
  | { type: "move"; to: Vec2 }
  | { type: "interact"; propId: number }
  | { type: "attack"; enemyId: number };

export interface Player {
  pos: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  hunger: number;
  thirst: number;
  /** Tiles remaining to walk (drives movement + facing). */
  path: Vec2[];
  order: PlayerOrder;
  inv: (InvSlot | null)[];
  equipped: ItemId | null; // weapon
  armor: ItemId | null; // body armour
  nextAttack: number;
  infection: number;
  alive: boolean;
  // --- RPG progression ---
  level: number;
  xp: number;
  /** Unspent skill points. */
  points: number;
  /** Ranks purchased per skill-node id. */
  skills: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export type StructureId = "palisade" | "forge" | "workshop" | "quarters";

export interface StructureDef {
  id: StructureId;
  name: string;
  maxLevel: number;
  /** Cost per level (index 0 = build to level 1). */
  costs: { id: ItemId; qty: number }[][];
  blurb: string;
  /** Short effect line per level, for the panel. */
  effect: (level: number) => string;
}

/** What a rescued settler is put to. Unassigned settlers still give a little. */
export type SettlerRole = "gatherer" | "forager" | "guard";
export const SETTLER_ROLES: SettlerRole[] = ["gatherer", "forager", "guard"];

export interface Settlement {
  structures: Record<StructureId, number>; // current level, 0 = not built
  population: number;
  /** How many settlers are assigned to each role (rest are idle). */
  roles: Record<SettlerRole, number>;
}

// ---------------------------------------------------------------------------
// Regions (discrete expeditions from the settlement hub)
// ---------------------------------------------------------------------------

export interface RegionDef {
  id: string;
  name: string;
  blurb: string;
  danger: number; // 1..3, shown as skulls
  treeCount: number;
  rockCount: number;
  herbCount: number;
  chests: number;
  survivors: number;
  enemyMix: EnemyKind[]; // repeat a kind to weight it
  enemyCount: number;
  /** A named boss that guards this region (once-per-run), if any. */
  boss?: EnemyKind;
}

/** A generated area's contents, cached so the home settlement persists. */
export interface ZoneSnapshot {
  map: GameMap;
  props: Prop[];
  enemies: Enemy[];
  ground: GroundItem[];
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
  settlement: Settlement;
  /** Rect of the home settlement (safe zone); night spawns avoid it. Only
   *  meaningful while `zoneId === "home"`. */
  home: { x: number; y: number; w: number; h: number };
  /** The current area: "home" or a region id. */
  zoneId: string;
  /** Where the player spawns / stands after entering this zone (the waystone). */
  entry: Vec2;
  /** The home zone kept so its layout + looted state persist across trips. */
  homeCache: ZoneSnapshot | null;
  /** Named bosses already slain this run — they do not return. */
  bossesSlain: string[];
  /** Onboarding progress (persisted with the run): current step + seen tips. */
  onboard: { step: number; seen: string[] };
  timeOfDay: number;
  day: number;
  clock: number;
  nextId: number;
  log: string[];
}

export interface Content {
  items: Record<ItemId, ItemDef>;
  enemies: Record<EnemyKind, EnemyDef>;
  recipes: Recipe[];
  structures: Record<StructureId, StructureDef>;
  regions: RegionDef[];
}
