/**
 * src/client/avatar.ts
 * --------------------
 * The survivor, drawn top-down and rotated to face the aim direction. Adapts the
 * sibling `world` project's avatar technique — a figure composed from layered
 * parts (shadow → pack → body → head → arms → weapon) with a swing driven by an
 * animation phase, and a per-weapon `drawWeapon` that rides in the hands the way
 * `world`'s `drawTool` rode the arm. Everything is Canvas 2D; no sprites.
 */

import type { WeaponKind } from "../core/types.ts";

export interface AvatarLook {
  skin: string;
  jacket: string;
  hood: string;
  pack: string;
}

export const DEFAULT_LOOK: AvatarLook = {
  skin: "#c99873",
  jacket: "#59614f",
  hood: "#3a3f30",
  pack: "#6a4c30",
};

export interface AvatarAnim {
  now: number;
  moving: boolean;
  /** 1 → 0 across a swing; undefined when not attacking. */
  swing?: number;
  rolling?: boolean;
  hurt?: boolean;
}

function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const c = (n: number) => Math.round(n + (t - n) * k).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Draw the survivor centred at (cx, cy) in device pixels, at scale `s`
 * (1 ≈ a 1-tile figure when s = TILE), rotated to `facing` (radians).
 */
export function drawSurvivor(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  facing: number,
  look: AvatarLook,
  anim: AvatarAnim,
  weapon: WeaponKind,
): void {
  const t = anim.now;
  // Walk bob: a subtle scale pulse so movement reads even top-down.
  const step = t / 130;
  const bob = anim.moving ? 1 + Math.sin(step) * 0.04 : 1 + Math.sin(t / 600) * 0.015;

  // Ground shadow (drawn un-rotated, on the floor).
  g.save();
  g.globalAlpha = anim.rolling ? 0.15 : 0.32;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(cx, cy + s * 0.06, s * 0.42, s * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.save();
  g.translate(cx, cy);
  g.rotate(facing + Math.PI / 2); // sprite is authored facing "up"
  g.scale(bob, bob);

  const R = (u: number) => u * s; // unit → pixels

  // Backpack behind the shoulders.
  g.fillStyle = look.pack;
  g.strokeStyle = shade(look.pack, -0.4);
  g.lineWidth = R(0.03);
  rr(g, R(-0.2), R(0.06), R(0.4), R(0.34), R(0.08));
  g.fill();
  g.stroke();

  // Legs (two stubs), animated with an alternating stride when moving.
  const stride = anim.moving ? Math.sin(step) * R(0.1) : 0;
  g.fillStyle = shade(look.jacket, -0.35);
  leg(g, R(-0.14), R(0.18) + stride, R(0.13), R(0.26));
  leg(g, R(0.14), R(0.18) - stride, R(0.13), R(0.26));

  // Torso — the jacket, a rounded capsule.
  const grad = g.createLinearGradient(R(-0.3), 0, R(0.3), 0);
  grad.addColorStop(0, shade(look.jacket, -0.25));
  grad.addColorStop(0.5, look.jacket);
  grad.addColorStop(1, shade(look.jacket, -0.25));
  g.fillStyle = anim.hurt ? "#7c2f28" : grad;
  g.strokeStyle = shade(look.jacket, 0.35); // light rim so the figure reads on dark ground
  g.lineWidth = R(0.04);
  rr(g, R(-0.26), R(-0.24), R(0.52), R(0.5), R(0.16));
  g.fill();
  g.stroke();

  // Arms + weapon. The weapon-side arm sweeps through the swing.
  const swingAmt = anim.swing != null ? (1 - anim.swing) : 0;
  // Arm rest angle points forward (up in local space).
  const armReach = R(0.34);
  // Melee: sweep from one side to the other across the swing.
  const sweep = weapon === "ranged" ? 0 : (swingAmt - 0.5) * 1.9;

  // Far arm (holds steady / supports).
  drawArm(g, R(0.18), R(-0.12), R(0.16) + sweep * R(0.05), armReach * 0.7, look, R);
  // Near arm holds the weapon.
  const handX = Math.sin(-0.16 + sweep) * armReach;
  const handY = -Math.cos(-0.16 + sweep) * armReach;
  drawArm(g, R(-0.18), R(-0.12), handX, handY, look, R);

  // Weapon in the near hand, angled along the swing.
  g.save();
  g.translate(handX, handY);
  g.rotate(sweep * 0.9);
  drawWeapon(g, R, weapon, anim);
  g.restore();

  // Head / hood on top (front).
  g.fillStyle = look.hood;
  g.strokeStyle = shade(look.hood, 0.4);
  g.lineWidth = R(0.03);
  g.beginPath();
  g.arc(0, R(-0.05), R(0.2), 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // A sliver of face at the front of the hood.
  g.fillStyle = shade(look.skin, -0.1);
  g.beginPath();
  g.ellipse(0, R(-0.14), R(0.1), R(0.08), 0, 0, Math.PI * 2);
  g.fill();

  g.restore();
}

function drawArm(
  g: CanvasRenderingContext2D,
  shoulderX: number,
  shoulderY: number,
  handX: number,
  handY: number,
  look: AvatarLook,
  R: (u: number) => number,
): void {
  g.strokeStyle = look.jacket;
  g.lineWidth = R(0.13);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(shoulderX, shoulderY);
  g.lineTo(handX, handY);
  g.stroke();
  // Hand.
  g.fillStyle = look.skin;
  g.beginPath();
  g.arc(handX, handY, R(0.07), 0, Math.PI * 2);
  g.fill();
}

function drawWeapon(g: CanvasRenderingContext2D, R: (u: number) => number, kind: WeaponKind, anim: AvatarAnim): void {
  g.lineCap = "round";
  switch (kind) {
    case "blade":
      g.strokeStyle = "#c9ccd0";
      g.lineWidth = R(0.05);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, R(-0.42)); g.stroke();
      g.strokeStyle = "#2a2c2e"; g.lineWidth = R(0.06);
      g.beginPath(); g.moveTo(0, R(0.02)); g.lineTo(0, R(0.12)); g.stroke();
      break;
    case "cleaver":
      g.fillStyle = "#8e2b23";
      g.beginPath();
      g.moveTo(R(-0.03), 0); g.lineTo(R(-0.16), R(-0.4)); g.lineTo(R(0.14), R(-0.42)); g.lineTo(R(0.05), 0); g.closePath();
      g.fill();
      g.strokeStyle = "#1c1c1e"; g.lineWidth = R(0.04); g.stroke();
      break;
    case "blunt":
      g.strokeStyle = "#7d858c";
      g.lineWidth = R(0.09);
      g.beginPath(); g.moveTo(0, R(0.1)); g.lineTo(0, R(-0.44)); g.stroke();
      break;
    case "spear":
      g.strokeStyle = "#5a4028"; g.lineWidth = R(0.05);
      g.beginPath(); g.moveTo(0, R(0.16)); g.lineTo(0, R(-0.5)); g.stroke();
      g.fillStyle = "#9096a0";
      g.beginPath(); g.moveTo(0, R(-0.66)); g.lineTo(R(0.07), R(-0.5)); g.lineTo(R(-0.07), R(-0.5)); g.closePath(); g.fill();
      break;
    case "ranged": {
      g.fillStyle = "#3a3e44";
      rr(g, R(-0.06), R(-0.28), R(0.12), R(0.34), R(0.03)); g.fill();
      g.strokeStyle = "#1c1c1e"; g.lineWidth = R(0.02); g.stroke();
      if (anim.swing != null && anim.swing > 0.7) {
        // muzzle flash on the freshest part of the "swing" (trigger pull).
        g.fillStyle = "#ffd27a";
        g.beginPath(); g.arc(0, R(-0.34), R(0.09), 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case "fist":
    default:
      g.fillStyle = "#b98b6a";
      g.beginPath(); g.arc(0, R(-0.02), R(0.08), 0, Math.PI * 2); g.fill();
      break;
  }
}

function leg(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = w / 2;
  rr(g, x - w / 2, y, w, h, r);
  g.fill();
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
