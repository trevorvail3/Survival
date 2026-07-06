/**
 * src/client/save.ts
 * ------------------
 * Local save/continue, one blob per CHARACTER SLOT (three per account). The
 * whole `World` is plain data (ids resolved against static content), so it
 * serialises straight to localStorage. Slots are keyed `ashfall-save-<0..2>`;
 * the legacy single save (`ashfall-save`) migrates into slot 0 on first boot.
 *
 * The account line (an Ironvail email) is stored locally for now — the shared
 * Ironvail account used across the Varath universe is a future cloud hook; the
 * per-slot shape here mirrors it so it can sync later.
 */

import type { World } from "../core/types.ts";

export const SAVE_SLOTS = 3;
const SAVE_VERSION = 4;
const LEGACY_KEY = "ashfall-save";
const ACCOUNT_KEY = "ashfall-account";

// Slots are namespaced per account so each Ironvail login has its own three
// Wardens; guest/offline play uses the un-prefixed keys (also the migration
// target for older single-slot saves). setActiveAccount picks the namespace.
let acctPrefix = "";
export function setActiveAccount(id: string | null): void {
  acctPrefix = id ? `${id}-` : "";
}
const slotKey = (slot: number) => `ashfall-save-${acctPrefix}${slot}`;

interface SaveBlob {
  v: number;
  seed: number;
  name: string;
  world: World;
}

export interface SlotInfo {
  slot: number;
  name: string;
  level: number;
  day: number;
}

export function saveGame(world: World, seed: number, slot: number, name: string): void {
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify({ v: SAVE_VERSION, seed, name, world }));
  } catch {
    /* private mode / quota — saving is best-effort, never fatal */
  }
}

function readBlob(slot: number): SaveBlob | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const blob = JSON.parse(raw) as Partial<SaveBlob>;
    if (blob.v !== SAVE_VERSION || !blob.world || typeof blob.seed !== "number") return null;
    return blob as SaveBlob;
  } catch {
    return null;
  }
}

export function loadGame(slot: number): { seed: number; world: World; name: string } | null {
  const blob = readBlob(slot);
  if (!blob) return null;
  // Backfill fields added after this save version so older runs keep working.
  const pl = blob.world.player as unknown as Record<string, unknown>;
  if (typeof pl["trained"] !== "object" || pl["trained"] === null) pl["trained"] = {};
  if (typeof pl["equipped"] === "string") pl["equipped"] = { id: pl["equipped"], qty: 1 };
  if (typeof pl["armor"] === "string") pl["armor"] = { id: pl["armor"], qty: 1 };
  const armor = pl["armor"] as unknown;
  if (!armor || typeof armor !== "object" || !("body" in (armor as object))) {
    const old = armor && typeof armor === "object" && "id" in (armor as object) ? (armor as Record<string, unknown>) : null;
    pl["armor"] = { head: null, body: old, hands: null, legs: null, feet: null };
  }
  if (!("offhand" in pl)) pl["offhand"] = null;
  if (!("gathering" in pl)) pl["gathering"] = null;
  const tools = pl["tools"] as unknown;
  if (!tools || typeof tools !== "object") {
    pl["tools"] = { woodcutting: { id: "felling_axe", qty: 1 }, mining: { id: "pickaxe", qty: 1 }, fishing: { id: "fishing_rod", qty: 1 } };
  }
  const w = blob.world as unknown as Record<string, unknown>;
  if (typeof w["won"] !== "boolean") w["won"] = false;
  if (!Array.isArray(w["stash"])) w["stash"] = new Array(48).fill(null);
  if (typeof w["restReadyAt"] !== "number") w["restReadyAt"] = 0;
  const st = blob.world.settlement as unknown as Record<string, unknown>;
  if (st && !Array.isArray(st["names"])) st["names"] = [];
  return { seed: blob.seed, world: blob.world, name: blob.name || "Warden" };
}

/** A one-line summary of every slot (null = empty) for the character select. */
export function slotInfos(): (SlotInfo | null)[] {
  const out: (SlotInfo | null)[] = [];
  for (let i = 0; i < SAVE_SLOTS; i++) {
    const blob = readBlob(i);
    if (!blob) { out.push(null); continue; }
    const lvl = (blob.world.player as unknown as { level?: number }).level ?? 1;
    const day = (blob.world as unknown as { day?: number }).day ?? 1;
    out.push({ slot: i, name: blob.name || "Warden", level: lvl, day });
  }
  return out;
}

export function clearSave(slot: number): void {
  try { localStorage.removeItem(slotKey(slot)); } catch { /* ignore */ }
}

/** Move a legacy single-slot save into slot 0 the first time we boot the
 *  multi-slot system, so an in-progress run isn't lost. */
export function migrateLegacySave(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !localStorage.getItem(slotKey(0))) {
      const blob = JSON.parse(legacy) as Partial<SaveBlob>;
      if (!("name" in blob)) (blob as SaveBlob).name = "Warden";
      localStorage.setItem(slotKey(0), JSON.stringify(blob));
    }
    if (legacy) localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}

export function getAccount(): string {
  try { return localStorage.getItem(ACCOUNT_KEY) || ""; } catch { return ""; }
}
export function setAccount(email: string): void {
  try { localStorage.setItem(ACCOUNT_KEY, email); } catch { /* ignore */ }
}
