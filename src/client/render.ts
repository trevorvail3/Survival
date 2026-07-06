/**
 * src/client/render.ts
 * --------------------
 * Canvas 2D renderer — no image assets. Tiles, props, the risen dead and the
 * survivor are drawn procedurally. Engine techniques lifted from the sibling
 * `world` project: hash-noise terrain tinting so ground melts together, a cached
 * radial-gradient `discSprite` for soft glows, and a screen-space day/night veil
 * with warm light pools punched into its OWN layer (so light reveals the world,
 * not the void). For Ashfall the dark is the antagonist.
 *
 * RULE: the renderer only READS the world.
 */

import type { Content, Enemy, GroundItem, Prop, TileType, WeaponKind, World } from "../core/types.ts";
import { daylight, isNight } from "../core/world.ts";
import { hashStr } from "../core/rng.ts";
import { drawSurvivor, DEFAULT_LOOK, type AvatarAnim } from "./avatar.ts";
import { itemIconSVG } from "./itemIcon.ts";

export const TILE = 30;

export interface Camera { x: number; y: number; }

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

// Bridge an SVG string (e.g. an item icon) onto the canvas world as a cached
// <img>, drawn once the browser has decoded it.
const svgImgCache = new Map<string, HTMLImageElement>();
function svgImg(key: string, svg: string): HTMLImageElement {
  let img = svgImgCache.get(key);
  if (!img) {
    img = new Image();
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    svgImgCache.set(key, img);
  }
  return img;
}
// Each gather node shows the ACTUAL item it yields (the same icon as in your pack).
const NODE_ITEM: Record<string, string> = { tree: "wood", rock: "iron_ore", fishpool: "raw_fish", herbs: "herb" };

