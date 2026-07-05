/**
 * src/client/fx.ts
 * ----------------
 * Transient visual effects the core doesn't own: blood spray, sparks, embers,
 * muzzle flashes, and floating damage/pickup text. Lives entirely client-side;
 * the loop spawns from `GameEvent`s and draws these in world space each frame.
 */

import { TILE, type Camera } from "./render.ts";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string; gravity: number;
}
interface Floater {
  x: number; y: number; vy: number; life: number; text: string; color: string; size: number;
}

export class Fx {
  private parts: Particle[] = [];
  private floaters: Floater[] = [];
  /** Short-lived light sources (muzzle/explosion) for the lighting pass. */
  lights: { x: number; y: number; r: number; color: string; born: number; dur: number }[] = [];
  private rings: { x: number; y: number; life: number; color: string }[] = [];
  private now = 0;

  /** A click-destination ring (walk here / act on this). */
  ping(x: number, y: number, color: string): void {
    this.rings.push({ x, y, life: 1, color });
  }

  blood(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 4;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, maxLife: 0.5, size: 1 + Math.random() * 2, color: "#8e1a15", gravity: 0 });
    }
  }
  sparks(x: number, y: number, color = "#ffd27a", n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, maxLife: 0.35, size: 1 + Math.random() * 1.5, color, gravity: 0 });
    }
  }
  explosion(x: number, y: number): void {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, maxLife: 0.6, size: 2 + Math.random() * 3, color: Math.random() < 0.5 ? "#e8912e" : "#c23b2c", gravity: 0 });
    }
    this.light(x, y, 5, "rgba(255,170,80,", 360);
  }
  muzzle(x: number, y: number, facing: number): void {
    const fx = x + Math.cos(facing) * 0.6;
    const fy = y + Math.sin(facing) * 0.6;
    this.sparks(fx, fy, "#ffe6a0", 6);
    this.light(fx, fy, 4, "rgba(255,220,150,", 90);
  }

  private light(x: number, y: number, r: number, color: string, dur: number): void {
    this.lights.push({ x, y, r, color, born: this.now, dur });
  }

  float(x: number, y: number, text: string, color: string, size = 13): void {
    this.floaters.push({ x, y, vy: -1.1, life: 1, text, color, size });
  }

  update(dtMs: number, now: number): void {
    this.now = now;
    const dt = dtMs / 1000;
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy = p.vy * 0.9 + p.gravity * dt;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y += f.vy * dt;
      f.life -= dt * 0.9;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.lights = this.lights.filter((l) => now - l.born < l.dur);
    for (const r of this.rings) r.life -= dt * 1.6;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  /** Draw world-space particles/floaters. Call with the zoom transform active. */
  draw(g: CanvasRenderingContext2D): void {
    // Click rings, drawn under everything else.
    for (const r of this.rings) {
      const t = 1 - r.life;
      g.globalAlpha = r.life * 0.8;
      g.strokeStyle = r.color;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(r.x * TILE, r.y * TILE, (2 + t * 12), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (const p of this.parts) {
      g.globalAlpha = Math.max(0, p.life / p.maxLife);
      g.fillStyle = p.color;
      g.fillRect(p.x * TILE - p.size / 2, p.y * TILE - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    g.font = "600 13px Oswald, sans-serif";
    g.textAlign = "center";
    for (const f of this.floaters) {
      g.globalAlpha = Math.min(1, f.life);
      g.fillStyle = "rgba(0,0,0,0.7)";
      g.font = `600 ${f.size}px Oswald, sans-serif`;
      g.fillText(f.text, f.x * TILE + 1, f.y * TILE + 1);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x * TILE, f.y * TILE);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";
  }

  /** Active FX lights mapped for the lighting pass. */
  activeLights(): { x: number; y: number; r: number; color: string }[] {
    return this.lights.map((l) => {
      const k = 1 - (this.now - l.born) / l.dur;
      return { x: l.x, y: l.y, r: l.r * k, color: l.color };
    });
  }
}

export type { Camera };
