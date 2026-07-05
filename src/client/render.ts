/**
 * src/client/render.ts
 * --------------------
 * Canvas 2D renderer. No image assets — tiles, props, the infected and the
 * survivor are all drawn procedurally. The engine techniques are lifted from
 * the sibling `world` project: hash-noise terrain tinting so ground melts
 * together, a cached radial-gradient `discSprite` for every soft glow, and a
 * screen-space day/night veil punched through by warm light pools. For Ashfall
 * the veil is cranked toward black and the player carries a small, failing
 * light — the dark is the antagonist.
 *
 * RULE (from `world`): the renderer only READS the world. It never mutates it.
 */

import type { Enemy, GroundItem, Prop, TileType, World } from "../core/types.ts";
import { daylight, isNight, PLAYER_RADIUS } from "../core/world.ts";
import { hashStr } from "../core/rng.ts";
import { drawSurvivor, DEFAULT_LOOK, type AvatarAnim } from "./avatar.ts";
import type { Content, WeaponKind } from "../core/types.ts";

export const TILE = 30;

export interface Camera {
  x: number; // world px of the view's left edge (before zoom transform)
  y: number;
}

// --- Cached radial-gradient sprites (soft glows / shadows) ---
const discCache = new Map<string, HTMLCanvasElement>();
function discSprite(key: string, r: number, stops: [number, string][]): HTMLCanvasElement {
  const hit = discCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = r * 2;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  discCache.set(key, c);
  return c;
}

// --- Tile palette: [base, accent] ---
const TILE_COLORS: Record<TileType, [string, string]> = {
  asphalt: ["#2b2e31", "#1f2123"],
  concrete: ["#3a3c3f", "#2f3134"],
  grass: ["#333c2b", "#28301f"],
  dirt: ["#3b3020", "#2c2418"],
  rubble: ["#37342c", "#26231d"],
  wall: ["#47423a", "#2c2822"],
  door: ["#4c3a24", "#2f2214"],
  water: ["#183038", "#0f2229"],
  floor: ["#3d3223", "#2e2519"],
  blood: ["#3a1c17", "#24100d"],
};

const tileRGBCache = new Map<string, [number, number, number]>();
function tileRGB(hex: string): [number, number, number] {
  const c = tileRGBCache.get(hex);
  if (c) return c;
  const h = hex.replace("#", "");
  const v: [number, number, number] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  tileRGBCache.set(hex, v);
  return v;
}
/** Two-octave value noise in [-1,1] keyed by tile coords — the `world` trick for
 *  breaking up flat fills without any texture memory. */
function tileNoise(x: number, y: number): number {
  const h = hashStr(`${x},${y}`);
  const a = ((h & 0xff) / 255) * 2 - 1;
  const b = (((h >> 8) & 0xff) / 255) * 2 - 1;
  return a * 0.7 + b * 0.3;
}

function tileAt(world: World, x: number, y: number): TileType {
  if (x < 0 || y < 0 || x >= world.map.w || y >= world.map.h) return "wall";
  return world.map.tiles[y * world.map.w + x]!;
}