const TILE_COLORS: Record<TileType, [string, string]> = {
  grass: ["#33402a", "#28331f"],
  path: ["#4a3d2a", "#3a2f20"],
  dirt: ["#3b3020", "#2c2418"],
  cobble: ["#41414a", "#33333a"],
  stonefloor: ["#3c372d", "#2d2920"],
  field: ["#4a3b28", "#392d1e"],
  wall: ["#4c443a", "#2e2822"],
  gate: ["#5a4630", "#3a2c1c"],
  water: ["#1b3947", "#122630"],
  forest: ["#1b2a19", "#122012"],
  rubble: ["#37342c", "#26231d"],
  grave: ["#31342f", "#242724"],
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
function tileNoise(x: number, y: number): number {
  const h = hashStr(`${x},${y}`);
  const a = ((h & 0xff) / 255) * 2 - 1;
  const b = (((h >> 8) & 0xff) / 255) * 2 - 1;
  return a * 0.7 + b * 0.3;
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function tileAt(world: World, x: number, y: number): TileType {
  if (x < 0 || y < 0 || x >= world.map.w || y >= world.map.h) return "wall";
  return world.map.tiles[y * world.map.w + x]!;
}

// --- Organic ground blending (technique lifted from the sibling `world`
// project's renderer) -------------------------------------------------------
// Painting each tile a single flat colour reads as a hard checkerboard where
// loose ground types meet. Instead each tile is filled as four corner-keyed
// sub-quads; a corner takes the averaged colour of the (up to) four tiles that
// share it, so neighbouring patches of grass/dirt/path/etc melt into one
// another with no seams, at zero extra texture cost. Built/blocking surfaces
// (wall, gate, cobble, stonefloor, water, forest) keep their own crisp,
// hand-tuned painters below and are untouched by this.
const BLEND_GROUND = new Set<TileType>(["grass", "dirt", "path", "field", "rubble", "grave", "blood"]);

/** Corner-shared noise: identical for every tile meeting at (x,y), so shading
 *  is seamless across the grid rather than jittering per tile. */
function cornerNoise(x: number, y: number): number {
  return (hashStr(`c${x},${y}`) & 0xff) / 255;
}

/** The blended colour at one corner of tile (x,y): the average of the same-
 *  family neighbours meeting there (others count as the tile's own colour). */
function cornerColor(world: World, x: number, y: number, cx: 0 | 1, cy: 0 | 1, self: TileType, family: Set<TileType>, noiseAmp: number): string {
  const selfRGB = tileRGB(TILE_COLORS[self][0]);
  let r = 0, gg = 0, b = 0;
  for (const dy of [cy - 1, cy]) {
    for (const dx of [cx - 1, cx]) {
      const t = tileAt(world, x + dx, y + dy);
      const c = family.has(t) ? tileRGB(TILE_COLORS[t][0]) : selfRGB;
      r += c[0]; gg += c[1]; b += c[2];
    }
  }
  const n = (cornerNoise(x + cx, y + cy) - 0.5) * noiseAmp;
  return `rgb(${clamp(r / 4 + n)},${clamp(gg / 4 + n)},${clamp(b / 4 + n)})`;
}

/** Fill a tile as four corner-keyed sub-quads instead of one flat rect. */
function paintBlendedBase(g: CanvasRenderingContext2D, world: World, tile: TileType, px: number, py: number, x: number, y: number): void {
  const half = TILE / 2;
  for (const cy of [0, 1] as const) {
    for (const cx of [0, 1] as const) {
      g.fillStyle = cornerColor(world, x, y, cx, cy, tile, BLEND_GROUND, 22);
      g.fillRect(px + cx * half, py + cy * half, half, half);
    }
  }
}

function paintTile(g: CanvasRenderingContext2D, world: World, x: number, y: number): void {
  const t = tileAt(world, x, y);
  const [base] = TILE_COLORS[t];
  const [r, gg, b] = tileRGB(base);
  const n = tileNoise(x, y) * 9;
  const px = x * TILE, py = y * TILE;
  const hh = hashStr(`d${x},${y}`);

  if (t === "wall") {
    g.fillStyle = `rgb(${clamp(r + n)},${clamp(gg + n)},${clamp(b + n)})`;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(px, py, TILE, 3);
    g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(px, py + TILE - 4, TILE, 4);
    // mortar seams
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE / 2);
    return;
  }
  if (t === "forest") {
    g.fillStyle = `rgb(${clamp(r + n)},${clamp(gg + n)},${clamp(b + n)})`;
    g.fillRect(px, py, TILE, TILE);
    // clustered foliage blobs
    for (let i = 0; i < 3; i++) {
      const bx = px + 6 + ((hh >> (i * 4)) % (TILE - 12));
      const by = py + 6 + ((hh >> (i * 3 + 1)) % (TILE - 12));
      g.fillStyle = i % 2 ? "rgba(40,60,32,0.7)" : "rgba(20,34,18,0.7)";
      g.beginPath(); g.arc(bx, by, 6, 0, Math.PI * 2); g.fill();
    }
    return;
  }

  if (BLEND_GROUND.has(t)) paintBlendedBase(g, world, t, px, py, x, y);
  else { g.fillStyle = `rgb(${clamp(r + n)},${clamp(gg + n)},${clamp(b + n)})`; g.fillRect(px, py, TILE, TILE); }

  switch (t) {
    case "grass":
      g.strokeStyle = "rgba(110,140,80,0.28)"; g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const bx = px + ((hh >> (i * 3)) % TILE), by = py + ((hh >> (i * 2 + 1)) % TILE);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 1, by - 3); g.stroke();
      }
      break;
    case "field":
      g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 2;
      for (let fy = 4; fy < TILE; fy += 7) { g.beginPath(); g.moveTo(px, py + fy); g.lineTo(px + TILE, py + fy); g.stroke(); }
      break;
    case "cobble":
    case "stonefloor":
      g.fillStyle = "rgba(0,0,0,0.18)";
      for (let i = 0; i < 3; i++) g.fillRect(px + ((hh >> (i * 5)) % (TILE - 6)), py + ((hh >> (i * 3)) % (TILE - 6)), 5, 5);
      break;
    case "path":
    case "dirt":
      if ((hh & 3) === 0) { g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(px + (hh % TILE), py + ((hh >> 4) % TILE), 2, 2); }
      break;
    case "water":
      g.fillStyle = "rgba(90,150,160,0.07)"; g.fillRect(px + 2, py + ((hh % 3) + 4), TILE - 4, 2);
      break;
    case "grave":
      // small leaning headstone
      g.fillStyle = "rgba(120,120,115,0.5)";
      g.fillRect(px + TILE / 2 - 3, py + TILE / 2 - 5, 6, 9);
      g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(px + TILE / 2 - 3, py + TILE / 2 + 3, 6, 2);
      break;
    case "rubble":
      g.fillStyle = "rgba(0,0,0,0.3)";
      for (let i = 0; i < 4; i++) g.fillRect(px + ((hh >> (i * 4)) % (TILE - 4)), py + ((hh >> (i * 3 + 2)) % (TILE - 4)), 3, 3);
      break;
    case "blood":
      g.fillStyle = "rgba(120,20,15,0.4)";
      g.beginPath(); g.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.4, TILE * 0.3, 0, 0, Math.PI * 2); g.fill();
      break;
    default: break;
  }
}

