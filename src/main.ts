/**
 * src/main.ts
 * -----------
 * Boot + wiring. Shows the title veil, then on the player's choice either
 * CONTINUES a saved run or starts a NEW one, builds the client (input, HUD, FX,
 * loop) and starts. The first gesture also unlocks the WebAudio engine. This is
 * the only file that knows about all the pieces at once.
 */

import "./style.css";
import { content } from "./content/index.ts";
import { createWorld } from "./core/world.ts";
import { mulberry32 } from "./core/rng.ts";
import { isNight } from "./core/world.ts";
import type { World } from "./core/types.ts";
import { Game } from "./client/loop.ts";
import { Hud, type HudHandlers } from "./client/hud.ts";
import { Input } from "./client/input.ts";
import { Fx } from "./client/fx.ts";
import { audio } from "./client/audio.ts";
import { loadGame, clearSave, slotInfos, migrateLegacySave, setAccount, setActiveAccount, SAVE_SLOTS, saveGame, setCloudHook, parseBlob, cacheBlob, summarize, type SlotInfo } from "./client/save.ts";
import { initAccount, available as accountAvailable, currentAccount, signIn, signUp, signOut, cloudList, cloudSave, cloudDelete, type Account } from "./client/account.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const hudRoot = document.getElementById("hud") as HTMLElement | null;
const app = document.getElementById("app") as HTMLElement | null;
if (!canvas || !hudRoot || !app) throw new Error("Missing #game / #hud / #app in index.html");

const input = new Input(canvas);
const fx = new Fx();

// The HUD needs handlers that live on the Game; the Game needs the HUD. Wire the
// HUD to a lazy delegate so clicks route to the Game once it exists.
// The Game supplies every in-world handler; the account actions (sign out /
// switch character) are app-level and implemented on the delegate below.
let gameHandlers: Omit<HudHandlers, "onSignOut" | "onSwitchCharacter"> | null = null;
let currentGame: Game | null = null;
const handlers: HudHandlers = {
  onCraft: (r) => gameHandlers?.onCraft(r),
  onBuild: (id) => gameHandlers?.onBuild(id),
  onEquip: (i) => gameHandlers?.onEquip(i),
  onUseSlot: (i) => gameHandlers?.onUseSlot(i),
  onTravel: (id) => gameHandlers?.onTravel(id),
  onAssign: (role, delta) => gameHandlers?.onAssign(role, delta),
  onSkipTutorial: () => gameHandlers?.onSkipTutorial(),
  onSpendSkill: (id) => gameHandlers?.onSpendSkill(id),
  onStore: (i) => gameHandlers?.onStore(i),
  onTake: (i) => gameHandlers?.onTake(i),
  onHotbar: (id) => gameHandlers?.onHotbar(id),
  onTogglePack: () => gameHandlers?.onTogglePack(),
  onToggleSkills: () => gameHandlers?.onToggleSkills(),
  onToggleSettlement: () => gameHandlers?.onToggleSettlement(),
  onToggleTravel: () => gameHandlers?.onToggleTravel(),
  onToggleStash: () => gameHandlers?.onToggleStash(),
  onDismantle: (i) => gameHandlers?.onDismantle(i),
  onDecrypt: (i) => gameHandlers?.onDecrypt(i),
  onToggleSettings: () => gameHandlers?.onToggleSettings(),
  // Account actions are app-level, not the Game's. Save (flushing to cloud by
  // resetting the throttle), then reload — boot() re-routes to sign-in (signed
  // out) or the character select (still signed in).
  onSignOut: () => { lastCloud = 0; currentGame?.save(); window.setTimeout(async () => { await signOut(); setActiveAccount(null); location.reload(); }, 500); },
  onSwitchCharacter: () => { lastCloud = 0; currentGame?.save(); window.setTimeout(() => location.reload(), 400); },
};
const hud = new Hud(hudRoot, content, handlers);
hudRoot.style.display = "none"; // stay hidden behind the title until a run begins

/** Build the Game around a chosen world + seed, wire it up, and run. */
function begin(world: World, seed: number, slot: number, name: string): void {
  hudRoot!.style.display = "";
  const rng = mulberry32(seed);
  const game = new Game(canvas!, world, content, rng, input, hud, fx, seed, slot, name);
  currentGame = game;
  hud.setAccount(account ? account.email : null); // shown in Settings
  gameHandlers = game.handlers();
  window.addEventListener("beforeunload", () => game.save());
  audio.unlock();
  audio.setScene(isNight(world.timeOfDay) ? "night" : "day");
  game.start();
  (window as unknown as Record<string, unknown>)["__ashfall"] = { world, content, audio, game, hud };
}

// --- Title + Ironvail character select ---
migrateLegacySave();
const seedParam = new URLSearchParams(location.search).get("seed");

