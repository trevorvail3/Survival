/**
 * src/client/avatar.ts
 * --------------------
 * The survivor as a proper 2D character, not a top-down blob that spins to face
 * the cursor. Matches the sibling `world` project's technique: the figure is
 * drawn upright in one of four fixed poses (up/down/left/right) picked from the
 * facing angle — never rotated — with left mirrored from right via a horizontal
 * flip, and "up" swapping to a back-of-head view with no face. Body parts layer
 * shadow → legs → torso → far arm → near arm/weapon → head, each nudged by a
 * walk-cycle bob/stride/lift the same way `world`'s avatar rig works. Everything
 * is Canvas 2D; no sprites.
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
  jacket: "#6b5236", // brown wool tunic
  hood: "#4a3b26", // travel hood
  pack: "#5a4028", // leather satchel
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

type Facing4 = "up" | "down" | "left" | "right";

/** Bucket a continuous facing angle (atan2 radians) into one of 4 fixed poses. */
function facing4(facing: number): Facing4 {
  const a = ((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0..2π
  if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return "right";
  if (a < Math.PI * 0.75) return "down";
  if (a < Math.PI * 1.25) return "left";
  return "up";
}

/**
 * Draw the survivor centred at (cx, cy) in device pixels, at scale `s`
 * (1 ≈ a 1-tile figure when s = TILE). Never rotates: `facing` (radians) is
 * bucketed to up/down/left/right, drawn upright, and left is the right pose
 * mirrored — the same fixed-pose convention `world`'s avatar uses.
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
  armorTone?: string | null,
): void {
  const t = anim.now;
  const step = t / 130;
  // Walk bob: a gentle vertical bounce, plus a per-step foot lift/stride.
  const bob = anim.moving ? -Math.abs(Math.sin(step)) * s * 0.05 : Math.sin(t / 600) * s * 0.015;
  const stride = anim.moving ? Math.sin(step) * s * 0.1 : 0;
  const liftL = anim.moving ? Math.max(0, Math.sin(step)) * s * 0.05 : 0;
  const liftR = anim.moving ? Math.max(0, -Math.sin(step)) * s * 0.05 : 0;

  const dir = facing4(facing);
  const flip = dir === "left";
  const back = dir === "up"; // shows the back of the head, no face
  const sideOn = dir === "left" || dir === "right"; // a 3/4 turn, not head-on

  // Ground shadow (fixed, never rotates or flips).
  g.save();
  g.globalAlpha = anim.rolling ? 0.15 : 0.32;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(cx, cy + s * 0.3, s * 0.4, s * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.save();
  g.translate(cx, cy);
  if (flip) g.scale(-1, 1); // draw the "right" pose, mirrored
  g.translate(0, bob);

  const R = (u: number) => u * s; // unit → pixels

  // Backpack behind the shoulders.
  g.fillStyle = look.pack;
  g.strokeStyle = shade(look.pack, -0.4);
  g.lineWidth = R(0.03);
  rr(g, R(-0.2), R(-0.02), R(0.4), R(0.34), R(0.08));
  g.fill();
  g.stroke();

  // Legs (two stubs), lifting on alternating steps.
  g.fillStyle = shade(look.jacket, -0.35);
  leg(g, R(-0.14) + (sideOn ? R(0.06) : stride), R(0.14) - liftL, R(0.13), R(0.26));
  leg(g, R(0.14) - (sideOn ? R(0.06) : stride), R(0.14) - liftR, R(0.13), R(0.26));

  // Torso — the jacket, a rounded capsule. Turned 3/4 (offset) when side-on.
  const tx = sideOn ? R(0.05) : 0;
  const grad = g.createLinearGradient(tx + R(-0.3), 0, tx + R(0.3), 0);
  grad.addColorStop(0, shade(look.jacket, -0.25));
  grad.addColorStop(0.5, look.jacket);
  grad.addColorStop(1, shade(look.jacket, -0.25));
  g.fillStyle = anim.hurt ? "#7c2f28" : grad;
  g.strokeStyle = shade(look.jacket, 0.35); // light rim so the figure reads on dark ground
  g.lineWidth = R(0.04);
  rr(g, tx + R(-0.26), R(-0.28), R(0.52), R(0.5), R(0.16));
  g.fill();
  g.stroke();

  // Worn armour: a plate/mail cuirass over the tunic.
  if (armorTone) {
    g.fillStyle = armorTone;
    g.strokeStyle = shade(armorTone, -0.4);
    g.lineWidth = R(0.03);
    rr(g, tx + R(-0.2), R(-0.22), R(0.4), R(0.38), R(0.1));
    g.fill();
    g.stroke();
    g.strokeStyle = shade(armorTone, 0.4);
    g.lineWidth = R(0.02);
    g.beginPath(); g.moveTo(tx, R(-0.2)); g.lineTo(tx, R(0.14)); g.stroke();
  }

  // Arms + weapon. The far arm sits behind the torso; the near arm holds the
  // weapon and swings forward through an attack (no more whole-body rotation).
  const swingAmt = anim.swing != null ? (1 - anim.swing) : 0;
  const armReach = R(0.36);
  const sweep = weapon === "bow" ? 0 : (swingAmt - 0.5) * 1.6;
  const farShoulderX = sideOn ? R(-0.02) : R(0.18);
  const nearShoulderX = sideOn ? R(0.1) : R(-0.18);

  drawArm(g, farShoulderX, R(-0.16), farShoulderX + R(0.02), R(-0.16) + armReach * 0.6, look, R);
  const handX = nearShoulderX + Math.sin(sweep) * armReach * 0.5;
  const handY = R(-0.16) + armReach * 0.75 - Math.cos(sweep) * armReach * 0.25;
  drawArm(g, nearShoulderX, R(-0.16), handX, handY, look, R);

  // Weapon in the near hand, angled along the swing.
  g.save();
  g.translate(handX, handY);
  g.rotate(-Math.PI / 2 + sweep * 0.9); // rest pointing "up" from the hand
  drawWeapon(g, R, weapon);
  g.restore();

  // Head / hood on top.
  const headX = sideOn ? R(0.04) : 0;
  g.fillStyle = look.hood;
  g.strokeStyle = shade(look.hood, 0.4);
  g.lineWidth = R(0.03);
  g.beginPath();
  g.arc(headX, R(-0.42), R(0.2), 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // A sliver of face — hidden from the back view, offset toward the turn.
  if (!back) {
    g.fillStyle = shade(look.skin, -0.1);
    g.beginPath();
    g.ellipse(headX + (sideOn ? R(0.06) : 0), R(-0.4), R(0.1), R(0.08), 0, 0, Math.PI * 2);
    g.fill();
  }

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

function drawWeapon(g: CanvasRenderingContext2D, R: (u: number) => number, kind: WeaponKind): void {
  g.lineCap = "round";
  switch (kind) {
    case "blade":
      g.strokeStyle = "#c9ccd0";
      g.lineWidth = R(0.05);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, R(-0.42)); g.stroke();
      g.strokeStyle = "#2a2c2e"; g.lineWidth = R(0.06);
      g.beginPath(); g.moveTo(0, R(0.02)); g.lineTo(0, R(0.12)); g.stroke();
      break;
    case "axe":
      g.strokeStyle = "#5a4028"; g.lineWidth = R(0.06);
      g.beginPath(); g.moveTo(0, R(0.1)); g.lineTo(0, R(-0.42)); g.stroke();
      g.fillStyle = "#9096a0";
      g.beginPath();
      g.moveTo(0, R(-0.42)); g.lineTo(R(0.2), R(-0.36)); g.lineTo(R(0.12), R(-0.2)); g.lineTo(0, R(-0.26)); g.closePath();
      g.fill();
      g.strokeStyle = "#2a2c2e"; g.lineWidth = R(0.02); g.stroke();
      break;
    case "blunt":
      g.strokeStyle = "#5a4028"; g.lineWidth = R(0.07);
      g.beginPath(); g.moveTo(0, R(0.1)); g.lineTo(0, R(-0.4)); g.stroke();
      g.fillStyle = "#7d858c";
      g.beginPath(); g.arc(0, R(-0.44), R(0.1), 0, Math.PI * 2); g.fill();
      break;
    case "spear":
      g.strokeStyle = "#5a4028"; g.lineWidth = R(0.05);
      g.beginPath(); g.moveTo(0, R(0.16)); g.lineTo(0, R(-0.5)); g.stroke();
      g.fillStyle = "#9096a0";
      g.beginPath(); g.moveTo(0, R(-0.66)); g.lineTo(R(0.07), R(-0.5)); g.lineTo(R(-0.07), R(-0.5)); g.closePath(); g.fill();
      break;
    case "bow": {
      g.strokeStyle = "#6b4a2a"; g.lineWidth = R(0.045);
      g.beginPath(); g.arc(R(0.12), R(-0.16), R(0.34), Math.PI * 0.62, Math.PI * 1.38); g.stroke();
      g.strokeStyle = "#cabf9a"; g.lineWidth = R(0.015);
      g.beginPath(); g.moveTo(R(-0.06), R(-0.44)); g.lineTo(R(-0.06), R(0.12)); g.stroke();
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
