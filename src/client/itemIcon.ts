/**
 * src/client/itemIcon.ts
 * ----------------------
 * Procedural item icons — inline SVG on a 32×32 grid, no image files. The color
 * toolkit (hex↔rgb, mix, hsl, FNV hash, hashColor) and the `Pal`/`shadeFrom`
 * base/light/dark/edge/accent shading model are lifted from the sibling `world`
 * project's icon engine; the silhouettes are drawn fresh for Ashfall's salvage
 * roster. Deterministic (hash-driven, no rng/time) so results cache forever.
 */

import type { ItemDef } from "../core/types.ts";

// --- Color math (lifted, generic) ---
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(hex: string, target: string, amt: number): string {
  const [r, g, b] = hexRgb(hex);
  const [tr, tg, tb] = hexRgb(target);
  return rgbHex(r + (tr - r) * amt, g + (tg - g) * amt, b + (tb - b) * amt);
}
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

interface Pal { base: string; dark: string; light: string; edge: string; accent: string; }
function shadeFrom(base: string, accent?: string): Pal {
  return {
    base,
    dark: mix(base, "#000000", 0.36),
    light: mix(base, "#ffffff", 0.4),
    edge: mix(base, "#000000", 0.62),
    accent: accent ?? mix(base, "#ffffff", 0.55),
  };
}

// Material keyword → base tint. First match wins.
const MATS: Record<string, string> = {
  iron: "#6b6f74",
  steel: "#8a9096",
  gunmetal: "#4a4e54",
  blood: "#7c2f28",
  cloth: "#8a8172",
  wood: "#6b4e2e",
  glass: "#8fa6a2",
  tape: "#9a9488",
  powder: "#3a3a40",
  toxic: "#6f8a3c",
  brass: "#b08a3c",
  blue: "#3f6d8c",
  white: "#c8c6c0",
};

function paletteFor(def: ItemDef): Pal {
  const base = (def.material && MATS[def.material]) || MATS["steel"]!;
  return shadeFrom(base);
}

// --- Silhouettes (each parameterised only by palette + id seed) ---
const WOOD = "#5a4028";
const WOODX = "#2f2013";