function paintTile(g: CanvasRenderingContext2D, world: World, x: number, y: number): void {
  const t = tileAt(world, x, y);
  const [base] = TILE_COLORS[t];
  const [r, gg, b] = tileRGB(base);
  const n = tileNoise(x, y) * 10;
  const px = x * TILE;
  const py = y * TILE;

  if (t === "wall") {
    // Blocky masonry with a lit top edge and dark base — reads as a standing wall.
    g.fillStyle = `rgb(${r + n},${gg + n},${b + n})`;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(px, py, TILE, 3);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(px, py + TILE - 4, TILE, 4);
    return;
  }

  g.fillStyle = `rgb(${clamp(r + n)},${clamp(gg + n)},${clamp(b + n)})`;
  g.fillRect(px, py, TILE, TILE);

  // Per-type surface detail.
  const hh = hashStr(`d${x},${y}`);
  if (t === "asphalt" || t === "concrete") {
    if ((hh & 7) === 0) {
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px + (hh % TILE), py);
      g.lineTo(px + ((hh >> 3) % TILE), py + TILE);
      g.stroke();
    }
  } else if (t === "grass") {
    g.strokeStyle = "rgba(120,140,90,0.25)";
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const bx = px + ((hh >> (i * 3)) % TILE);
      const by = py + ((hh >> (i * 2 + 1)) % TILE);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + 1, by - 3);
      g.stroke();
    }
  } else if (t === "rubble") {
    g.fillStyle = "rgba(0,0,0,0.3)";
    for (let i = 0; i < 4; i++) {
      const bx = px + ((hh >> (i * 4)) % (TILE - 4));
      const by = py + ((hh >> (i * 3 + 2)) % (TILE - 4));
      g.fillRect(bx, by, 3, 3);
    }
    g.fillStyle = "rgba(150,150,150,0.08)";
    g.fillRect(px + (hh % (TILE - 6)), py + ((hh >> 4) % (TILE - 6)), 4, 4);
  } else if (t === "water") {
    // Slow shimmer handled in the live pass would need `now`; keep static sheen.
    g.fillStyle = "rgba(80,140,150,0.06)";
    g.fillRect(px + 2, py + ((hh % 3) + 4), TILE - 4, 2);
  } else if (t === "door") {
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 2;
    g.strokeRect(px + 3, py + 2, TILE - 6, TILE - 4);
  } else if (t === "blood") {
    g.fillStyle = "rgba(120,20,15,0.35)";
    g.beginPath();
    g.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.4, TILE * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

// --- Props ---
function drawProp(g: CanvasRenderingContext2D, pr: Prop, now: number): void {
  const cx = (pr.pos.x + 0.5) * TILE;
  const cy = (pr.pos.y + 0.5) * TILE;
  const dim = pr.used ? 0.5 : 1;
  g.save();
  g.globalAlpha = dim;
  switch (pr.kind) {
    case "crate":
      box(g, cx, cy, TILE * 0.7, "#5a4327", "#3a2c19");
      break;
    case "locker":
      g.fillStyle = "#3c4650";
      g.fillRect(cx - TILE * 0.28, cy - TILE * 0.4, TILE * 0.56, TILE * 0.8);
      g.strokeStyle = "#20262c";
      g.lineWidth = 2;
      g.strokeRect(cx - TILE * 0.28, cy - TILE * 0.4, TILE * 0.56, TILE * 0.8);
      g.fillStyle = "#20262c";
      g.fillRect(cx + TILE * 0.12, cy - 2, 3, 6);
      break;
    case "corpse":
      g.fillStyle = "#4a3f38";
      g.beginPath();
      g.ellipse(cx, cy, TILE * 0.38, TILE * 0.22, 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2a1512";
      g.beginPath();
      g.arc(cx - TILE * 0.22, cy - TILE * 0.06, TILE * 0.12, 0, Math.PI * 2);
      g.fill();
      break;
    case "car":
      g.fillStyle = "#33302c";
      rr(g, cx - TILE * 0.7, cy - TILE * 0.42, TILE * 1.4, TILE * 0.84, 6);
      g.fill();
      g.fillStyle = "#1c1a18";
      rr(g, cx - TILE * 0.42, cy - TILE * 0.28, TILE * 0.84, TILE * 0.56, 4);
      g.fill();
      g.fillStyle = "rgba(120,140,150,0.15)";
      rr(g, cx - TILE * 0.35, cy - TILE * 0.2, TILE * 0.7, TILE * 0.4, 3);
      g.fill();
      break;
    case "barrel":
      g.fillStyle = "#5a3a22";
      g.beginPath();
      g.arc(cx, cy, TILE * 0.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#2e1d10";
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = "#8a6a3a";
      g.beginPath();
      g.arc(cx, cy, TILE * 0.18, 0, Math.PI * 2);
      g.stroke();
      break;
    case "workbench":
      g.fillStyle = "#4a3826";
      g.fillRect(cx - TILE * 0.5, cy - TILE * 0.3, TILE, TILE * 0.6);
      g.strokeStyle = "#2a1d12";
      g.lineWidth = 2;
      g.strokeRect(cx - TILE * 0.5, cy - TILE * 0.3, TILE, TILE * 0.6);
      g.fillStyle = "#7d858c";
      g.fillRect(cx - TILE * 0.3, cy - TILE * 0.18, TILE * 0.2, TILE * 0.1);
      g.fillStyle = "#8e2b23";
      g.fillRect(cx + TILE * 0.1, cy - 2, TILE * 0.25, 4);
      break;
    case "campfire": {
      // Embers + flicker; a light source in the dark.
      const fl = 0.6 + Math.sin(now / 120) * 0.2 + Math.sin(now / 57) * 0.1;
      g.fillStyle = "#2a221a";
      g.beginPath();
      g.arc(cx, cy, TILE * 0.34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(226,120,40,${0.7 * fl})`;
      g.beginPath();
      g.moveTo(cx, cy - TILE * 0.4 * fl);
      g.lineTo(cx - TILE * 0.16, cy + TILE * 0.1);
      g.lineTo(cx + TILE * 0.16, cy + TILE * 0.1);
      g.closePath();
      g.fill();
      g.fillStyle = `rgba(255,210,120,${0.8 * fl})`;
      g.beginPath();
      g.arc(cx, cy, TILE * 0.12 * fl, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "door":
      // Drawn as part of the tile; nothing extra.
      break;
  }
  g.restore();
}

// --- The infected ---
function drawEnemy(g: CanvasRenderingContext2D, e: Enemy, now: number): void {
  if (e.state === "dead") return;
  const cx = e.pos.x * TILE;
  const cy = e.pos.y * TILE;
  const bob = e.state === "hunt" || e.state === "attack" ? Math.sin(now / 90 + e.seed) * 2 : Math.sin(now / 400 + e.seed) * 1;

  // Shadow.
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(cx, cy + TILE * 0.18, TILE * 0.32, TILE * 0.16, 0, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.translate(cx, cy + bob);
  g.rotate(e.facing + Math.PI / 2);

  const hurt = now < e.staggerUntil;
  let body: string, head: string, size: number;
  switch (e.kind) {
    case "shambler": body = "#3f4a3a"; head = "#5a6a4a"; size = 0.34; break;
    case "runner": body = "#5a3a3a"; head = "#7a4a44"; size = 0.28; break;
    case "stalker": body = "#3a3644"; head = "#c8c0b0"; size = 0.33; break;
    case "brute": body = "#4a3a2a"; head = "#6a5238"; size = 0.5; break;
    default: body = "#444"; head = "#666"; size = 0.32;
  }
  if (hurt) { body = "#8e2b23"; }
  const R = (u: number) => u * TILE;

  // Torso.
  g.fillStyle = body;
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = R(0.03);
  g.beginPath();
  g.ellipse(0, 0, R(size), R(size * 1.15), 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // Reaching arms when hunting.
  if (e.state === "hunt" || e.state === "attack") {
    g.strokeStyle = body;
    g.lineWidth = R(0.1);
    g.lineCap = "round";
    const reach = e.state === "attack" ? R(0.5) : R(0.4);
    g.beginPath();
    g.moveTo(R(-size * 0.6), R(-size * 0.2));
    g.lineTo(R(-0.1), -reach);
    g.moveTo(R(size * 0.6), R(-size * 0.2));
    g.lineTo(R(0.1), -reach);
    g.stroke();
  }

  // Head.
  g.fillStyle = head;
  g.beginPath();
  g.arc(0, R(-size * 0.7), R(size * 0.55), 0, Math.PI * 2);
  g.fill();
  // Stalker: no eyes, a pale blind clicker head with a fleshy bloom.
  if (e.kind === "stalker") {
    g.fillStyle = "#5a2a2a";
    g.beginPath();
    g.arc(0, R(-size * 0.7), R(size * 0.28), 0, Math.PI * 2);
    g.fill();
  } else {
    // Faint sickly eye-glints.
    g.fillStyle = "rgba(200,220,120,0.8)";
    g.beginPath();
    g.arc(R(-size * 0.2), R(-size * 0.75), R(0.04), 0, Math.PI * 2);
    g.arc(R(size * 0.2), R(-size * 0.75), R(0.04), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawGround(g: CanvasRenderingContext2D, gi: GroundItem, now: number): void {
  const cx = gi.pos.x * TILE;
  const cy = gi.pos.y * TILE;
  const pulse = 0.6 + Math.sin(now / 300 + gi.id) * 0.2;
  // Soft glow so loot is findable in the gloom.
  const glow = discSprite("loot", 24, [
    [0, `rgba(220,180,90,0.5)`],
    [1, "rgba(220,180,90,0)"],
  ]);
  g.globalAlpha = pulse;
  g.drawImage(glow, cx - 12, cy - 12, 24, 24);
  g.globalAlpha = 1;
  g.fillStyle = "#d8b45a";
  g.strokeStyle = "#2a2015";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx, cy - 4);
  g.lineTo(cx + 4, cy);
  g.lineTo(cx, cy + 4);
  g.lineTo(cx - 4, cy);
  g.closePath();
  g.fill();
  g.stroke();
}

function weaponKindOf(world: World, content: Content): WeaponKind {
  const id = world.player.equipped;
  const def = id ? content.items[id] : undefined;
  return def?.weapon?.kind ?? "fist";
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export function drawWorld(
  g: CanvasRenderingContext2D,
  world: World,
  content: Content,
  cam: Camera,
  now: number,
  viewW: number,
  viewH: number,
  zoom: number,
): void {
  g.save();
  g.setTransform(zoom, 0, 0, zoom, -cam.x * zoom, -cam.y * zoom);

  // Cull bounds in tile space.
  const minX = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const minY = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const maxX = Math.min(world.map.w - 1, Math.ceil((cam.x + viewW / zoom) / TILE) + 1);
  const maxY = Math.min(world.map.h - 1, Math.ceil((cam.y + viewH / zoom) / TILE) + 1);

  // 1. Tiles.
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) paintTile(g, world, x, y);
  }

  // 2. Ground loot (under entities).
  for (const gi of world.ground) drawGround(g, gi, now);

  // 3. Props.
  for (const pr of world.props) {
    if (pr.pos.x < minX - 1 || pr.pos.x > maxX + 1 || pr.pos.y < minY - 1 || pr.pos.y > maxY + 1) continue;
    drawProp(g, pr, now);
  }

  // 4. Enemies.
  for (const e of world.enemies) {
    if (e.pos.x < minX - 2 || e.pos.x > maxX + 2 || e.pos.y < minY - 2 || e.pos.y > maxY + 2) continue;
    drawEnemy(g, e, now);
  }

  // 5. Player.
  const p = world.player;
  if (p.alive || now % 400 < 200) {
    const anim: AvatarAnim = {
      now,
      moving: false,
      ...(world.clock < p.rollUntil ? { rolling: true } : {}),
      ...(now < p.invulnUntil ? { hurt: false } : {}),
    };
    // Swing frac from nextAttack window (approx): if recently attacked, animate.
    const swingWin = 220;
    const sinceAttack = p.nextAttack - world.clock; // >0 while cooling down
    if (sinceAttack > 0) {
      const frac = Math.min(1, Math.max(0, sinceAttack / swingWin));
      anim.swing = frac;
    }
    drawSurvivor(g, p.pos.x * TILE, p.pos.y * TILE, TILE, p.facing, DEFAULT_LOOK, anim, weaponKindOf(world, content));
    void PLAYER_RADIUS;
  }

  g.restore();
}

// Offscreen canvas for the darkness overlay — holes are punched HERE (not on the
// world canvas) so revealing a light pool shows the world beneath, not the page.
let lightCanvas: HTMLCanvasElement | null = null;
let lightCtx: CanvasRenderingContext2D | null = null;

/**
 * Screen-space lighting + atmosphere, drawn after the world. This is where
 * Ashfall gets its teeth: a near-black night veil with warm pools punched out
 * around light sources, a vignette, and additive bloom on flashes. Adapted from
 * `world`'s `drawDaylight`/`drawVignette`, pushed much darker. The darkness is
 * composed on its own layer so the light holes reveal the world, not the void.
 */
export function drawLighting(
  g: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  viewW: number,
  viewH: number,
  zoom: number,
  extraLights: { x: number; y: number; r: number; color: string }[],
): void {
  const dl = daylight(world.timeOfDay);
  const night = isNight(world.timeOfDay);
  // Darkness strength: full day still slightly graded; night nearly black.
  const veil = 1 - dl; // 0 bright .. ~0.94 dark
  const toScreen = (wx: number, wy: number): [number, number] => [
    (wx * TILE - cam.x) * zoom,
    (wy * TILE - cam.y) * zoom,
  ];

  // Build the light list: player's failing torch + campfires + explosions.
  const p = world.player;
  const lights: { x: number; y: number; r: number; color: string }[] = [
    { x: p.pos.x, y: p.pos.y, r: night ? 7 : 10, color: "rgba(255,225,170," },
  ];
  for (const pr of world.props) {
    if (pr.kind === "campfire") lights.push({ x: pr.pos.x + 0.5, y: pr.pos.y + 0.5, r: 6, color: "rgba(255,180,90," });
  }

  // 1. Compose the darkness overlay on its OWN canvas, then punch light holes in
  //    it, then blit it over the world. (Punching holes on the world canvas would
  //    erase the world itself — Canvas 2D is a single layer.)
  if (!lightCanvas || lightCanvas.width !== viewW || lightCanvas.height !== viewH) {
    lightCanvas = document.createElement("canvas");
    lightCanvas.width = viewW;
    lightCanvas.height = viewH;
    lightCtx = lightCanvas.getContext("2d");
  }
  const lc = lightCtx!;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, viewW, viewH);
  const dark = lc.createLinearGradient(0, 0, 0, viewH);
  const topA = veil * 0.97;
  dark.addColorStop(0, `rgba(4,6,9,${topA})`);
  dark.addColorStop(1, `rgba(2,4,7,${Math.min(0.99, topA + 0.02)})`);
  lc.fillStyle = dark;
  lc.fillRect(0, 0, viewW, viewH);
  lc.globalCompositeOperation = "destination-out";
  for (const l of lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const rr2 = l.r * TILE * zoom;
    const spr = discSprite(`hole${Math.round(l.r)}`, 128, [
      [0, "rgba(0,0,0,1)"],
      [0.5, "rgba(0,0,0,0.72)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    lc.drawImage(spr, sx - rr2, sy - rr2, rr2 * 2, rr2 * 2);
  }
  lc.globalCompositeOperation = "source-over";
  g.drawImage(lightCanvas, 0, 0);

  // 2. Warm additive tint inside the pools so light feels colored, not just "less dark".
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const l of lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const rr2 = l.r * TILE * zoom * 0.8;
    const a = night ? 0.16 : 0.08;
    const spr = discSprite(`warm${l.color}`, 128, [
      [0, `${l.color}${a})`],
      [1, `${l.color}0)`],
    ]);
    g.drawImage(spr, sx - rr2, sy - rr2, rr2 * 2, rr2 * 2);
  }
  // Explosions / muzzle flashes passed in.
  for (const l of extraLights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const rr2 = l.r * TILE * zoom;
    const spr = discSprite(`fx${l.color}`, 128, [
      [0, `${l.color}0.9)`],
      [1, `${l.color}0)`],
    ]);
    g.drawImage(spr, sx - rr2, sy - rr2, rr2 * 2, rr2 * 2);
  }
  g.restore();

  // 3. Vignette — always, heavier at night.
  const vig = discSprite("vig", 256, [
    [0, "rgba(0,0,0,0)"],
    [0.6, "rgba(0,0,0,0)"],
    [1, `rgba(0,0,0,${0.55 + veil * 0.3})`],
  ]);
  g.drawImage(vig, 0, 0, viewW, viewH);

  // 4. Low-HP blood pulse + infection tint.
  const hpFrac = p.hp / p.maxHp;
  if (hpFrac < 0.35 && p.alive) {
    const pulse = 0.2 + Math.sin(Date.now() / 260) * 0.12;
    g.fillStyle = `rgba(120,10,10,${(0.35 - hpFrac) * pulse * 3})`;
    g.fillRect(0, 0, viewW, viewH);
  }
  if (p.infection > 40) {
    g.fillStyle = `rgba(90,120,40,${(p.infection - 40) / 400})`;
    g.fillRect(0, 0, viewW, viewH);
  }
}

// --- shape helpers ---
function box(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string, edge: string): void {
  const h = size / 2;
  g.fillStyle = fill;
  g.fillRect(cx - h, cy - h, size, size);
  g.strokeStyle = edge;
  g.lineWidth = 2;
  g.strokeRect(cx - h, cy - h, size, size);
  g.beginPath();
  g.moveTo(cx - h, cy - h);
  g.lineTo(cx + h, cy + h);
  g.moveTo(cx + h, cy - h);
  g.lineTo(cx - h, cy + h);
  g.stroke();
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
