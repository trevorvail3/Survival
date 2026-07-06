/**
 * src/core/types.ts
 * -----------------
 * The shared vocabulary of Ashfall — a cozy base-builder with OSRS-style
 * gathering/crafting and Destiny/Arc-Raiders-style expedition loot runs, set in
 * a dark medieval-plague world. Only *shapes* live here (no logic, no DOM).
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

export type ItemUse = "heal" | "throw" | "equip" | "cure" | "none";

export interface ItemDef {
  id: ItemId;
  name: string;
  shape: string; // icon silhouette key (client/itemIcon.ts)
  material?: string; // tint keyword for the icon palette
  stack: number;
  use: ItemUse;
  weapon?: WeaponDef;
  armor?: number; // damage soaked per hit when equipped as armour
  slot?: EquipSlot; // equip slot: "weapon" or one of the armour slots
  heal?: number;
  cure?: number; // infection removed
  throwDamage?: number;
  throwRadius?: number;
  fire?: boolean;
  /** Trainable skill required to wield/wear this (SkillId), e.g. "attack". */
  reqSkill?: string;
  /** Minimum level in `reqSkill` to equip. */
  reqLevel?: number;
  desc: string;
}

export type WeaponKind = "fist" | "blade" | "dagger" | "blunt" | "axe" | "spear" | "bow" | "crossbow";

export interface WeaponDef {
  kind: WeaponKind;
  damage: number;
  reach: number; // tiles; bows reach far
  cooldown: number; // ms between blows (attack speed)
  ammo?: ItemId; // ranged weapons consume ammo (arrows / bolts). Presence = ranged.
  /** Flat enemy-armour ignored on a hit (maces, axes, crossbows pierce armour). */
  armorPen?: number;
  /** Added to crit chance (daggers/rapiers fish for crits). */
  crit?: number;
  /** This weapon cleaves nearby foes on every swing (great weapons, polearms). */
  cleave?: boolean;
  /** Needs both hands — cannot be paired with an off-hand shield. */
  twoHanded?: boolean;
}

/** Equipment slots: main-hand weapon, an off-hand (shield), and five armour slots. */
export type ArmorSlot = "head" | "body" | "hands" | "legs" | "feet";
export type EquipSlot = "weapon" | "offhand" | ArmorSlot;

export interface InvSlot {
  id: ItemId;
  qty: number;
  /** Gear instances (Destiny-style): a dropped weapon/armour carries its own
   *  rolled Power and rarity. Absent on plain stackable resources. */
  power?: number;
  rarity?: string; // Rarity from content/gear.ts
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
  /** OSRS skill trained by making this (SkillId). Defaults from the station. */
  skill?: string;
  /** XP granted on a successful craft (defaults to a per-station base). */
  xp?: number;
  /** Minimum level in `skill` required to make it. */
  reqLevel?: number;
}

// ---------------------------------------------------------------------------
// Enemies — the risen dead and plague-beasts
// ---------------------------------------------------------------------------

export type EnemyKind = "risen" | "hound" | "wretch" | "revenant" | "graveking" | "prior" | "rotmother";

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
  | "fishpool" // fish the water (depletes + regrows)
  | "survivor" // rescuable settlement member
  | "waystone" // return stone in the wilds (opens the map)
  | "maptable" // the war map in the settlement (choose an expedition)
  | "stash" // settlement storage chest
  | "gate"; // openable

export interface Prop {
  id: number;
  kind: PropKind;
  pos: Vec2;
  used: boolean;
  loot?: string;
  /** ms clock time a depleted resource node regrows. */
  respawnAt?: number;
  /** Gathering-skill level required to harvest (expedition nodes; 0/absent at home). */
  reqLevel?: number;
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
  /** Tiles remaining to walk (drives movement + facing). */
  path: Vec2[];
  order: PlayerOrder;
  inv: (InvSlot | null)[]; // the pack you carry (lost if you fall)
  equipped: InvSlot | null; // equipped weapon instance (rolled Power/rarity)
  /** Equipped off-hand (a shield). Locked out while a two-handed weapon is wielded. */
  offhand: InvSlot | null;
  /** Equipped armour, one instance per slot (head/body/hands/legs/feet). */
  armor: Record<ArmorSlot, InvSlot | null>;
  nextAttack: number;
  infection: number;
  alive: boolean;
  // --- Active defense (dodge) ---
  /** ms clock time i-frames end (no damage taken while active). */
  invulnUntil: number;
  /** ms clock time the dash movement ends. */
  dashUntil: number;
  /** ms clock time the dodge is off cooldown. */
  dashReadyAt: number;
  dashDir: Vec2;
  // --- RPG progression ---
  level: number;
  xp: number;
  /** Unspent skill points. */
  points: number;
  /** Ranks purchased per skill-node id (the perk constellations). */
  skills: Record<string, number>;
  /** OSRS-style trainable skills: total XP per skill id (level derived).
   *  Keyed by SkillId from content/trainskills.ts. */
  trained: Record<string, number>;
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
  /** Names of the rescued, parallel to population — shown over their figures. */
  names: string[];
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
  /** Recommended Power (Destiny-style). Under it, foes hit harder; over it,
   *  you dominate. Also the band around which this region's loot Power rolls. */
  power: number;
  /** A named boss that guards this region (once-per-run), if any. */
  boss?: EnemyKind;
  /** Bosses that must be slain before this region can be entered. */
  requires?: EnemyKind[];
  /** Slaying this region's boss wins the run. */
  final?: boolean;
  /** Position on the war map, 0..1 (settlement sits at the centre). */
  mx: number;
  my: number;
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
  /** The settlement storage chest — safe from death, unlike your pack. */
  stash: (InvSlot | null)[];
  /** Rect of the home settlement (a safe zone — no enemies ever spawn there).
   *  Only meaningful while `zoneId === "home"`. */
  home: { x: number; y: number; w: number; h: number };
  /** The current area: "home" or a region id. */
  zoneId: string;
  /** Where the player spawns / stands after entering this zone (the waystone). */
  entry: Vec2;
  /** The home zone kept so its layout + looted state persist across trips. */
  homeCache: ZoneSnapshot | null;
  /** Named bosses already slain this run — they do not return. */
  bossesSlain: string[];
  /** Set once the Rot-Mother falls — the run is won (free play continues). */
  won: boolean;
  /** Onboarding progress (persisted with the run): current step + seen tips. */
  onboard: { step: number; seen: string[] };
  timeOfDay: number;
  day: number;
  clock: number;
  /** world.clock value at which the hearth may be rested at again — a real-
   *  time cooldown, not a time-of-day gate (see restAtHearth). */
  restReadyAt: number;
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
