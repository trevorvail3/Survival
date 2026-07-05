/**
 * src/client/save.ts
 * ------------------
 * Local save/continue. The whole `World` is plain data (no classes, no
 * functions — item/enemy/region references are ids resolved against static
 * content), so it serialises straight to localStorage. One slot; the run
 * continues exactly where you left off, including the zone you're standing in
 * and the home settlement you've built. Bumping SAVE_VERSION retires old saves
 * cleanly rather than loading a mismatched shape.
 */

import type { World } from "../core/types.ts";

const SAVE_KEY = "ashfall-save";
const SAVE_VERSION = 4;

interface SaveBlob {
  v: number;
  seed: number;
  world: World;
}

export function saveGame(world: World, seed: number): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, seed, world }));
  } catch {
    /* private mode / quota — saving is best-effort, never fatal */
  }
}

export function loadGame(): { seed: number; world: World } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as Partial<SaveBlob>;
    if (blob.v !== SAVE_VERSION || !blob.world || typeof blob.seed !== "number") return null;
    // Backfill fields added after this save version so older runs keep working.
    const pl = blob.world.player as unknown as Record<string, unknown>;
    if (typeof pl["invulnUntil"] !== "number") {
      pl["invulnUntil"] = 0; pl["dashUntil"] = 0; pl["dashReadyAt"] = 0; pl["dashDir"] = { x: 1, y: 0 };
    }
    const w = blob.world as unknown as Record<string, unknown>;
    if (typeof w["won"] !== "boolean") w["won"] = false;
    if (!Array.isArray(w["stash"])) w["stash"] = new Array(48).fill(null);
    return { seed: blob.seed, world: blob.world };
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