const veil = document.createElement("div");
veil.id = "veil";
veil.innerHTML = `
  <div class="title">ASHFALL</div>
  <div class="tagline">An Old Hold, and the Dead That Keep It</div>
  <div class="acct" id="acct"></div>
  <div class="lines" id="veilLines"></div>
  <div class="char-select" id="stage"></div>
  <div class="hint">
    Everything is a click — no keyboard needed. <b>Click</b> to move, fight, search and gather · <b>scroll or pinch</b> to zoom<br/>
    the tabs on the right open your <b>Pack</b>, <b>Skills</b>, <b>Settlement</b>, <b>Expedition</b> map and <b>Stash</b>
  </div>`;
app.appendChild(veil);

const LINES = [
  "The plague came to the hold, and the dead would not lie still. The tombs stand open. The living are few.",
  "You hold a condemned castle — its curtain wall still stands, its bailey a ruin. Reclaim it stone by stone: forge, workshop, hall.",
  "Basic timber, ore and fish are yours at home, and the means to work them. The richer lodes — and the real gear — lie out in the dark.",
  "Range out by day to gather, fight and loot; be behind your walls before dark. Fall out there, and the wilds keep your unbanked haul.",
  "Three lords hold the rot together. The Pale Prior. The Iron King. And at the Rotcradle, the Mother of it all.",
];
const linesEl = veil.querySelector<HTMLElement>("#veilLines")!;
let li = 1;
const cycle = () => {
  linesEl.style.opacity = "0";
  window.setTimeout(() => { linesEl.textContent = LINES[li % LINES.length]!; linesEl.style.opacity = "1"; li++; }, 400);
};
linesEl.style.transition = "opacity 0.4s ease";
linesEl.textContent = LINES[0]!;
const cycleTimer = window.setInterval(cycle, 4200);
audio.setScene("menu");

const dismiss = () => { clearInterval(cycleTimer); veil.style.opacity = "0"; veil.style.pointerEvents = "none"; window.setTimeout(() => veil.remove(), 1200); };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));

const acctEl = veil.querySelector<HTMLElement>("#acct")!;
const stageEl = veil.querySelector<HTMLElement>("#stage")!;
let account: Account | null = null; // signed-in Ironvail account, else null (guest/offline)

// --- Account line: reflects signed-in / guest / offline state. ---
function renderAccount(): void {
  if (account) {
    acctEl.innerHTML = `<span class="brand">IRONVAIL</span> · ${esc(account.email)} <button class="acctlink" id="acctOut">sign out</button>`;
    acctEl.querySelector<HTMLButtonElement>("#acctOut")!.onclick = async () => { await signOut(); account = null; setActiveAccount(null); showSignIn(); };
  } else if (accountAvailable()) {
    acctEl.innerHTML = `<span class="brand">IRONVAIL</span> · <span style="color:var(--rust)">not signed in</span>`;
  } else {
    acctEl.innerHTML = `<span class="brand">IRONVAIL</span> · <span style="color:var(--ink-dim)">offline — playing locally</span>`;
  }
}

// --- Sign-in / create-account screen (the shared Ironvail login). ---
function showSignIn(): void {
  setActiveAccount(null);
  renderAccount();
  stageEl.innerHTML = `
    <div class="char-head">Sign in to Ironvail</div>
    <div class="auth">
      <input class="cinput" id="authEmail" type="email" placeholder="Email" autocomplete="email" />
      <input class="cinput" id="authPass" type="password" placeholder="Password" autocomplete="current-password" />
      <div class="autherr" id="authErr"></div>
      <div class="authrow">
        <button class="cbegin" id="authSignin">Sign In</button>
        <button class="cbegin ghost" id="authSignup">Create Account</button>
      </div>
      <button class="acctlink" id="authGuest" style="margin-top:2px">Play offline instead</button>
      <div style="font-size:11px;color:var(--ink-dim);margin-top:4px">One Ironvail account across the Varath universe.</div>
    </div>`;
  const email = stageEl.querySelector<HTMLInputElement>("#authEmail")!;
  const pass = stageEl.querySelector<HTMLInputElement>("#authPass")!;
  const err = stageEl.querySelector<HTMLElement>("#authErr")!;
  const busy = (b: boolean, label: string) => { const s = stageEl.querySelector<HTMLButtonElement>("#authSignin")!, u = stageEl.querySelector<HTMLButtonElement>("#authSignup")!; s.disabled = b; u.disabled = b; if (b) err.textContent = label; };
  const doAuth = async (create: boolean) => {
    const e = email.value.trim(), p = pass.value;
    if (!e || !p) { err.textContent = "Enter an email and password."; return; }
    err.style.color = "var(--ink-dim)";
    busy(true, create ? "Creating account…" : "Signing in…");
    const res = create ? await signUp(e, p) : await signIn(e, p);
    busy(false, "");
    err.style.color = "var(--rust)";
    if (res.error) { err.textContent = res.error; return; }
    if ("confirm" in res && res.confirm) { err.style.color = "var(--ink-dim)"; err.textContent = "Check your email to confirm, then sign in."; return; }
    if (res.account) enterAccount(res.account);
  };
  stageEl.querySelector<HTMLButtonElement>("#authSignin")!.onclick = () => doAuth(false);
  stageEl.querySelector<HTMLButtonElement>("#authSignup")!.onclick = () => doAuth(true);
  stageEl.querySelector<HTMLButtonElement>("#authGuest")!.onclick = () => { account = null; setActiveAccount(null); setCloudHook(null); renderAccount(); showSlots(slotInfos()); };
  pass.onkeydown = (ev) => { if (ev.key === "Enter") doAuth(false); };
}

