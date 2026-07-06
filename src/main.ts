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
import { loadGame, clearSave } from "./client/save.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const hudRoot = document.getElementById("hud") as HTMLElement | null;
const app = document.getElementById("app") as HTMLElement | null;
if (!canvas || !hudRoot || !app) throw new Error("Missing #game / #hud / #app in index.html");

const input = new Input(canvas);
const fx = new Fx();

// The HUD needs handlers that live on the Game; the Game needs the HUD. Wire the
// HUD to a lazy delegate so clicks route to the Game once it exists.
let gameHandlers: HudHandlers | null = null;
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
  onDodge: () => gameHandlers?.onDodge(),
  onHotbar: (id) => gameHandlers?.onHotbar(id),
  onTogglePack: () => gameHandlers?.onTogglePack(),
  onToggleSkills: () => gameHandlers?.onToggleSkills(),
  onToggleSettlement: () => gameHandlers?.onToggleSettlement(),
  onToggleTravel: () => gameHandlers?.onToggleTravel(),
  onToggleStash: () => gameHandlers?.onToggleStash(),
  onDismantle: (i) => gameHandlers?.onDismantle(i),
};
const hud = new Hud(hudRoot, content, handlers);

/** Build the Game around a chosen world + seed, wire it up, and run. */
function begin(world: World, seed: number): void {
  const rng = mulberry32(seed);
  const game = new Game(canvas!, world, content, rng, input, hud, fx, seed);
  gameHandlers = game.handlers();
  window.addEventListener("beforeunload", () => game.save());
  audio.unlock();
  audio.setScene(isNight(world.timeOfDay) ? "night" : "day");
  game.start();
  (window as unknown as Record<string, unknown>)["__ashfall"] = { world, content, audio, game, hud };
}

// --- Title veil ---
const saved = loadGame();
const seedParam = new URLSearchParams(location.search).get("seed");

const veil = document.createElement("div");
veil.id = "veil";
veil.innerHTML = `
  <div class="title">ASHFALL</div>
  <div class="tagline">A Nord Hold, and the Dead That Keep It</div>
  <div class="lines" id="veilLines"></div>
  <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center">
    ${saved ? `<button class="start" id="continueBtn">Continue</button>` : ""}
    <button class="start" id="startBtn" ${saved ? `style="background:#2a2622;color:#c3c6c4"` : ""}>${saved ? "New Game" : "Take Up the Blade"}</button>
  </div>
  <div style="font-size:12px;color:#5a5f5a;letter-spacing:.08em;max-width:640px;text-align:center;line-height:1.8">
    Everything is a click — no keyboard needed. <b>Click</b> to move, fight, search and gather · <b>↺</b> to dodge<br/>
    the tabs on the right open your <b>Pack</b>, <b>Skills</b>, <b>Settlement</b>, <b>Expedition</b> map and <b>Stash</b> from anywhere
  </div>`;
app.appendChild(veil);

const LINES = [
  "The plague came to the hold, and the dead would not lie still. The barrows stand open. The living are few.",
  "You hold a condemned castle — its curtain wall still stands, its bailey a ruin. Reclaim it stone by stone: forge, workshop, hall.",
  "Basic timber, ore and fish are yours at home, and the means to work them. The richer lodes — and the real gear — lie out in the dark.",
  "Range out by day to gather, fight and loot; be behind your walls before dark. Fall out there, and the wilds keep your unbanked haul.",
  "Three lords hold the rot together. The Pale Prior. The Barrow King. And at the Rotcradle, the Mother of it all.",
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

// Fading it out is cosmetic; stop it blocking clicks on the game underneath
// (same z-index as modal panels) the instant the fade starts, not 1.2s later.
const dismiss = () => { clearInterval(cycleTimer); veil.style.opacity = "0"; veil.style.pointerEvents = "none"; window.setTimeout(() => veil.remove(), 1200); };

veil.querySelector<HTMLButtonElement>("#continueBtn")?.addEventListener("click", () => {
  if (!saved) return;
  dismiss();
  begin(saved.world, saved.seed);
});

veil.querySelector<HTMLButtonElement>("#startBtn")!.addEventListener("click", () => {
  clearSave();
  const seed = seedParam ? Number(seedParam) >>> 0 : Date.now() >>> 0;
  dismiss();
  begin(createWorld(content, mulberry32(seed)), seed);
});
