/**
 * src/client/itemIcon.ts
 * ----------------------
 * Procedural item icons — inline SVG on a 32×32 grid, no image files. The color
 * toolkit and the `Pal`/`shadeFrom` base/light/dark/edge/accent shading model
 * are lifted from the sibling `world` project's engine; the silhouettes are
 * drawn for Ashfall's medieval roster. Deterministic (hash-driven) → cache-safe.
 */

import type { ItemDef } from "../core/types.ts";

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
  return { base, dark: mix(base, "#000000", 0.36), light: mix(base, "#ffffff", 0.4), edge: mix(base, "#000000", 0.62), accent: accent ?? mix(base, "#ffffff", 0.55) };
}

const MATS: Record<string, string> = {
  wood: "#6b4e2e", stone: "#6d6a63", iron: "#6b6f74", steel: "#9aa0a8", rust: "#7a5a3a",
  cloth: "#b8a98a", leather: "#7a5230", herb: "#6f8a3c", bone: "#d8d0bc", rope: "#a89968",
  oil: "#4a3a26", glass: "#8fa6a2", toxic: "#6f9a4c", bread: "#a9793f",
};
function paletteFor(def: ItemDef): Pal {
  return shadeFrom((def.material && MATS[def.material]) || MATS["iron"]!);
}

const WOOD = "#5a4028", WOODX = "#2f2013";