let lastCloud = 0;
function enterAccount(acc: Account): void {
  account = acc;
  setActiveAccount(acc.id);
  setAccount(acc.email);
  // Mirror every local save up to the cloud (leading-edge throttled so a 4s
  // autosave cadence becomes a ~20s cloud cadence). Local stays authoritative.
  setCloudHook((slot, blob) => {
    const now = Date.now();
    if (now - lastCloud < 20000) return;
    lastCloud = now;
    void cloudSave(slot, blob);
  });
  renderAccount();
  void refreshSlots();
}

/** Pull the account's slots from the cloud (mirroring them locally so they're
 *  playable offline); fall back to the local slots if the cloud is unreachable
 *  or the table isn't provisioned yet. */
async function refreshSlots(): Promise<void> {
  let infos: (SlotInfo | null)[] | null = null;
  if (account) {
    const cloud = await cloudList();
    if (cloud) infos = cloud.map((raw, i) => { const b = parseBlob(raw); if (b) cacheBlob(i, b); return summarize(b, i); });
  }
  showSlots(infos ?? slotInfos());
}

// --- Character slots (per account / guest). ---
function startNew(slot: number, name: string): void {
  const seed = seedParam ? Number(seedParam) >>> 0 : Date.now() >>> 0;
  const world = createWorld(content, mulberry32(seed));
  saveGame(world, seed, slot, name);
  dismiss();
  begin(world, seed, slot, name);
}
function continueSlot(slot: number): void {
  const s = loadGame(slot);
  if (!s) return;
  dismiss();
  begin(s.world, s.seed, slot, s.name);
}
function showSlots(infos: (SlotInfo | null)[]): void {
  stageEl.innerHTML = `<div class="char-head">Choose your Warden</div><div class="char-slots">${
    infos.map((info, i) => info
      ? `<div class="cslot filled" data-continue="${i}">
           <button class="cdel" data-del="${i}" title="Delete this warden">✕</button>
           <div class="cname">${esc(info.name)}</div>
           <div class="csub">Day ${info.day} · Level ${info.level}</div>
           <div class="cgo">Continue</div>
         </div>`
      : `<div class="cslot empty" data-new="${i}">
           <div class="cplus">+</div>
           <div class="csub">New Warden</div>
         </div>`
    ).join("")
  }</div>`;
  stageEl.querySelectorAll<HTMLElement>("[data-continue]").forEach((el) => {
    el.onclick = (e) => { if ((e.target as HTMLElement).dataset["del"]) return; continueSlot(Number(el.dataset["continue"])); };
  });
  stageEl.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); const i = Number(el.dataset["del"]); if (window.confirm("Permanently delete this warden? This cannot be undone.")) { clearSave(i); if (account) void cloudDelete(i); void refreshSlots(); } };
  });
  stageEl.querySelectorAll<HTMLElement>("[data-new]").forEach((el) => {
    el.onclick = () => openNewForm(Number(el.dataset["new"]), el);
  });
}
function openNewForm(slot: number, card: HTMLElement): void {
  card.classList.remove("empty");
  card.innerHTML = `<input class="cinput" maxlength="18" placeholder="Name your warden" />
    <button class="cbegin">Take Up the Blade</button>`;
  const input = card.querySelector<HTMLInputElement>(".cinput")!;
  const go = () => startNew(slot, (input.value.trim() || "Warden").slice(0, 18));
  input.focus();
  input.onkeydown = (e) => { if (e.key === "Enter") go(); };
  card.querySelector<HTMLButtonElement>(".cbegin")!.onclick = go;
}
void SAVE_SLOTS;

// --- Boot routing: sign-in if accounts are available, else offline slots. ---
async function boot(): Promise<void> {
  initAccount();
  renderAccount();
  if (accountAvailable()) {
    const existing = await currentAccount();
    if (existing) { enterAccount(existing); return; }
    showSignIn();
  } else {
    setCloudHook(null);
    showSlots(slotInfos()); // offline / guest
  }
}
void boot();
