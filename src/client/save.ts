/**
 * src/client/save.ts
 * ------------------
 * Character saves, one blob per SLOT (three per account). Always written to
 * localStorage (fast, offline-safe); when signed in to Ironvail, a cloud hook
 * also mirrors the blob to Supabase so Wardens follow the account across
 * devices. Local slots are namespaced per account so each login sees its own.
 */

import type { World } from "../core/types.ts";

export const SAVE_SLOTS = 3;
const SAVE_VERSION = 4;
const LEGACY_KEY = "ashfall-save";
const ACCOUNT_KEY = "ashfall-account";

let acctPrefix = "";
export function setActiveAccount(id: string | null): void {
  acctPrefix = id ? `${id}-` : "";
}
const slotKey = (slot: number) => `ashfall-save-${acctPrefix}${slot}`;

export interface SaveBlob {
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

// A cloud mirror, registered by the account layer while signed in. saveGame
// pushes the blob here after every local write; the hook throttles + fires
// async, swallowing failures (local remains the source of truth offline).
let cloudHook: ((slot: number, blob: SaveBlob) => void) | null = null;
export function setCloudHook(fn: ((slot: number, blob: SaveBlob) => void) | null): void { cloudHook = fn; }

export function saveGame(world: World, seed: number, slot: number, name: string): void {
  const blob: SaveBlob = { v: SAVE_VERSION, seed, name, world };
  try { localStorage.setItem(slotKey(slot), JSON.stringify(blob)); } catch { /* quota/private mode */ }
  try { cloudHook?.(slot, blob); } catch { /* cloud is best-effort */ }
}

function readBlob(slot: number): SaveBlob | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    return parseBlob(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Validate a parsed blob (from local or cloud). */
export function parseBlob(obj: unknown): SaveBlob | null {
  const blob = obj as Partial<SaveBlob> | null;
  if (!blob || blob.v !== SAVE_VERSION || !blob.world || typeof blob.seed !== "number") return null;
  return blob as SaveBlob;
}

/** Backfill fields added after a save's version so older runs keep working.
 *  Shared by local and cloud loads. */
export function hydrate(blob: SaveBlob | null): { seed: number; world: World; name: string } | null {
  if (!blob) return null;
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

export function loadGame(slot: number): { seed: number; world: World; name: string } | null {
  return hydrate(readBlob(slot));
}

/** One-line summary of a blob for the character select (null if invalid). */
export function summarize(blob: SaveBlob | null, slot: number): SlotInfo | null {
  if (!blob) return null;
  const lvl = (blob.world.player as unknown as { level?: number }).level ?? 1;
  const day = (blob.world as unknown as { day?: number }).day ?? 1;
  return { slot, name: blob.name || "Warden", level: lvl, day };
}

/** Local per-slot summaries for the character select (used offline, and as the
 *  fallback when the cloud is unreachable). */
export function slotInfos(): (SlotInfo | null)[] {
  const out: (SlotInfo | null)[] = [];
  for (let i = 0; i < SAVE_SLOTS; i++) out.push(summarize(readBlob(i), i));
  return out;
}

export function clearSave(slot: number): void {
  try { localStorage.removeItem(slotKey(slot)); } catch { /* ignore */ }
}

/** Write a cloud blob into the local mirror (so it's playable offline too). */
export function cacheBlob(slot: number, blob: SaveBlob): void {
  try { localStorage.setItem(slotKey(slot), JSON.stringify(blob)); } catch { /* ignore */ }
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
