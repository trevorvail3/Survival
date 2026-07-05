/**
 * src/main.ts
 * -----------
 * Boot + wiring. Builds a seeded world, constructs the client (input, HUD, FX,
 * loop), shows the title veil, and starts the loop on the first gesture (which
 * also unlocks the WebAudio engine). This is the only file that knows about all
 * the pieces at once — everything else talks through narrow seams.
 */

import "./style.css";
import { content } from "./content/index.ts";
import { createWorld } from "./core/world.ts";
import { mulberry32 } from "./core/rng.ts";
import { Game } from "./client/loop.ts";
import { Hud, type HudHandlers } from "./client/hud.ts";
import { Input } from "./client/input.ts";
import { Fx } from "./client/fx.ts";
import { audio } from "./client/audio.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const hudRoot = document.getElementById("hud") as HTMLElement | null;
const app = document.getElementById("app") as HTMLElement | null;
if (!canvas || !hudRoot || !app) throw new Error("Missing #game / #hud / #app in index.html");

// Seed: ?seed=… reproduces a district exactly; otherwise pick one at boot.
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const seed = seedParam ? Number(seedParam) >>> 0 : (Date.now() >>> 0);
const rng = mulberry32(seed);

const world = createWorld(content, rng);

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
};
const hud = new Hud(hudRoot, content, handlers);
const game = new Game(canvas, world, content, rng, input, hud, fx);
gameHandlers = game.handlers();

// --- Title veil ---
const veil = document.createElement("div");
veil.id = "veil";
veil.innerHTML = `
  <div class="title">ASHFALL</div>
  <div class="tagline">A Plague of the Risen</div>
  <div class="lines" id="veilLines"></div>
  <button class="start" id="startBtn">Take Up the Blade</button>
  <div style="font-size:12px;color:#5a5f5a;letter-spacing:.08em;max-width:640px;text-align:center;line-height:1.8">
    <b>Click</b> to move · click a foe to fight · click to search &amp; gather · <b>1–5</b> use items · <b>Tab</b> pack &amp; craft<br/>
    the <b>town board</b> builds your settlement &amp; assigns rescued survivors · the <b>waystone</b> sets out on expeditions
  </div>`;
app.appendChild(veil);

const LINES = [
  "The plague took the living, and would not let them lie still. Now the dead walk the vale.",
  "You hold one walled steading against the night. Rally survivors. Raise the forge. Arm your people.",
  "Range out by day for timber, ore and herbs. Be behind your walls when the dark comes.",
];
const linesEl = veil.querySelector<HTMLElement>("#veilLines")!;
let li = 0;
const cycle = () => {
  linesEl.style.opacity = "0";
  window.setTimeout(() => {
    linesEl.textContent = LINES[li % LINES.length]!;
    linesEl.style.opacity = "1";
    li++;
  }, 400);
};
linesEl.style.transition = "opacity 0.4s ease";
linesEl.textContent = LINES[0]!;
li = 1;
const cycleTimer = window.setInterval(cycle, 4200);

audio.setScene("menu");

const startBtn = veil.querySelector<HTMLButtonElement>("#startBtn")!;
startBtn.onclick = () => {
  audio.unlock();
  clearInterval(cycleTimer);
  veil.style.opacity = "0";
  window.setTimeout(() => veil.remove(), 1200);
  audio.setScene(world.timeOfDay > 0.6 ? "night" : "day");
  game.start();
};

// Expose a little for debugging in the console.
(window as unknown as Record<string, unknown>)["__ashfall"] = { world, content, audio, game, hud };