function draw(shape: string, p: Pal, id: string): string {
  const r = (hash(id) % 9) - 4;
  switch (shape) {
    case "log":
      return `<g transform="rotate(${r} 16 16)"><rect x="5" y="12" width="22" height="8" rx="3" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><ellipse cx="26" cy="16" rx="2" ry="3.4" fill="${p.dark}"/><ellipse cx="26" cy="16" rx="1" ry="1.8" fill="${p.light}"/><line x1="9" y1="14" x2="22" y2="14" stroke="${p.dark}" stroke-width="0.7" opacity="0.5"/></g>`;
    case "stone":
      return `<g transform="rotate(${r} 16 16)"><polygon points="6,20 8,11 16,7 25,10 27,19 18,26 10,25" fill="${p.base}" stroke="${p.edge}" stroke-width="1.3" stroke-linejoin="round"/><polygon points="8,11 16,7 17,15 10,17" fill="${p.light}"/><polygon points="17,15 25,10 27,19 19,21" fill="${p.dark}"/></g>`;
    case "ore":
      return `<g transform="rotate(${r} 16 16)"><polygon points="6,19 9,10 17,7 25,11 26,21 17,26 9,24" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><polygon points="9,10 17,7 18,15 11,17" fill="${p.light}"/><polygon points="18,15 25,11 26,21 19,22" fill="${p.dark}"/><circle cx="13" cy="20" r="1.4" fill="#c8964a"/><circle cx="20" cy="15" r="1" fill="#c8964a"/></g>`;
    case "ingot":
      return `<polygon points="6,22 26,22 22,15 10,15" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><polygon points="10,15 22,15 20,12 12,12" fill="${p.light}"/><rect x="9" y="19" width="14" height="1.4" fill="${p.dark}" opacity="0.6"/>`;
    case "cloth":
      return `<path d="M6,10 Q10,6 16,8 Q22,10 26,8 L25,22 Q20,26 14,24 Q9,22 6,24 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><path d="M9,12 Q16,14 24,11" stroke="${p.dark}" stroke-width="1" fill="none" opacity="0.6"/><path d="M8,17 Q15,19 24,16" stroke="${p.dark}" stroke-width="1" fill="none" opacity="0.5"/>`;
    case "hide":
      return `<path d="M8,7 Q13,4 16,8 Q19,4 24,7 Q28,12 24,18 Q26,24 20,26 Q16,23 12,26 Q6,24 8,18 Q4,12 8,7 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="16" cy="15" rx="4" ry="6" fill="${p.dark}" opacity="0.4"/>`;
    case "herb":
      return `<path d="M16,27 V14" stroke="${mix(p.base, '#000', 0.3)}" stroke-width="1.6"/><path d="M16,15 Q9,13 7,7 Q14,7 16,14 Q18,7 25,7 Q23,13 16,15" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><path d="M16,20 Q11,19 9,15 Q14,15 16,19" fill="${p.dark}"/>`;
    case "bone":
      return `<g transform="rotate(${r + 30} 16 16)"><rect x="10" y="14" width="12" height="4" rx="2" fill="${p.base}" stroke="${p.edge}" stroke-width="0.8"/><circle cx="10" cy="13" r="2.6" fill="${p.base}" stroke="${p.edge}" stroke-width="0.8"/><circle cx="10" cy="19" r="2.6" fill="${p.base}" stroke="${p.edge}" stroke-width="0.8"/><circle cx="22" cy="13" r="2.6" fill="${p.base}" stroke="${p.edge}" stroke-width="0.8"/><circle cx="22" cy="19" r="2.6" fill="${p.base}" stroke="${p.edge}" stroke-width="0.8"/></g>`;
    case "coil":
      return `<circle cx="16" cy="16" r="10" fill="none" stroke="${p.base}" stroke-width="4"/><circle cx="16" cy="16" r="10" fill="none" stroke="${p.edge}" stroke-width="0.8"/><circle cx="16" cy="16" r="6" fill="none" stroke="${p.dark}" stroke-width="3"/><path d="M6,16 A10 10 0 0 1 26 16" stroke="${p.light}" stroke-width="1" fill="none" opacity="0.5"/>`;
    case "flask":
      return `<path d="M13,5 L19,5 L18,12 L22,24 Q22,28 16,28 Q10,28 10,24 L14,12 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.1" stroke-linejoin="round"/><rect x="12.5" y="3" width="7" height="3" rx="1" fill="${WOOD}"/><ellipse cx="14" cy="22" rx="1.4" ry="3" fill="${p.light}" opacity="0.5"/>`;
    case "poultice":
      return `<circle cx="16" cy="17" r="9" fill="${mix(p.base,'#ffffff',0.35)}" stroke="${p.edge}" stroke-width="1.1"/><path d="M9,15 Q16,12 23,15" stroke="#b8a98a" stroke-width="2.4" fill="none"/><path d="M16,10 Q12,15 16,20 Q20,15 16,10" fill="${p.base}"/><path d="M13,17 h6" stroke="${p.dark}" stroke-width="1"/>`;
    case "bread":
      return `<path d="M6,20 Q6,11 16,11 Q26,11 26,20 Q26,24 16,24 Q6,24 6,20 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><path d="M11,14 l3,4 M16,13 l0,5 M21,14 l-3,4" stroke="${p.dark}" stroke-width="1" opacity="0.6"/>`;
    case "waterskin":
      return `<path d="M11,9 Q16,6 21,9 Q25,14 23,22 Q20,27 16,27 Q12,27 9,22 Q7,14 11,9 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><rect x="14" y="4" width="4" height="5" rx="1" fill="${WOODX}"/><path d="M11,13 Q16,15 21,13" stroke="${p.light}" stroke-width="1.2" fill="none" opacity="0.5"/>`;
    case "vial":
      return `<path d="M13,9 L19,9 L23,20 Q23,28 16,28 Q9,28 9,20 Z" fill="#cfe0e6" opacity="0.32" stroke="#9fb4bc" stroke-width="1"/><path d="M11,18 Q16,16 21,18 L22,21 Q16,29 10,21 Z" fill="${p.base}"/><ellipse cx="13" cy="22" rx="1.4" ry="2" fill="${p.light}" opacity="0.6"/><rect x="12.5" y="3" width="7" height="2.6" rx="1" fill="${WOOD}"/><rect x="13" y="5" width="6" height="4" fill="#cfe0e6" opacity="0.4"/>`;
    case "firebomb":
      return `<path d="M11,13 Q16,10 21,13 Q24,18 22,24 Q19,28 16,28 Q13,28 10,24 Q8,18 11,13 Z" fill="#6a4a2a" stroke="${p.edge}" stroke-width="1"/><rect x="13.5" y="6" width="5" height="7" rx="1" fill="#b8b0a0"/><path d="M16,6 Q19,3 17,1" stroke="#c23b2c" stroke-width="1.6" fill="none"/><circle cx="17.5" cy="1" r="1.8" fill="#e8912e"/>`;
    case "arrow":
      return `<g transform="rotate(${45} 16 16)"><line x1="16" y1="4" x2="16" y2="28" stroke="${WOOD}" stroke-width="1.6"/><polygon points="16,3 19,9 13,9" fill="#9096a0" stroke="${p.edge}" stroke-width="0.5"/><path d="M13,25 L16,22 L16,28 Z M19,25 L16,22 L16,28 Z" fill="#c8b06a"/></g>`;
    case "fist":
      return `<path d="M9,13 Q9,9 16,9 Q23,9 23,13 L23,20 Q23,25 16,25 Q9,25 9,20 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/><path d="M11,13 H21 M11,16 H21 M11,19 H21" stroke="${p.dark}" stroke-width="0.8" opacity="0.6"/>`;
    case "club":
      return `<g transform="rotate(${40 + r} 16 16)"><rect x="14" y="16" width="4" height="12" rx="1.5" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.8"/><path d="M12,4 Q20,4 21,11 Q21,17 16,17 Q11,17 11,11 Q11,5 12,4 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><circle cx="14" cy="9" r="1.2" fill="${p.dark}"/><circle cx="18" cy="12" r="1" fill="${p.dark}"/></g>`;
    case "spear":
      return `<g transform="rotate(${45 + r} 16 16)"><rect x="15" y="9" width="2" height="20" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.6"/><path d="M16,2 L19,10 L16,13 L13,10 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1" stroke-linejoin="round"/><line x1="16" y1="4" x2="16" y2="11" stroke="${p.light}" stroke-width="0.7" opacity="0.7"/></g>`;
    case "axe":
      return `<g transform="rotate(${30 + r} 16 16)"><rect x="14.5" y="6" width="3" height="23" rx="1" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.8"/><path d="M14,5 Q7,6 8,14 Q13,13 15,16 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><path d="M9,8 Q11,11 14,11" stroke="${p.light}" stroke-width="0.8" opacity="0.6" fill="none"/></g>`;
    case "sword":
      return `<g transform="rotate(${40 + r} 16 16)"><polygon points="16,3 18,7 18,20 14,20 14,7" fill="${p.base}" stroke="${p.edge}" stroke-width="1" stroke-linejoin="round"/><line x1="16" y1="5" x2="16" y2="19" stroke="${p.light}" stroke-width="0.8" opacity="0.7"/><rect x="10" y="20" width="12" height="2.6" rx="1" fill="#7a6038"/><rect x="15" y="22" width="2" height="6" fill="${WOOD}"/><circle cx="16" cy="28.4" r="1.6" fill="#7a6038"/></g>`;
    case "mace":
      return `<g transform="rotate(${40 + r} 16 16)"><rect x="14.5" y="13" width="3" height="15" rx="1" fill="${WOOD}" stroke="${WOODX}" stroke-width="0.8"/><circle cx="16" cy="9" r="6" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><g fill="${p.dark}"><rect x="15" y="1.5" width="2" height="3"/><rect x="15" y="13.5" width="2" height="3"/><rect x="8.5" y="8" width="3" height="2"/><rect x="20.5" y="8" width="3" height="2"/></g><circle cx="14" cy="7" r="1.4" fill="${p.light}" opacity="0.7"/></g>`;
    case "bow":
      return `<g transform="rotate(${r} 16 16)"><path d="M11,4 Q24,10 22,16 Q24,22 11,28" fill="none" stroke="${WOOD}" stroke-width="2.4" stroke-linecap="round"/><line x1="11" y1="4" x2="11" y2="28" stroke="${p.light}" stroke-width="0.9"/></g>`;
    case "armor":
      return `<path d="M8,8 L13,6 Q16,9 19,6 L24,8 L23,22 Q16,27 9,22 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2" stroke-linejoin="round"/><path d="M16,9 V24" stroke="${p.dark}" stroke-width="1" opacity="0.6"/><path d="M10,12 Q16,14 22,12" stroke="${p.light}" stroke-width="1" fill="none" opacity="0.5"/><path d="M10,16 Q16,18 22,16" stroke="${p.light}" stroke-width="1" fill="none" opacity="0.4"/>`;
    case "fish":
      return `<g transform="rotate(-12 16 16)"><path d="M6,16 Q13,9 22,16 Q13,23 6,16 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1.1"/><path d="M22,16 L27,12 L26,16 L27,20 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="1"/><circle cx="11" cy="15" r="1.2" fill="${p.dark}"/><path d="M14,13 Q16,16 14,19" stroke="${p.light}" stroke-width="0.8" fill="none" opacity="0.6"/></g>`;
    case "coffer": {
      // A domed, iron-banded strongbox with a gilded ward-lock — still sealed.
      const gold = "#d8a53a";
      return `<path d="M5,15 Q5,9 16,9 Q27,9 27,15 L27,15 L5,15 Z" fill="${p.light}" stroke="${p.edge}" stroke-width="1.1"/>` +
        `<rect x="5" y="15" width="22" height="11" rx="1.5" fill="${p.base}" stroke="${p.edge}" stroke-width="1.2"/>` +
        `<rect x="4.5" y="14" width="23" height="3" fill="${p.dark}"/>` +
        `<rect x="11" y="9" width="3" height="17" fill="${gold}" opacity="0.85"/><rect x="18" y="9" width="3" height="17" fill="${gold}" opacity="0.85"/>` +
        `<rect x="13.5" y="16" width="5" height="6" rx="1" fill="${gold}"/><circle cx="16" cy="19" r="1.2" fill="${p.edge}"/>` +
        `<path d="M9,13 Q16,15 23,13" stroke="${p.light}" stroke-width="0.8" fill="none" opacity="0.5"/>`;
    }
    default:
      return `<circle cx="16" cy="16" r="9" fill="${p.base}" stroke="${p.edge}" stroke-width="1.4"/><circle cx="13" cy="13" r="3" fill="${p.light}" opacity="0.6"/>`;
  }
}

const cache = new Map<string, string>();
export function itemIconSVG(def: ItemDef): string {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const pal = paletteFor(def);
  const svg = `<svg viewBox="0 0 32 32" class="item-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">${draw(def.shape, pal, def.id)}</svg>`;
  cache.set(def.id, svg);
  return svg;
}
