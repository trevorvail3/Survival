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
    if (typeof pl["trained"] !== "object" || pl["trained"] === null) pl["trained"] = {};
    // equipped/armor became gear instances (were bare item ids).
    if (typeof pl["equipped"] === "string") pl["equipped"] = { id: pl["equipped"], qty: 1 };
    if (typeof pl["armor"] === "string") pl["armor"] = { id: pl["armor"], qty: 1 };
    // armor went from a single body instance to a per-slot map. Migrate an old
    // single piece into the body slot; leave the rest empty.
    const armor = pl["armor"] as unknown;
    if (!armor || typeof armor !== "object" || !("body" in (armor as object))) {
      const old = armor && typeof armor === "object" && "id" in (armor as object) ? (armor as Record<string, unknown>) : null;
      pl["armor"] = { head: null, body: old, hands: null, legs: null, feet: null };
    }
    // Off-hand (shield) slot added after armour slots.
    if (!("offhand" in pl)) pl["offhand"] = null;
    // Gathering-activity state added later.
    if (!("gathering" in pl)) pl["gathering"] = null;
    const w = blob.world as unknown as Record<string, unknown>;
    if (typeof w["won"] !== "boolean") w["won"] = false;
    if (!Array.isArray(w["stash"])) w["stash"] = new Array(48).fill(null);
    if (typeof w["restReadyAt"] !== "number") w["restReadyAt"] = 0;
    const st = blob.world.settlement as unknown as Record<string, unknown>;
    if (st && !Array.isArray(st["names"])) st["names"] = [];
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
