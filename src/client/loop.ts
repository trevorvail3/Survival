/**
 * src/client/loop.ts
 * ------------------
 * The game loop. Point-and-click: a left-click is hit-tested (foe → attack,
 * object → walk over and use, ground → walk there) and turned into a core
 * ORDER; the core carries it out and emits events the loop drains into audio,
 * particles and the log. Eased world-pixel camera + transform-applied zoom,
 * as in the sibling `world` project.
 */

import type { Content, ItemId, SettlerRole, StructureId, World } from "../core/types.ts";
import {
  assignRole,
  build,
  craft,
  decryptCoffer,
  dismantle,
  dodge,
  isStation,
  orderAttack,
  orderInteract,
  orderMove,
  playerMods,
  restAtHearth,
  spendSkill,
  storeToStash,
  takeFromStash,
  throwFirepot,
  tick,
  travelTo,
  useSlot,
  type GameEvent,
} from "../core/world.ts";
import { isNight } from "../core/world.ts";
import { drawLighting, drawWorld, TILE, type Camera } from "./render.ts";
import { Fx } from "./fx.ts";
import { Input } from "./input.ts";
import { Hud } from "./hud.ts";
import { SKILL_META, type SkillId } from "../content/trainskills.ts";
import { RARITY_META, type Rarity } from "../content/gear.ts";
import { audio, type SceneKey } from "./audio.ts";
import { saveGame } from "./save.ts";
import { Tutorial } from "./onboarding.ts";

// Elden-Ring-style titles, hailed the first time a boss turns on you in a region.
const BOSS_EPITHET: Partial<Record<string, string>> = {
  prior: "Keeper of the Cold Vigil",
  graveking: "Sovereign of the Iron Dead",
  rotmother: "Firstborn of the Plague",
};

