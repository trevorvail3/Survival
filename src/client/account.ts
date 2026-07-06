/**
 * src/client/account.ts
 * ---------------------
 * The Ironvail account — shared across the Varath universe. We reuse Varath's
 * Supabase project (its publishable/anon key is safe to embed client-side), so
 * the SAME email + password signs a player into either game.
 *
 * Auth uses Supabase's built-in user store (no table needed). Character SAVES
 * stay local for now, namespaced per account (see save.ts); a cloud
 * `ashfall_characters` table can be added later to sync across devices.
 *
 * Everything is best-effort: if the Supabase library or the network is
 * unavailable, `available()` is false and the game falls back to offline play.
 */

// Varath's Ironvail project. The anon/publishable key is meant to ship in the
// client — it only allows what row-level security permits.
const SUPABASE_URL = "https://qkdjddlrgtaxxwlbkwbq.supabase.co";
const SUPABASE_ANON = "sb_publishable_NUUtwbtlTCz9YQeDSMUQ8w_Ys2iGVAs";

import type { SaveBlob } from "./save.ts";

export interface Account { id: string; email: string; }

// Minimal shape of the Supabase JS client (UMD build on window.supabase).
interface CloudRow { slot: number; name: string; save_data: unknown }
type SbClient = {
  auth: {
    getSession: () => Promise<{ data: { session: { user: { id: string; email?: string } } | null } }>;
    signInWithPassword: (c: { email: string; password: string }) => Promise<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>;
    signUp: (c: { email: string; password: string }) => Promise<{ data: { user: { id: string; email?: string } | null; session: unknown }; error: { message: string } | null }>;
    signOut: () => Promise<unknown>;
  };
  from: (table: string) => {
    select: (cols: string) => { eq: (c: string, v: string) => { order: (c: string) => Promise<{ data: CloudRow[] | null; error: { message: string } | null }> } };
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error: { message: string } | null }>;
    delete: () => { eq: (c: string, v: string) => { eq: (c: string, v: number) => Promise<{ error: { message: string } | null }> } };
  };
};

const TABLE = "ashfall_characters";
let sb: SbClient | null = null;
let uid: string | null = null; // the signed-in user's id (for cloud rows)

/** Try to construct the Supabase client. Safe to call before the CDN script
 *  finishes — returns false if the library isn't there yet. */
export function initAccount(): boolean {
  if (sb) return true;
  const lib = (window as unknown as { supabase?: { createClient: (u: string, k: string) => SbClient } }).supabase;
  if (!lib?.createClient) return false;
  try { sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON); return true; }
  catch { return false; }
}

export function available(): boolean { return !!sb; }

const toAccount = (u: { id: string; email?: string } | null | undefined): Account | null => {
  if (!u) return null;
  uid = u.id;
  return { id: u.id, email: u.email || "" };
};

/** The already-signed-in account (persisted by Supabase), if any. */
export async function currentAccount(): Promise<Account | null> {
  if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); return toAccount(data.session?.user); }
  catch { return null; }
}

export async function signIn(email: string, password: string): Promise<{ account?: Account; error?: string }> {
  if (!sb) return { error: "Accounts are offline right now." };
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const acc = toAccount(data.user);
    return acc ? { account: acc } : { error: "Sign-in failed." };
  } catch { return { error: "Could not reach the Ironvail server." }; }
}

export async function signUp(email: string, password: string): Promise<{ account?: Account; error?: string; confirm?: boolean }> {
  if (!sb) return { error: "Accounts are offline right now." };
  try {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // If email confirmation is on, there's a user but no session yet.
    if (data.user && !data.session) return { confirm: true };
    const acc = toAccount(data.user);
    return acc ? { account: acc } : { error: "Could not create the account." };
  } catch { return { error: "Could not reach the Ironvail server." }; }
}

export async function signOut(): Promise<void> {
  uid = null;
  if (!sb) return;
  try { await sb.auth.signOut(); } catch { /* ignore */ }
}

// --- Cloud character slots (Supabase `ashfall_characters`). All best-effort:
// a null / false return means the cloud is unavailable (offline, not signed in,
// or the table isn't provisioned yet) and the caller falls back to local. ---

/** Per-slot save blobs from the cloud (index = slot). null = cloud unavailable. */
export async function cloudList(): Promise<(unknown | null)[] | null> {
  if (!sb || !uid) return null;
  try {
    const { data, error } = await sb.from(TABLE).select("slot, name, save_data").eq("user_id", uid).order("slot");
    if (error) return null;
    const out: (unknown | null)[] = [null, null, null];
    (data || []).forEach((r) => { if (r.slot >= 0 && r.slot < 3) out[r.slot] = r.save_data; });
    return out;
  } catch { return null; }
}

export async function cloudSave(slot: number, blob: SaveBlob): Promise<boolean> {
  if (!sb || !uid) return false;
  try {
    const { error } = await sb.from(TABLE).upsert(
      { user_id: uid, slot, name: blob.name, save_data: blob, updated_at: new Date().toISOString() },
      { onConflict: "user_id,slot" },
    );
    return !error;
  } catch { return false; }
}

export async function cloudDelete(slot: number): Promise<boolean> {
  if (!sb || !uid) return false;
  try { const { error } = await sb.from(TABLE).delete().eq("user_id", uid).eq("slot", slot); return !error; }
  catch { return false; }
}