function draw(shape: string, p: Pal, id: string): string {
  const r = (hash(id) % 9) - 4; // gentle per-item rotation for lumpy items
  switch (shape) {
    case "scrap":
      return `<g transform="rotate(${r} 16 16)"><polygon points="5,18 8,9 16,6 24,10 26,20 17,25 9,23" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4" stroke-linejoin="round"/><polygon points="8,9 16,6 17,14 10,16" fill="${p.light}"/><polygon points="17,14 24,10 26,20 18,21" fill="${p.dark}"/><line x1="12" y1="12" x2="20" y2="18" stroke="${p.edge}" stroke-width="0.8" opacity="0.6"/></g>`;
    case "cloth":
      return `<path d="M6,10 Q10,6 16,8 Q22,10 26,8 L25,22 Q20,26 14,24 Q9,22 6,24 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><path d="M9,12 Q16,14 24,11" stroke="${p.dark}" stroke-width="1" fill="none" opacity="0.6"/><path d="M8,17 Q15,19 24,16" stroke="${p.dark}" stroke-width="1" fill="none" opacity="0.5"/>`;
    case "wood":
      return `<g transform="rotate(${r} 16 16)"><rect x="6" y="12" width="20" height="7" rx="2" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><ellipse cx="25" cy="15.5" rx="1.8" ry="3" fill="${p.dark}"/><line x1="9" y1="14" x2="22" y2="14" stroke="${p.dark}" stroke-width="0.7" opacity="0.6"/><path d="M4,15 L7,12 M4,17 L7,19" stroke="${p.light}" stroke-width="1.4"/></g>`;
    case "bottle":
      return `<rect x="13" y="4" width="6" height="4" fill="${WOOD}"/><path d="M12,8 L20,8 L21,15 Q21,28 16,28 Q11,28 11,15 Z" fill="${p.base}" opacity="0.75" stroke="${p.edge}" stroke-width="1"/><rect x="12.5" y="18" width="7" height="8" rx="1" fill="${mix(p.base, '#ffffff', 0.15)}" opacity="0.5"/><ellipse cx="14" cy="20" rx="1" ry="3" fill="#ffffff" opacity="0.4"/>`;
    case "roll":
      return `<circle cx="16" cy="16" r="10" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4"/><circle cx="16" cy="16" r="4.5" fill="${p.dark}"/><circle cx="16" cy="16" r="4.5" fill="none" stroke="${p.edge}" stroke-width="1"/><path d="M6,16 A10 10 0 0 1 26 16" stroke="${p.light}" stroke-width="1" fill="none" opacity="0.5"/>`;
    case "powder":
      return `<path d="M8,26 Q6,14 16,13 Q26,14 24,26 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><rect x="12" y="8" width="8" height="6" rx="1" fill="${p.dark}"/><g fill="${p.light}"><circle cx="13" cy="21" r="1"/><circle cx="18" cy="19" r="1"/><circle cx="16" cy="23" r="1"/><circle cx="20" cy="23" r="0.8"/></g>`;
    case "herb":
      return `<path d="M16,27 V14" stroke="${mix(p.base, '#000', 0.3)}" stroke-width="1.6"/><path d="M16,15 Q9,13 7,7 Q14,7 16,14 Q18,7 25,7 Q23,13 16,15" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><path d="M16,20 Q11,19 9,15 Q14,15 16,19" fill="${p.dark}"/>`;
    case "bandage":
      return `<rect x="4" y="13" width="24" height="6" rx="3" transform="rotate(-30 16 16)" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><rect x="12" y="12" width="8" height="8" rx="1" transform="rotate(-30 16 16)" fill="${p.light}"/><path d="M13,13 L19,19 M19,13 L13,19" transform="rotate(-30 16 16)" stroke="${p.dark}" stroke-width="1.2"/>`;
    case "can":
      return `<rect x="9" y="7" width="14" height="19" rx="2" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4"/><ellipse cx="16" cy="7.5" rx="7" ry="2" fill="${p.light}"/><rect x="11" y="12" width="10" height="8" rx="1" fill="${mix(p.base, '#000', 0.2)}" stroke="${p.dark}" stroke-width="0.6"/><line x1="16" y1="7.5" x2="16" y2="6" stroke="${p.dark}" stroke-width="1"/>`;
    case "canteen":
      return `<circle cx="16" cy="18" r="9" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4"/><rect x="13" y="5" width="6" height="5" rx="1" fill="${p.dark}"/><path d="M9,15 A9 9 0 0 1 20 12" stroke="${p.light}" stroke-width="1.4" fill="none" opacity="0.6"/><circle cx="16" cy="18" r="4" fill="none" stroke="${p.dark}" stroke-width="0.8" opacity="0.5"/>`;
    case "pills":
      return `<rect x="8" y="9" width="16" height="16" rx="3" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4"/><rect x="8" y="9" width="16" height="6" rx="3" fill="${mix(p.base, '#8e2b23', 0.5)}"/><circle cx="12.5" cy="20" r="1.6" fill="${p.light}"/><circle cx="17" cy="18" r="1.6" fill="${p.light}"/><circle cx="19" cy="22" r="1.4" fill="${p.light}"/>`;
    case "molotov":
      return `<path d="M12,10 L20,10 L21,16 Q21,28 16,28 Q11,28 11,16 Z" fill="#6a4a2a" opacity="0.7" stroke="${p.edge}" stroke-width="1"/><rect x="13" y="16" width="6" height="9" fill="#caa24a" opacity="0.6"/><rect x="13.5" y="5" width="5" height="6" rx="1" fill="#b8b0a0"/><path d="M16,5 Q19,2 17,0" stroke="#c23b2c" stroke-width="1.6" fill="none"/><circle cx="17.5" cy="0.5" r="1.6" fill="#e8912e"/>`;
    case "ammo": {
      const bullet = (x: number) =>
        `<rect x="${x}" y="14" width="4" height="10" rx="1" fill="${MATS['brass']}" stroke="${mix(MATS['brass']!, '#000', 0.5)}" stroke-width="0.7"/><path d="M${x},14 Q${x + 2},9 ${x + 4},14 Z" fill="${p.light}"/>`;
      return bullet(9) + bullet(14) + bullet(19);
    }
    case "fist":
      return `<path d="M9,13 Q9,9 16,9 Q23,9 23,13 L23,20 Q23,25 16,25 Q9,25 9,20 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><path d="M11,13 H21 M11,16 H21 M11,19 H21" stroke="${p.dark}" stroke-width="0.8" opacity="0.6"/>`;
    case "pipe":
      return `<g transform="rotate(${45 + r} 16 16)"><rect x="14" y="3" width="4" height="26" rx="1.5" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><rect x="14" y="3" width="1.5" height="26" fill="${p.light}" opacity="0.7"/><ellipse cx="16" cy="4" rx="2" ry="1" fill="${p.dark}"/></g>`;
    case "machete":
      return `<g transform="rotate(${40 + r} 16 16)"><path d="M15,3 Q19,3 19,7 L19,20 L15,20 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><line x1="16" y1="6" x2="16" y2="19" stroke="${p.light}" stroke-width="0.8" opacity="0.7"/><rect x="13.5" y="20" width="5" height="8" rx="1.5" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.8"/><rect x="12.5" y="19.5" width="7" height="1.8" rx="0.8" fill="${p.dark}"/></g>`;
    case "axe":
      return `<g transform="rotate(${30 + r} 16 16)"><rect x="14.5" y="6" width="3" height="23" rx="1" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.8"/><path d="M14,5 Q7,6 8,13 Q13,12 14,15 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><path d="M18,5 Q25,6 24,13 Q19,12 18,15 Z" fill="${mix(p.base, '#8e2b23', 0.3)}" stroke="${p.edge}" stroke-width="1"/><path d="M9,8 Q11,10 13,10" stroke="${p.light}" stroke-width="0.8" opacity="0.6" fill="none"/></g>`;
    case "spear":
      return `<g transform="rotate(${45 + r} 16 16)"><rect x="15" y="9" width="2" height="20" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.6"/><path d="M16,2 L19,10 L16,13 L13,10 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1" stroke-linejoin="round"/><line x1="16" y1="4" x2="16" y2="11" stroke="${p.light}" stroke-width="0.7" opacity="0.7"/><path d="M14,13 L18,13 L17,16 L15,16 Z" fill="#3a2a1a"/></g>`;
    case "pistol":
      return `<path d="M6,12 L24,12 L24,16 L15,16 L15,20 Q15,22 13,22 L11,22 L11,16 L6,16 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><rect x="7" y="13" width="15" height="1.4" fill="${p.light}" opacity="0.6"/><circle cx="22" cy="14" r="1" fill="${p.dark}"/><path d="M11,16 L14,16 L14,20 L11,20 Z" fill="${p.dark}"/>`;
    default:
      // Unknown shape: a hashed lump so nothing renders blank.
      return `<circle cx="16" cy="16" r="9" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4"/><circle cx="13" cy="13" r="3" fill="${p.light}" opacity="0.6"/>`;
  }
}

const cache = new Map<string, string>();

export function itemIconSVG(def: ItemDef): string {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const pal = paletteFor(def);
  const svg =
    `<svg viewBox="0 0 32 32" class="item-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">` +
    draw(def.shape, pal, def.id) +
    `</svg>`;
  cache.set(def.id, svg);
  return svg;
}