export class Game {
  private g: CanvasRenderingContext2D;
  private cam: Camera = { x: 0, y: 0 };
  private zoom = 1.5;
  private viewW = 0;
  private viewH = 0;
  private last = 0;
  private raf = 0;
  private bankTipShown = false;
  private bossHailed = new Set<string>();
  private shake = 0;
  private nextHeartbeat = 0;
  private events: GameEvent[] = [];
  private pendingStation: number | null = null;
  private lastSave = 0;
  private tutorial: Tutorial;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private content: Content,
    private rng: () => number,
    private input: Input,
    private hud: Hud,
    private fx: Fx,
    private seed: number,
  ) {
    this.g = canvas.getContext("2d")!;
    this.tutorial = new Tutorial(world);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.cam.x = world.player.pos.x * TILE - this.viewW / this.zoom / 2;
    this.cam.y = world.player.pos.y * TILE - this.viewH / this.zoom / 2;
    audio.setScene(this.world.timeOfDay > 0.6 ? "night" : "day");
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    this.viewW = w; this.viewH = h;
    this.zoom = Math.max(1.1, Math.min(2.2, w / (26 * TILE)));
  }

  start(): void {
    this.last = performance.now();
    const frame = (t: number) => { const dt = Math.min(50, t - this.last); this.last = t; this.step(dt, t); this.raf = requestAnimationFrame(frame); };
    this.raf = requestAnimationFrame(frame);
  }
  stop(): void { cancelAnimationFrame(this.raf); }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx / this.zoom + this.cam.x) / TILE, y: (sy / this.zoom + this.cam.y) / TILE };
  }

  private step(dtMs: number, now: number): void {
    const world = this.world, p = world.player;
    const ctx = { now, rng: this.rng };
    this.events.length = 0;

    // --- Input: click only. Pack/Skills/Settlement/Travel/Stash open from the
    // tab bar and dodge from its own button (see Hud.buildTabBar) — there is
    // no keyboard control surface. ---
    const click = this.input.consumeClick();
    if (click && p.alive && !this.hud.isModalOpen) this.handleClick(click.x, click.y);

    // --- Advance sim ---
    tick(world, this.content, ctx, dtMs, this.events);
    this.dispatch(this.events, now);

    // Arrived at a station? Open its panel / rest.
    if (this.pendingStation != null && p.order.type === "none") {
      const pr = world.props.find((x) => x.id === this.pendingStation);
      if (pr && Math.hypot(pr.pos.x + 0.5 - p.pos.x, pr.pos.y + 0.5 - p.pos.y) < 1.8) {
        if (pr.kind === "hearth") { restAtHearth(world, this.content, this.rng, this.events); this.dispatch(this.events, now); this.events.length = 0; }
        else if (pr.kind === "townboard") { this.hud.openSettlement(); this.tut("board"); }
        else if (pr.kind === "maptable") this.hud.openTravel();
        // A waystone in the field IS the extraction point: reach it and you
        // leave with your haul. No warp-home button — you walk to a way out.
        else if (pr.kind === "waystone") { if (world.zoneId === "home") this.hud.openTravel(); else this.travel("home", true); }
        else if (pr.kind === "stash") this.hud.openStash();
        else if (pr.kind === "forge" || pr.kind === "workbench") { this.hud.openPack(); this.tut("pack"); }
      }
      this.pendingStation = null;
    }

    // --- Onboarding: state-driven tips + refresh the objective tracker ---
    if (p.alive) {
      if (p.infection > 0) this.tut("infected");
      if (world.enemies.some((e) => e.boss && (e.state === "hunt" || e.state === "attack"))) this.tut("boss");
    }
    this.hud.setTask(this.tutorial.currentTask());

    // --- Low-HP heartbeat ---
    if (p.alive && p.hp / p.maxHp < 0.3 && now > this.nextHeartbeat) { audio.play("lowhp"); this.nextHeartbeat = now + 1100; }

    // --- Boss battle music while a boss hunts ---
    audio.setBossMusic(world.enemies.some((en) => en.boss && (en.state === "hunt" || en.state === "attack")));

    // --- Camera ---
    const tx = p.pos.x * TILE - this.viewW / this.zoom / 2, ty = p.pos.y * TILE - this.viewH / this.zoom / 2;
    this.cam.x += (tx - this.cam.x) * 0.12;
    this.cam.y += (ty - this.cam.y) * 0.12;

    // --- Render ---
    this.fx.update(dtMs, now);
    this.shake *= 0.86;
    const sc: Camera = { x: this.cam.x + (this.rng() - 0.5) * this.shake, y: this.cam.y + (this.rng() - 0.5) * this.shake };
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.viewW, this.viewH);
    drawWorld(this.g, world, this.content, sc, now, this.viewW, this.viewH, this.zoom);
    this.g.setTransform(this.zoom, 0, 0, this.zoom, -sc.x * this.zoom, -sc.y * this.zoom);
    this.fx.draw(this.g);
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    drawLighting(this.g, world, sc, this.viewW, this.viewH, this.zoom, this.fx.activeLights(), playerMods(p).lightBonus);

    this.hud.update(world, this.hoverPrompt(), { forge: this.near("forge"), workshop: this.near("workbench") });
    this.hud.renderMinimap(world);
    this.input.endFrame();

    // Autosave the run every few seconds while alive.
    if (p.alive && now - this.lastSave > 4000) { saveGame(world, this.seed); this.lastSave = now; }
  }

  /** Persist now (e.g. on tab close), unless the run is already over. */
  save(): void { if (this.world.player.alive) saveGame(this.world, this.seed); }

  /** Feed a signal to the tutorial and toast anything it returns. */
  private tut(sig: string): void {
    for (const t of this.tutorial.notify(sig)) this.hud.tip(t);
  }

  private handleClick(sx: number, sy: number): void {
    this.tut("move"); // any click teaches point-to-act
    const wpt = this.screenToWorld(sx, sy);
    // 1. A foe under the cursor?
    let foe = null as null | (typeof this.world.enemies)[number];
    let fd = 0.7;
    for (const e of this.world.enemies) {
      if (e.state === "dead") continue;
      const d = Math.hypot(e.pos.x - wpt.x, e.pos.y - wpt.y);
      if (d < fd) { fd = d; foe = e; }
    }
    if (foe) { orderAttack(this.world, foe); this.fx.ping(foe.pos.x, foe.pos.y, "#c23b2c"); return; }
    // 2. A prop under the cursor?
    let prop = null as null | (typeof this.world.props)[number];
    let pd = 0.8;
    for (const pr of this.world.props) {
      const d = Math.hypot(pr.pos.x + 0.5 - wpt.x, pr.pos.y + 0.5 - wpt.y);
      if (d < pd) { pd = d; prop = pr; }
    }
    if (prop) {
      orderInteract(this.world, prop);
      this.pendingStation = isStation(prop.kind) ? prop.id : null;
      this.fx.ping(prop.pos.x + 0.5, prop.pos.y + 0.5, "#c8b06a");
      return;
    }
    // 3. Walk there.
    orderMove(this.world, Math.floor(wpt.x), Math.floor(wpt.y));
    this.pendingStation = null;
    this.fx.ping(Math.floor(wpt.x) + 0.5, Math.floor(wpt.y) + 0.5, "#9fb0c0");
  }

  private near(kind: "forge" | "workbench"): boolean {
    const p = this.world.player;
    for (const pr of this.world.props) if (pr.kind === kind && Math.hypot(pr.pos.x + 0.5 - p.pos.x, pr.pos.y + 0.5 - p.pos.y) < 2.4) return true;
    return false;
  }

  private hoverPrompt(): string | null {
    if (!this.world.player.alive || this.hud.isModalOpen) return null;
    const m = this.screenToWorld(this.input.mouseX, this.input.mouseY);
    // A foe under the cursor?
    let fd = 0.7, foeName: string | null = null;
    for (const e of this.world.enemies) {
      if (e.state === "dead") continue;
      const d = Math.hypot(e.pos.x - m.x, e.pos.y - m.y);
      if (d < fd) { fd = d; foeName = this.content.enemies[e.kind].name; }
    }
    if (foeName) return `Fight ${foeName}`;
    // A prop? Skip depleted searchables/nodes/rescued survivors so a spent
    // chest never occludes the live tree behind it.
    const LABELS: Partial<Record<string, string>> = {
      chest: "Search chest", crate: "Search crate", barrel: "Search barrel", remains: "Search remains", cart: "Search wreck",
      tree: "Fell timber", rock: "Mine stone", herbs: "Gather herbs", fishpool: "Fish the water", survivor: "Rescue survivor",
      forge: "Work the forge", workbench: "Use the workshop", hearth: "Rest until dawn", townboard: "Muster the settlement", waystone: "Extract — leave with your haul", maptable: "Study the war map", stash: "Open storage",
    };
    const CONSUMED = new Set(["chest", "crate", "barrel", "remains", "cart", "survivor", "tree", "rock", "herbs", "fishpool"]);
    let pd = 0.8; let label: string | null = null;
    for (const pr of this.world.props) {
      if (!LABELS[pr.kind]) continue;
      if (pr.used && CONSUMED.has(pr.kind)) continue;
      const d = Math.hypot(pr.pos.x + 0.5 - m.x, pr.pos.y + 0.5 - m.y);
      if (d < pd) { pd = d; label = LABELS[pr.kind]!; }
    }
    return label;
  }

  private useHotbar(id: ItemId, now: number): void {
    const idx = this.world.player.inv.findIndex((s) => s && s.id === id);
    if (idx < 0) return;
    const def = this.content.items[id]!;
    if (def.use === "throw") {
      const aim = this.screenToWorld(this.input.mouseX, this.input.mouseY);
      throwFirepot(this.world, this.content, { rng: this.rng }, idx, aim.x, aim.y, this.events);
    } else {
      useSlot(this.world, this.content, idx, this.events);
    }
    this.dispatch(this.events, now);
    this.events.length = 0;
  }

  handlers() {
    return {
      onCraft: (recipeId: string) => { const ev: GameEvent[] = []; if (craft(this.world, this.content, recipeId, ev)) this.dispatch(ev, performance.now()); },
      onBuild: (id: StructureId) => { const ev: GameEvent[] = []; if (build(this.world, this.content, id, ev)) this.dispatch(ev, performance.now()); },
      onAssign: (role: SettlerRole, delta: number) => { assignRole(this.world, role, delta); this.hud.markDirty(); },
      onEquip: (id: ItemId) => { const ev: GameEvent[] = []; useSlotById(this.world, this.content, id, ev); this.dispatch(ev, performance.now()); },
      onUseSlot: (i: number) => { const ev: GameEvent[] = []; useSlot(this.world, this.content, i, ev); this.dispatch(ev, performance.now()); },
      onSkipTutorial: () => { this.tutorial.skip(); this.hud.setTask(null); },
      onSpendSkill: (nodeId: string) => { spendSkill(this.world, nodeId); this.hud.markDirty(); },
      onStore: (i: number) => { storeToStash(this.world, this.content, i); this.hud.markDirty(); },
      onTake: (i: number) => { takeFromStash(this.world, this.content, i); this.hud.markDirty(); },
      onDodge: () => {
        const p = this.world.player;
        if (!p.alive || this.hud.isModalOpen) return;
        const aim = this.screenToWorld(this.input.mouseX, this.input.mouseY);
        const ev: GameEvent[] = [];
        dodge(this.world, aim.x, aim.y, ev);
        this.dispatch(ev, performance.now());
      },
      onHotbar: (id: ItemId) => { this.useHotbar(id, performance.now()); },
      onTogglePack: () => { this.hud.togglePack(); audio.play("click"); this.tut("pack"); },
      onToggleSkills: () => { this.hud.toggleSkills(); audio.play("click"); },
      onToggleSettlement: () => { this.hud.toggleSettlement(); audio.play("click"); this.tut("board"); },
      onToggleTravel: () => { this.hud.toggleTravel(); audio.play("click"); },
      onToggleStash: () => { this.hud.toggleStash(); audio.play("click"); },
      onDismantle: (i: number) => { const ev: GameEvent[] = []; if (dismantle(this.world, this.content, i, ev)) this.dispatch(ev, performance.now()); },
      onTravel: (regionId: string) => { this.travel(regionId, false); },
      onDecrypt: (i: number) => { const ev: GameEvent[] = []; if (decryptCoffer(this.world, this.content, { rng: this.rng }, i, ev)) this.dispatch(ev, performance.now()); },
    };
  }

  /** Move between zones. `extracted` marks a field→home trip made by reaching a
   *  waystone (vs. setting out from home, or the map's own travel), so the
   *  banner reads as a successful extraction. */
  private travel(regionId: string, extracted: boolean): void {
    const fromHome = this.world.zoneId === "home";
    const ev: GameEvent[] = [];
    if (travelTo(this.world, this.content, this.rng, regionId, ev)) {
      this.tut("travel");
      this.bossHailed.clear(); // a fresh region — its lord may be hailed again
      this.hud.closeAll();
      this.snapCamera();
      audio.setScene(regionId === "home" ? (isNight(this.world.timeOfDay) ? "night" : "day") : (regionId as SceneKey));
      const name = regionId === "home" ? (extracted ? "Extracted" : "Your Settlement") : (this.content.regions.find((r) => r.id === regionId)?.name ?? "the wilds");
      const sub = regionId === "home" ? (extracted ? "You made it back with your haul." : "Home again.") : "Watch the light.";
      this.hud.showBanner(name, sub, 1800);
      this.dispatch(ev, performance.now());
      // Extraction nudge: heading out heavy means a fall costs you the haul.
      if (regionId !== "home" && fromHome && !this.bankTipShown) {
        const carried = this.world.player.inv.filter(Boolean).length;
        if (carried >= 5) { this.hud.tip("Fall out here and you lose your <b>pack</b> — bank your haul at the <b>stash</b> before a risky run."); this.bankTipShown = true; }
      }
    }
  }

  private snapCamera(): void {
    const p = this.world.player;
    this.cam.x = p.pos.x * TILE - this.viewW / this.zoom / 2;
    this.cam.y = p.pos.y * TILE - this.viewH / this.zoom / 2;
  }

  private dispatch(events: GameEvent[], now: number): void {
    const p = this.world.player;
    for (const e of events) {
      switch (e.t) {
        case "melee": audio.play("melee"); break;
        case "bowshot": audio.play("bowshot"); this.fx.muzzle(p.pos.x, p.pos.y, p.facing); break;
        case "dodge": audio.play("dodge"); this.fx.sparks(e.x, e.y, "#b8c2cc", 5); break;
        case "noammo": audio.play("dryfire"); this.hud.pushLog("Out of arrows."); break;
        case "hit": audio.play(e.crit ? "crit" : "hit"); this.fx.blood(e.x, e.y, e.crit ? 16 : 9); this.fx.float(e.x, e.y - 0.4, String(e.dmg), e.crit ? "#ff6a4a" : "#e8d8b0", e.crit ? 17 : 13); break;
        case "miss": this.fx.float(e.x, e.y - 0.4, "miss", "#7d858c", 11); break;
        case "throw": audio.play("throw"); break;
        case "explode": audio.play("explode"); this.fx.explosion(e.x, e.y); this.shake = Math.max(this.shake, 14); break;
        case "kill": audio.creature(e.kind, "die"); this.fx.blood(e.x, e.y, 22); break;
        case "aggro":
          audio.creature(e.kind, "aggro"); audio.sting();
          if (BOSS_EPITHET[e.kind] && !this.bossHailed.has(e.kind)) {
            this.bossHailed.add(e.kind);
            this.hud.showBanner(this.content.enemies[e.kind].name, BOSS_EPITHET[e.kind]!, 3400);
          }
          break;
        case "playerHurt": audio.play("hurt"); this.fx.float(p.pos.x, p.pos.y - 0.6, `-${e.dmg}`, "#ff4a3a", 15); this.fx.blood(p.pos.x, p.pos.y, 6); this.shake = Math.max(this.shake, 6 + e.dmg * 0.2); this.tut("hurt"); break;
        case "pickup": audio.play("pickup"); this.hud.pushLog(`+${e.qty} ${this.content.items[e.id]?.name ?? e.id}`); break;
        case "gather": audio.play("gather"); this.tut("gather"); break;
        case "search": audio.play("search"); this.tut("search"); break;
        case "craft": audio.play("craft"); this.hud.pushLog(`Crafted ${this.content.items[e.id]?.name ?? e.id}.`); this.tut("craft"); break;
        case "build": audio.play("build"); this.hud.pushLog(`${this.content.structures[e.id].name} raised to level ${e.level}.`); this.hud.showBanner(this.content.structures[e.id].name, `Level ${e.level}`, 1500); break;
        case "recruit": audio.play("recruit"); this.tut("rescue"); break;
        case "levelUp": audio.play("levelup"); this.hud.showBanner(`Level ${e.level}`, "A skill point earned — open Skills to spend it.", 2000); this.hud.pushLog(`You reach level ${e.level}.`); break;
        case "skillup": { const m = SKILL_META[e.skill as SkillId]; audio.play("click"); this.hud.tip(`<b>${m?.name ?? e.skill}</b> level ${e.level}`); this.hud.pushLog(`${m?.name ?? e.skill} advanced to ${e.level}.`); break; }
        case "drop": {
          const rm = RARITY_META[e.rarity as Rarity]; const nm = this.content.items[e.id]?.name ?? e.id;
          this.hud.pushLog(`Dropped: <span style="color:${rm?.color ?? "#ccc"}">${rm?.name ?? ""} ${nm}</span> ◈${e.power}`);
          if (e.rarity === "epic" || e.rarity === "legendary") {
            audio.play("levelup"); this.hud.tip(`<span style="color:${rm.color}">${rm.name}</span> drop — <b>${nm}</b> ◈${e.power}`);
          }
          break;
        }
        case "coffer": {
          // The raid payoff: a sealed coffer to haul home and break open.
          const rm = RARITY_META[e.rarity as Rarity];
          audio.play("levelup"); audio.sting();
          this.hud.showBanner("Sealed Coffer", `A warden's hoard, sealed — <span style="color:${rm.color}">${rm.name}+</span>. Carry it home and break the seal.`, 3800);
          this.hud.pushLog(`A <span style="color:${rm.color}">Sealed Coffer (${rm.name}+)</span> falls — take it home to open it.`);
          break;
        }
        case "decrypt": {
          const rm = RARITY_META[e.rarity as Rarity]; const nm = this.content.items[e.id]?.name ?? e.id;
          audio.play("levelup"); audio.sting();
          this.hud.showBanner("The Seal Breaks", `<span style="color:${rm.color}">${rm.name}</span> ${nm} — ◈${e.power}`, 3600);
          this.hud.pushLog(`The coffer yields: <span style="color:${rm.color}">${rm.name} ${nm}</span> ◈${e.power}.`);
          break;
        }
        case "salvage": audio.play("craft"); this.hud.pushLog(`Salvaged into ${e.qty}× ${this.content.items[e.id]?.name ?? e.id}.`); break;
        case "victory": audio.play("levelup"); audio.play("daybreak"); this.hud.showBanner("The Hold is Cleansed", "The Rot-Mother is dead. The plague ends with you.", 6000); this.hud.pushLog("You have won. The Hold is free — range on if you wish."); break;
        case "heal": audio.play("heal"); break;
        case "cure": audio.play("heal"); this.hud.pushLog("The fever recedes."); break;
        case "equip": audio.play("equip"); break;
        case "dayBreak": audio.play("daybreak"); if (this.world.zoneId === "home") audio.setScene("day"); this.hud.showBanner(`Day ${e.day}`, "You saw the dawn.", 2200); break;
        case "nightFall": {
          audio.play("nightfall");
          const home = this.world.zoneId === "home";
          if (home) audio.setScene("night");
          this.hud.showBanner("Nightfall", home ? "The dark settles over the castle. You are safe within the walls." : "The dead walk. Get behind your walls.", 2200);
          this.tut("night");
          break;
        }
        case "downed":
          audio.play("death"); audio.setScene("day"); audio.setBossMusic(false);
          this.snapCamera();
          if (e.lost) {
            this.hud.showBanner("Dragged Back", e.dropped > 0 ? `You fell in the wilds — the ${e.dropped} thing${e.dropped === 1 ? "" : "s"} in your pack are lost. Bank your haul next time.` : "You fell in the wilds. You wake at the hearth.", 3600);
            this.hud.pushLog(e.dropped > 0 ? `Your unbanked pack (${e.dropped}) was lost out there.` : "You were dragged home.");
          } else {
            this.hud.showBanner("You Fell", "Your people carried you in. Home held — your pack is safe.", 3000);
            this.hud.pushLog("You were downed behind the walls, but kept everything.");
          }
          break;
        case "log": this.hud.pushLog(e.msg); break;
      }
    }
    // Any game event can change what an open panel should show (a kill slays
    // a boss the travel map cares about, a level-up adds a skill point, ...) —
    // rebuild it once next frame rather than guessing which events matter.
    if (events.length > 0) this.hud.markDirty();
    void now;
  }
}

function useSlotById(world: World, content: Content, id: ItemId, out: GameEvent[]): void {
  const i = world.player.inv.findIndex((s) => s && s.id === id);
  if (i >= 0) useSlot(world, content, i, out);
}