// --- Props ---
function drawProp(g: CanvasRenderingContext2D, pr: Prop, now: number, content: Content): void {
  const cx = (pr.pos.x + 0.5) * TILE, cy = (pr.pos.y + 0.5) * TILE;
  const depleted = pr.used;
  g.save();
  switch (pr.kind) {
    case "chest":
      g.globalAlpha = depleted ? 0.55 : 1;
      g.fillStyle = "#5a4327"; rr(g, cx - TILE * 0.32, cy - TILE * 0.2, TILE * 0.64, TILE * 0.4, 3); g.fill();
      g.strokeStyle = "#2a1d10"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#8a6a3a"; g.fillRect(cx - TILE * 0.32, cy - TILE * 0.04, TILE * 0.64, 3);
      g.fillStyle = "#c8b06a"; g.fillRect(cx - 2, cy - 2, 4, 5);
      break;
    case "crate":
      g.globalAlpha = depleted ? 0.55 : 1;
      box(g, cx, cy, TILE * 0.6, "#6a4e2c", "#3a2c19");
      break;
    case "barrel":
      g.globalAlpha = depleted ? 0.55 : 1;
      g.fillStyle = "#5a3a22"; g.beginPath(); g.arc(cx, cy, TILE * 0.28, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#2e1d10"; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "#8a6a3a"; g.beginPath(); g.arc(cx, cy, TILE * 0.17, 0, Math.PI * 2); g.stroke();
      break;
    case "remains":
      g.globalAlpha = depleted ? 0.4 : 1;
      g.fillStyle = "#b8b0a0";
      for (let i = 0; i < 4; i++) { const a = i * 1.6; g.fillRect(cx + Math.cos(a) * 5 - 1, cy + Math.sin(a) * 4 - 1, 6, 2); }
      g.fillStyle = "#d8d0c0"; g.beginPath(); g.arc(cx - 4, cy, 3, 0, Math.PI * 2); g.fill();
      break;
    case "cart":
      g.fillStyle = "#4a3626"; rr(g, cx - TILE * 0.55, cy - TILE * 0.3, TILE * 1.1, TILE * 0.6, 3); g.fill();
      g.strokeStyle = "#241a10"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#2a1d12"; g.beginPath(); g.arc(cx - TILE * 0.35, cy + TILE * 0.3, 5, 0, Math.PI * 2); g.arc(cx + TILE * 0.35, cy + TILE * 0.3, 5, 0, Math.PI * 2); g.fill();
      break;
    case "forge": {
      // Anvil + a banked fire (a light source).
      const fl = 0.6 + Math.sin(now / 140) * 0.25;
      g.fillStyle = "#2a2420"; rr(g, cx - TILE * 0.5, cy - TILE * 0.3, TILE, TILE * 0.6, 3); g.fill();
      g.fillStyle = `rgba(230,120,40,${0.7 * fl})`; g.beginPath(); g.arc(cx - TILE * 0.22, cy, TILE * 0.14 * fl, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3a3e44"; rr(g, cx + TILE * 0.05, cy - 5, TILE * 0.34, 9, 2); g.fill();
      break;
    }
    case "workbench":
      g.fillStyle = "#5a4228"; g.fillRect(cx - TILE * 0.5, cy - TILE * 0.22, TILE, TILE * 0.44);
      g.strokeStyle = "#2a1d12"; g.lineWidth = 2; g.strokeRect(cx - TILE * 0.5, cy - TILE * 0.22, TILE, TILE * 0.44);
      g.fillStyle = "#7d858c"; g.fillRect(cx - TILE * 0.3, cy - TILE * 0.1, TILE * 0.2, 4);
      g.fillStyle = "#8a6a3a"; g.fillRect(cx + TILE * 0.12, cy - 2, TILE * 0.24, 4);
      break;
    case "hearth": {
      const fl = 0.6 + Math.sin(now / 120) * 0.2 + Math.sin(now / 57) * 0.1;
      g.fillStyle = "#2a221a"; g.beginPath(); g.arc(cx, cy, TILE * 0.36, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#4a4038"; for (let i = 0; i < 6; i++) { const a = i; g.fillRect(cx + Math.cos(a) * TILE * 0.3 - 2, cy + Math.sin(a) * TILE * 0.3 - 2, 5, 5); }
      g.fillStyle = `rgba(230,120,40,${0.75 * fl})`;
      g.beginPath(); g.moveTo(cx, cy - TILE * 0.4 * fl); g.lineTo(cx - TILE * 0.16, cy + TILE * 0.1); g.lineTo(cx + TILE * 0.16, cy + TILE * 0.1); g.closePath(); g.fill();
      g.fillStyle = `rgba(255,210,120,${0.85 * fl})`; g.beginPath(); g.arc(cx, cy, TILE * 0.12 * fl, 0, Math.PI * 2); g.fill();
      break;
    }
    case "townboard":
      g.fillStyle = "#5a4228"; g.fillRect(cx - 3, cy - TILE * 0.1, 6, TILE * 0.5);
      g.fillStyle = "#6a5232"; rr(g, cx - TILE * 0.34, cy - TILE * 0.42, TILE * 0.68, TILE * 0.36, 2); g.fill();
      g.strokeStyle = "#2a1d12"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#c8b06a"; for (let i = 0; i < 3; i++) g.fillRect(cx - TILE * 0.26, cy - TILE * 0.36 + i * 5, TILE * 0.5, 1.5);
      break;
    case "tree":
    case "rock":
    case "herbs":
    case "fishpool": {
      // The node shows the ACTUAL item icon it yields (ore = knucklestone, etc).
      const itemId = NODE_ITEM[pr.kind]!;
      const def = content.items[itemId];
      // A soft ground disc marks it as a workable node; ripple for fishing.
      const disc = discSprite("noded", 32, [[0, "rgba(0,0,0,0.4)"], [1, "rgba(0,0,0,0)"]]);
      g.globalAlpha = depleted ? 0.4 : 1;
      g.drawImage(disc, cx - TILE * 0.5, cy - TILE * 0.32, TILE, TILE * 0.7);
      if (pr.kind === "fishpool" && !depleted) {
        g.strokeStyle = "rgba(120,170,196,0.5)"; g.lineWidth = 1.2;
        for (let i = 1; i <= 2; i++) { g.beginPath(); g.arc(cx, cy + TILE * 0.24, i * 4 + Math.sin(now / 500 + i) * 1.2, 0, Math.PI * 2); g.stroke(); }
      }
      const img = def ? svgImg(`node-${itemId}`, itemIconSVG(def)) : null;
      const s = TILE * (depleted ? 0.66 : 0.95);
      const bob = depleted ? 0 : Math.sin(now / 720 + cx) * 1.3;
      if (img && img.complete && img.naturalWidth) g.drawImage(img, cx - s / 2, cy - s / 2 + bob, s, s);
      else { g.fillStyle = "#8a7a5a"; g.globalAlpha *= 0.5; g.beginPath(); g.arc(cx, cy, TILE * 0.2, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case "survivor":
      if (!depleted) {
        // A kneeling figure with a faint hopeful glow.
        const spr = discSprite("rescue", 40, [[0, "rgba(120,180,220,0.35)"], [1, "rgba(120,180,220,0)"]]);
        g.globalAlpha = 0.6 + Math.sin(now / 400) * 0.2;
        g.drawImage(spr, cx - 20, cy - 20, 40, 40);
        g.globalAlpha = 1;
        g.fillStyle = "#6b5a44"; g.beginPath(); g.ellipse(cx, cy + 4, TILE * 0.2, TILE * 0.24, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#caa07a"; g.beginPath(); g.arc(cx, cy - TILE * 0.12, TILE * 0.13, 0, Math.PI * 2); g.fill();
      }
      break;
    case "stash": {
      // A big banded storage chest (distinct from lootable chests).
      g.fillStyle = "#4a3620"; rr(g, cx - TILE * 0.42, cy - TILE * 0.28, TILE * 0.84, TILE * 0.56, 3); g.fill();
      g.strokeStyle = "#20160c"; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = "#2a1d10"; g.fillRect(cx - TILE * 0.42, cy - TILE * 0.02, TILE * 0.84, 4);
      g.strokeStyle = "#8a6a3a"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - TILE * 0.22, cy - TILE * 0.28); g.lineTo(cx - TILE * 0.22, cy + TILE * 0.28); g.moveTo(cx + TILE * 0.22, cy - TILE * 0.28); g.lineTo(cx + TILE * 0.22, cy + TILE * 0.28); g.stroke();
      g.fillStyle = "#caa24a"; g.fillRect(cx - 2, cy - 2, 4, 6);
      break;
    }
    case "maptable": {
      // A cartographer's table: legs, a parchment map, and a few markers.
      g.fillStyle = "#4a3826";
      g.fillRect(cx - TILE * 0.5, cy - TILE * 0.32, TILE, TILE * 0.64);
      g.strokeStyle = "#241a10"; g.lineWidth = 2; g.strokeRect(cx - TILE * 0.5, cy - TILE * 0.32, TILE, TILE * 0.64);
      g.fillStyle = "#c9b98a"; // parchment
      g.fillRect(cx - TILE * 0.4, cy - TILE * 0.24, TILE * 0.8, TILE * 0.48);
      g.strokeStyle = "rgba(90,60,30,0.5)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - TILE * 0.28, cy - TILE * 0.1); g.lineTo(cx + TILE * 0.2, cy + TILE * 0.06); g.stroke();
      g.fillStyle = "#8e2b23";
      g.beginPath(); g.arc(cx - TILE * 0.18, cy - TILE * 0.08, 2, 0, Math.PI * 2); g.arc(cx + TILE * 0.16, cy + TILE * 0.08, 2, 0, Math.PI * 2); g.fill();
      break;
    }
    case "waystone": {
      // A standing carved stone — the road out (and home).
      g.fillStyle = "#5a5750";
      g.beginPath();
      g.moveTo(cx - TILE * 0.2, cy + TILE * 0.28);
      g.lineTo(cx - TILE * 0.16, cy - TILE * 0.34);
      g.lineTo(cx + TILE * 0.16, cy - TILE * 0.34);
      g.lineTo(cx + TILE * 0.2, cy + TILE * 0.28);
      g.closePath(); g.fill();
      g.strokeStyle = "#2c2a26"; g.lineWidth = 2; g.stroke();
      const gl = 0.5 + Math.sin(now / 260) * 0.3;
      g.strokeStyle = `rgba(120,180,220,${gl})`; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy - TILE * 0.05, TILE * 0.1, 0, Math.PI * 2); g.moveTo(cx, cy - TILE * 0.18); g.lineTo(cx, cy + TILE * 0.1); g.stroke();
      break;
    }
    case "gate":
      break;
  }
  g.restore();
}

// --- The risen ---
function drawEnemy(g: CanvasRenderingContext2D, e: Enemy, now: number): void {
  if (e.state === "dead") return;
  const cx = e.pos.x * TILE, cy = e.pos.y * TILE;
  const active = e.state === "hunt" || e.state === "attack";
  const bob = active ? Math.sin(now / 90 + e.seed) * 2 : Math.sin(now / 400 + e.seed) * 1;

  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(cx, cy + TILE * 0.18, TILE * 0.32, TILE * 0.16, 0, 0, Math.PI * 2); g.fill();

  g.save();
  g.translate(cx, cy + bob);
  g.rotate(e.facing + Math.PI / 2);
  const R = (u: number) => u * TILE;
  const hurt = now < e.staggerUntil;

  if (e.kind === "hound") {
    // Low, elongated quadruped.
    g.fillStyle = hurt ? "#8e2b23" : "#4a3a2e";
    g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = R(0.03);
    g.beginPath(); g.ellipse(0, 0, R(0.22), R(0.4), 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = hurt ? "#8e2b23" : "#5a4636";
    g.beginPath(); g.arc(0, R(-0.4), R(0.16), 0, Math.PI * 2); g.fill(); // head forward
    g.fillStyle = "rgba(200,60,40,0.8)"; g.beginPath(); g.arc(R(-0.06), R(-0.44), R(0.03), 0, Math.PI * 2); g.arc(R(0.06), R(-0.44), R(0.03), 0, Math.PI * 2); g.fill();
    g.restore();
    return;
  }

  let body: string, head: string, size: number;
  switch (e.kind) {
    case "risen": body = "#3f4a34"; head = "#5a6a48"; size = 0.32; break;
    case "wretch": body = "#5a4a3a"; head = "#7a6a4a"; size = 0.46; break;
    case "revenant": body = "#4a4e54"; head = "#6a707a"; size = 0.44; break;
    case "graveking": body = "#33373e"; head = "#565d66"; size = 0.72; break;
    case "prior": body = "#2c2a34"; head = "#c9c1b6"; size = 0.58; break;
    case "rotmother": body = "#4a5230"; head = "#6a7038"; size = 1.0; break;
    default: body = "#444"; head = "#666"; size = 0.32;
  }
  if (hurt) body = "#8e2b23";

  // Bosses drag a baleful aura — red King, green Prior, putrid Rot-Mother.
  if (e.boss) {
    const auraCol: Record<string, [number, string][]> = {
      prior: [[0, "rgba(120,150,60,0.4)"], [1, "rgba(120,150,60,0)"]],
      rotmother: [[0, "rgba(110,140,40,0.5)"], [1, "rgba(110,140,40,0)"]],
    };
    const stops = auraCol[e.kind] ?? [[0, "rgba(180,30,20,0.4)"], [1, "rgba(180,30,20,0)"]];
    const aura = discSprite(`aura_${e.kind}`, 64, stops);
    const s = R(e.kind === "rotmother" ? 2.4 : 1.6);
    g.drawImage(aura, -s, -s, s * 2, s * 2);
  }

  g.fillStyle = body; g.strokeStyle = "rgba(0,0,0,0.42)"; g.lineWidth = R(0.03);
  g.beginPath(); g.ellipse(0, 0, R(size), R(size * 1.15), 0, 0, Math.PI * 2); g.fill(); g.stroke();

  if (active) {
    g.strokeStyle = body; g.lineWidth = R(0.1); g.lineCap = "round";
    const reach = e.state === "attack" ? R(0.5) : R(0.4);
    g.beginPath();
    g.moveTo(R(-size * 0.6), R(-size * 0.2)); g.lineTo(R(-0.1), -reach);
    g.moveTo(R(size * 0.6), R(-size * 0.2)); g.lineTo(R(0.1), -reach);
    g.stroke();
  }
  g.fillStyle = head; g.beginPath(); g.arc(0, R(-size * 0.7), R(size * 0.55), 0, Math.PI * 2); g.fill();
  if (e.kind === "revenant") {
    // A dented helm + faint blade.
    g.fillStyle = "#33373c"; g.beginPath(); g.arc(0, R(-size * 0.72), R(size * 0.5), Math.PI, Math.PI * 2); g.fill();
    g.strokeStyle = "#7d858c"; g.lineWidth = R(0.05); g.beginPath(); g.moveTo(R(size * 0.7), R(-0.1)); g.lineTo(R(size * 0.7), R(-0.7)); g.stroke();
  }
  if (e.kind === "graveking") {
    // Iron helm, a jagged crown, and a great blade.
    g.fillStyle = "#2a2d33"; g.beginPath(); g.arc(0, R(-size * 0.72), R(size * 0.5), Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = "#c8922e";
    g.beginPath();
    const cy2 = R(-size * 1.05), cw = R(size * 0.5);
    g.moveTo(-cw, cy2 + R(0.12)); g.lineTo(-cw, cy2); g.lineTo(-cw * 0.5, cy2 + R(0.1)); g.lineTo(0, cy2 - R(0.06)); g.lineTo(cw * 0.5, cy2 + R(0.1)); g.lineTo(cw, cy2); g.lineTo(cw, cy2 + R(0.12));
    g.closePath(); g.fill();
    g.strokeStyle = "#b9c0c8"; g.lineWidth = R(0.08); g.lineCap = "round";
    g.beginPath(); g.moveTo(R(size * 0.85), R(0.2)); g.lineTo(R(size * 0.85), R(-1.0)); g.stroke();
  }
  if (e.kind === "rotmother") {
    // A bloated, many-eyed horror — pustules and weeping sores.
    g.fillStyle = "#3a4426";
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + e.seed; g.beginPath(); g.arc(R(Math.cos(a) * size * 0.6), R(Math.sin(a) * size * 0.6), R(0.16), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#c8d84a";
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + e.seed; g.beginPath(); g.arc(R(Math.cos(a) * size * 0.5), R(Math.sin(a) * size * 0.5 - 0.3), R(0.05), 0, Math.PI * 2); g.fill(); }
  }
  if (e.kind === "prior") {
    // A pointed cowl and a tall staff crowned with a sickly light.
    g.fillStyle = "#1e1c26";
    g.beginPath();
    g.moveTo(0, R(-size * 1.35)); g.lineTo(R(-size * 0.5), R(-size * 0.55)); g.lineTo(R(size * 0.5), R(-size * 0.55)); g.closePath(); g.fill();
    g.strokeStyle = "#5a4a2a"; g.lineWidth = R(0.06); g.lineCap = "round";
    g.beginPath(); g.moveTo(R(size * 0.8), R(0.3)); g.lineTo(R(size * 0.8), R(-0.95)); g.stroke();
    g.fillStyle = "rgba(150,190,80,0.9)";
    g.beginPath(); g.arc(R(size * 0.8), R(-1.0), R(0.12), 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "rgba(190,210,120,0.85)";
  g.beginPath(); g.arc(R(-size * 0.2), R(-size * 0.75), R(0.04), 0, Math.PI * 2); g.arc(R(size * 0.2), R(-size * 0.75), R(0.04), 0, Math.PI * 2); g.fill();
  g.restore();

  // Overhead health bar for wounded rank-and-file (bosses use the big HUD bar).
  if (!e.boss && e.hp < e.maxHp) {
    const bw = TILE * 0.7, bx = cx - bw / 2, by = cy - TILE * 0.62;
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(bx - 1, by - 1, bw + 2, 5);
    g.fillStyle = "#8e2b23"; g.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3);
  }
}

function drawGround(g: CanvasRenderingContext2D, gi: GroundItem, now: number): void {
  const cx = gi.pos.x * TILE, cy = gi.pos.y * TILE;
  const pulse = 0.6 + Math.sin(now / 300 + gi.id) * 0.2;
  const glow = discSprite("loot", 24, [[0, "rgba(220,180,90,0.5)"], [1, "rgba(220,180,90,0)"]]);
  g.globalAlpha = pulse; g.drawImage(glow, cx - 12, cy - 12, 24, 24); g.globalAlpha = 1;
  g.fillStyle = "#d8b45a"; g.strokeStyle = "#2a2015"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx, cy - 4); g.lineTo(cx + 4, cy); g.lineTo(cx, cy + 4); g.lineTo(cx - 4, cy); g.closePath(); g.fill(); g.stroke();
}

// Which role a settler figure shows, by index against the assigned counts.
function settlerRole(world: World, i: number): "gatherer" | "forager" | "guard" | "idle" {
  const r = world.settlement.roles;
  if (i < r.gatherer) return "gatherer";
  if (i < r.gatherer + r.forager) return "forager";
  if (i < r.gatherer + r.forager + r.guard) return "guard";
  return "idle";
}
const SETTLER_SKIN = ["#c99873", "#b98b6a", "#a97a52", "#d0a785"];

/** The rescued, milling about inside the walls — names above, role-tinted. */
function drawSettlers(g: CanvasRenderingContext2D, world: World, now: number): void {
  const st = world.settlement, h = world.home;
  const jacketOf: Record<string, string> = { gatherer: "#6b5236", forager: "#4f6a3a", guard: "#3c4650", idle: "#5a4636" };
  for (let i = 0; i < st.population; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const bx = h.x + 4 + col * 3.2, by = h.y + h.h - 4 + row * 2.2;
    const t = now / 1500 + i * 1.7;
    const wx = bx + Math.cos(t) * 0.5, wy = by + Math.sin(t * 1.3) * 0.35;
    const role = settlerRole(world, i);
    const look = { skin: SETTLER_SKIN[i % SETTLER_SKIN.length]!, jacket: jacketOf[role]!, hood: "#3a3020", pack: "#4a3826" };
    drawSurvivor(g, wx * TILE, wy * TILE, TILE * 0.8, Math.sin(t) * 0.6 + Math.PI / 2, look, { now, moving: true }, "fist");
    const name = st.names[i] ?? "Survivor";
    g.font = "600 10px Cinzel, serif"; g.textAlign = "center";
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillText(name, wx * TILE + 1, (wy - 0.62) * TILE + 1);
    g.fillStyle = "#d8cbb0"; g.fillText(name, wx * TILE, (wy - 0.62) * TILE);
    g.textAlign = "left";
  }
}

const ARMOR_TONE: Record<string, string> = { leather: "#6e4a2c", iron: "#8a9096", steel: "#b6bcc4" };
function weaponKindOf(world: World, content: Content): WeaponKind {
  const def = world.player.equipped ? content.items[world.player.equipped.id] : undefined;
  return def?.weapon?.kind ?? "fist";
}
function armorToneOf(world: World, content: Content): string | null {
  const def = world.player.armor ? content.items[world.player.armor.id] : undefined;
  if (!def) return null;
  return ARMOR_TONE[def.material ?? ""] ?? "#8a9096";
}

export function drawWorld(
  g: CanvasRenderingContext2D, world: World, content: Content, cam: Camera,
  now: number, viewW: number, viewH: number, zoom: number,
): void {
  g.save();
  g.setTransform(zoom, 0, 0, zoom, -cam.x * zoom, -cam.y * zoom);
  const minX = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const minY = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const maxX = Math.min(world.map.w - 1, Math.ceil((cam.x + viewW / zoom) / TILE) + 1);
  const maxY = Math.min(world.map.h - 1, Math.ceil((cam.y + viewH / zoom) / TILE) + 1);

  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) paintTile(g, world, x, y);
  for (const gi of world.ground) drawGround(g, gi, now);
  for (const pr of world.props) {
    if (pr.pos.x < minX - 1 || pr.pos.x > maxX + 1 || pr.pos.y < minY - 1 || pr.pos.y > maxY + 1) continue;
    drawProp(g, pr, now, content);
  }
  for (const e of world.enemies) {
    if (e.pos.x < minX - 2 || e.pos.x > maxX + 2 || e.pos.y < minY - 2 || e.pos.y > maxY + 2) continue;
    drawEnemy(g, e, now);
  }

  if (world.zoneId === "home" && world.settlement.population > 0) drawSettlers(g, world, now);

  const p = world.player;

  // Target reticle around the foe you're locked onto.
  const ord = p.order;
  if (ord.type === "attack") {
    const tgt = world.enemies.find((e) => e.id === ord.enemyId && e.state !== "dead");
    if (tgt) {
      const rx = tgt.pos.x * TILE, ry = tgt.pos.y * TILE, rr2 = TILE * 0.62;
      g.strokeStyle = "rgba(200,60,44,0.9)"; g.lineWidth = 2;
      const t = now / 500;
      for (let i = 0; i < 4; i++) {
        const a = t + (i * Math.PI) / 2;
        g.beginPath();
        g.arc(rx, ry, rr2, a, a + 0.6);
        g.stroke();
      }
    }
  }

  if (p.alive) {
    // Dodge i-frame flash: a pale ring while invulnerable.
    if (world.clock < p.invulnUntil) {
      g.strokeStyle = "rgba(180,210,235,0.7)"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(p.pos.x * TILE, p.pos.y * TILE, TILE * 0.5, 0, Math.PI * 2); g.stroke();
    }
    const anim: AvatarAnim = { now, moving: p.path.length > 0 };
    const since = p.nextAttack - world.clock;
    if (since > 0) anim.swing = Math.min(1, Math.max(0, since / 240));
    drawSurvivor(g, p.pos.x * TILE, p.pos.y * TILE, TILE, p.facing, DEFAULT_LOOK, anim, weaponKindOf(world, content), armorToneOf(world, content));
  }
  g.restore();
}

// --- Lighting (own layer so light reveals the world) ---
let lightCanvas: HTMLCanvasElement | null = null;
let lightCtx: CanvasRenderingContext2D | null = null;

// Per-region colour grade — a subtle multiply wash so each place reads with its
// own palette even before you notice the terrain. Home has no tint (neutral).
const REGION_TINT: Record<string, string> = {
  woods: "#b6cf9e", abbey: "#b2bccb", mire: "#c2c88c", barrows: "#a6afc6", heart: "#aec27e",
};

export function drawLighting(
  g: CanvasRenderingContext2D, world: World, cam: Camera,
  viewW: number, viewH: number, zoom: number,
  extraLights: { x: number; y: number; r: number; color: string }[],
  lightBonus = 0,
): void {
  const dl = daylight(world.timeOfDay);
  const night = isNight(world.timeOfDay);
  const veil = 1 - dl;
  const toScreen = (wx: number, wy: number): [number, number] => [(wx * TILE - cam.x) * zoom, (wy * TILE - cam.y) * zoom];

  const p = world.player;
  const lights: { x: number; y: number; r: number; color: string }[] = [
    { x: p.pos.x, y: p.pos.y, r: (night ? 7 : 10) + lightBonus, color: "rgba(255,225,170," },
  ];
  for (const pr of world.props) {
    if (pr.kind === "hearth" || pr.kind === "forge") lights.push({ x: pr.pos.x + 0.5, y: pr.pos.y + 0.5, r: pr.kind === "hearth" ? 6 : 4, color: "rgba(255,180,90," });
  }

  if (!lightCanvas || lightCanvas.width !== viewW || lightCanvas.height !== viewH) {
    lightCanvas = document.createElement("canvas");
    lightCanvas.width = viewW; lightCanvas.height = viewH;
    lightCtx = lightCanvas.getContext("2d");
  }
  const lc = lightCtx!;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, viewW, viewH);
  const dark = lc.createLinearGradient(0, 0, 0, viewH);
  const topA = veil * 0.97;
  dark.addColorStop(0, `rgba(4,6,9,${topA})`);
  dark.addColorStop(1, `rgba(2,4,7,${Math.min(0.99, topA + 0.02)})`);
  lc.fillStyle = dark; lc.fillRect(0, 0, viewW, viewH);
  lc.globalCompositeOperation = "destination-out";
  for (const l of lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const rr2 = l.r * TILE * zoom;
    const spr = discSprite(`hole${Math.round(l.r)}`, 128, [[0, "rgba(0,0,0,1)"], [0.5, "rgba(0,0,0,0.72)"], [1, "rgba(0,0,0,0)"]]);
    lc.drawImage(spr, sx - rr2, sy - rr2, rr2 * 2, rr2 * 2);
  }
  lc.globalCompositeOperation = "source-over";
  g.drawImage(lightCanvas, 0, 0);

  const tint = REGION_TINT[world.zoneId];
  if (tint) {
    g.save();
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = 0.5 + veil * 0.2;
    g.fillStyle = tint;
    g.fillRect(0, 0, viewW, viewH);
    g.restore();
  }

  g.save();
  g.globalCompositeOperation = "lighter";
  for (const l of lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const rr2 = l.r * TILE * zoom * 0.8;
    const a = night ? 0.16 : 0.08;
    const spr = discSprite(`warm${l.color}`, 128, [[0, `${l.color}${a})`], [1, `${l.color}0)`]]);
    g.drawImage(spr, sx - rr2, sy - rr2, rr2 * 2, rr2 * 2);
  }
  for (const l of extraLights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const rr2 = l.r * TILE * zoom;
    const spr = discSprite(`fx${l.color}`, 128, [[0, `${l.color}0.9)`], [1, `${l.color}0)`]]);
    g.drawImage(spr, sx - rr2, sy - rr2, rr2 * 2, rr2 * 2);
  }
  g.restore();

  const vig = discSprite("vig", 256, [[0, "rgba(0,0,0,0)"], [0.6, "rgba(0,0,0,0)"], [1, `rgba(0,0,0,${0.55 + veil * 0.3})`]]);
  g.drawImage(vig, 0, 0, viewW, viewH);

  const hpFrac = p.hp / p.maxHp;
  if (hpFrac < 0.35 && p.alive) {
    const pulse = 0.2 + Math.sin(Date.now() / 260) * 0.12;
    g.fillStyle = `rgba(120,10,10,${(0.35 - hpFrac) * pulse * 3})`;
    g.fillRect(0, 0, viewW, viewH);
  }
  if (p.infection > 40) { g.fillStyle = `rgba(90,120,40,${(p.infection - 40) / 400})`; g.fillRect(0, 0, viewW, viewH); }
}

// --- shape helpers ---
function box(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string, edge: string): void {
  const h = size / 2;
  g.fillStyle = fill; g.fillRect(cx - h, cy - h, size, size);
  g.strokeStyle = edge; g.lineWidth = 2; g.strokeRect(cx - h, cy - h, size, size);
  g.beginPath(); g.moveTo(cx - h, cy - h); g.lineTo(cx + h, cy + h); g.moveTo(cx + h, cy - h); g.lineTo(cx - h, cy + h); g.stroke();
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
