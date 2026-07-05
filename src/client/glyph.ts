/**
 * src/client/glyph.ts
 * -------------------
 * UI-chrome glyphs — tiny inline SVGs on a 24×24 grid that inherit `currentColor`,
 * lifted in shape from the sibling `world` project's glyph system and redrawn for
 * a survival-horror HUD (vitals, infection, day/night, pack, workbench).
 * Monochrome line-art: color comes from the surrounding text, never baked in.
 */

const VB = `viewBox="0 0 24 24" class="g-ico" xmlns="http://www.w3.org/2000/svg"`;
const line = (inner: string): string =>
  `<svg ${VB} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const solid = (inner: string): string => `<svg ${VB} fill="currentColor" stroke="none">${inner}</svg>`;

export const GLYPHS: Record<string, string> = {
  heart: solid(`<path d="M12 20 Q4 14 4 9 Q4 5 8 5 Q11 5 12 8 Q13 5 16 5 Q20 5 20 9 Q20 14 12 20 Z"/>`),
  bolt: solid(`<path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z"/>`),
  meat: line(`<path d="M6 18 L3 21 M6 18 Q4 12 10 8 Q17 3 20 7 Q23 11 16 16 Q11 20 6 18 Z"/><circle cx="16" cy="9" r="1.4"/>`),
  drop: solid(`<path d="M12 3 Q19 12 19 16 A7 7 0 0 1 5 16 Q5 12 12 3 Z"/>`),
  biohazard: line(`<circle cx="12" cy="13" r="2.2"/><path d="M12 11 V4 M10.3 14.5 L4.6 18 M13.7 14.5 L19.4 18"/><path d="M9 3 Q12 6 15 3 M3.4 19 Q4.5 15 8 16 M20.6 19 Q19.5 15 16 16"/>`),
  skull: solid(`<path d="M12 3 C6.5 3 4 7 4 11 C4 14 6 15 6 17 L6 19 A2 2 0 0 0 8 21 L16 21 A2 2 0 0 0 18 19 L18 17 C18 15 20 14 20 11 C20 7 17.5 3 12 3 Z M9 11 A2 2 0 1 1 9 11.01 M15 11 A2 2 0 1 1 15 11.01 M11 16 L11 19 M13 16 L13 19" fill-rule="evenodd"/>`),
  backpack: line(`<path d="M7 8 Q7 4 12 4 Q17 4 17 8 L17 20 Q17 21 16 21 L8 21 Q7 21 7 20 Z"/><path d="M9 8 H15 M10 12 H14 M12 12 V15"/>`),
  wrench: line(`<path d="M15 4 A4 4 0 1 0 20 9 L14 15 L9 20 A2 2 0 0 1 6 17 L11 12 Z"/>`),
  crosshair: line(`<circle cx="12" cy="12" r="7"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/>`),
  moon: solid(`<path d="M20 14 A8 8 0 1 1 11 4 A6 6 0 0 0 20 14 Z"/>`),
  sun: line(`<circle cx="12" cy="12" r="4"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M19.1 4.9 L17 7 M7 17 L4.9 19.1"/>`),
  hand: line(`<path d="M8 12 V6 A1.3 1.3 0 0 1 10.6 6 V11 M10.6 11 V5 A1.3 1.3 0 0 1 13.2 5 V11 M13.2 11 V6 A1.3 1.3 0 0 1 15.8 6 V12 M15.8 12 V8 A1.3 1.3 0 0 1 18 8 V15 Q18 21 12.5 21 Q8 21 6.5 16 L5 12.5 A1.3 1.3 0 0 1 7.4 11.4 L8 12.8"/>`),
  box: line(`<path d="M4 8 L12 4 L20 8 L12 12 Z"/><path d="M4 8 V16 L12 20 L20 16 V8 M12 12 V20"/>`),
  pause: solid(`<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>`),
  mute: line(`<path d="M4 9 H8 L13 5 V19 L8 15 H4 Z"/><path d="M17 9 L21 15 M21 9 L17 15"/>`),
  sound: line(`<path d="M4 9 H8 L13 5 V19 L8 15 H4 Z"/><path d="M16 8 Q19 12 16 16 M18.5 6 Q23 12 18.5 18"/>`),
  question: line(`<path d="M9 9 Q9 5 12 5 Q15 5 15 8 Q15 11 12 12 V14"/><circle cx="12" cy="18" r="0.6"/>`),
};

export function glyph(name: string): string {
  return GLYPHS[name] ?? GLYPHS["question"]!;
}
