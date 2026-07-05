/**
 * src/client/loop.ts
 * ------------------
 * The game loop. Point-and-click: a left-click is hit-tested (foe → attack,
 * object → walk over and use, ground → walk there) and turned into a core
 * ORDER; the core carries it out and emits events the loop drains into audio,
 * particles and the log. Eased world-pixel camera + transform-applied zoom,
 * as in the sibling `world` project.
 */

import type { Content, ItemId, StructureId, World } from "../core/types.ts";
import {
  build,
  craft,
  isStation,
  orderAttack,
  orderInteract,
  orderMove,
  restAtHearth,
  throwFirepot,
  tick,
  travelTo,
  useSlot,
  type GameEvent,
} from "../core/world.ts";
import { drawLighting, drawWorld, TILE, type Camera } from "./render.ts";
import { Fx } from "./fx.ts";
import { Input } from "./input.ts";
import { Hud, HOTBAR } from "./hud.ts";
import { audio } from "./audio.ts";

export class Game {
  private g: CanvasRenderingContext2D;
  private cam: Camera = { x: 0, y: 0 };
  private zoom = 1.5;
  private viewW = 0;
  private viewH = 0;
  private last = 0;
  private raf = 0;
  private shake = 0;
  private nextHeartbeat = 0;
  private events: GameEvent[] = [];
  private pendingStation: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private content: Content,
    private rng: () => number,
    private input: Input,
    private hud: Hud,
    private fx: Fx,
  ) {
    this.g = canvas.getContext("2d")!;
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

    // --- Input: clicks + hotkeys ---
    if (this.input.pressed("tab")) { this.hud.togglePack(); audio.play("click"); }
    if (this.input.pressed("escape")) this.hud.closeAll();

    const click = this.input.consumeClick();
    if (click && p.alive && !this.hud.isModalOpen) this.handleClick(click.x, click.y);

    for (let i = 0; i < HOTBAR.length; i++) {
      if (this.input.pressed(String(i + 1))) this.useHotbar(HOTBAR[i]!, now);
    }

    // --- Advance sim ---
    tick(world, this.content, ctx, dtMs, this.events);
    this.dispatch(this.events, now);

    // Arrived at a station? Open its panel / rest.
    if (this.pendingStation != null && p.order.type === "none") {
      const pr = world.props.find((x) => x.id === this.pendingStation);
      if (pr && Math.hypot(pr.pos.x + 0.5 - p.pos.x, pr.pos.y + 0.5 - p.pos.y) < 1.8) {
        if (pr.kind === "hearth") { restAtHearth(world, this.events); this.dispatch(this.events, now); this.events.length = 0; this.hud.showBanner("Rest", "The hearth holds the dark back.", 1600); }
        else if (pr.kind === "townboard") this.hud.openSettlement();
        else if (pr.kind === "waystone") this.hud.openTravel();
        else if (pr.kind === "forge" || pr.kind === "workbench") this.hud.openPack();
      }
      this.pendingStation = null;
    }

    // --- Low-HP heartbeat ---
    if (p.alive && p.hp / p.maxHp < 0.3 && now > this.nextHeartbeat) { audio.play("lowhp"); this.nextHeartbeat = now + 1100; }

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
    drawLighting(this.g, world, sc, this.viewW, this.viewH, this.zoom, this.fx.activeLights());

    this.hud.update(world, this.hoverPrompt(), { forge: this.near("forge"), workshop: this.near("workbench") });
    this.input.endFrame();
  }

  private handleClick(sx: number, sy: number): void {
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
    return null; // prompts handled via the click-ping; keep the HUD uncluttered
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
      onEquip: (id: ItemId) => { const ev: GameEvent[] = []; useSlotById(this.world, this.content, id, ev); this.dispatch(ev, performance.now()); },
      onUseSlot: (i: number) => { const ev: GameEvent[] = []; useSlot(this.world, this.content, i, ev); this.dispatch(ev, performance.now()); },
      onTravel: (regionId: string) => {
        const ev: GameEvent[] = [];
        if (travelTo(this.world, this.content, this.rng, regionId, ev)) {
          this.hud.closeAll();
          this.snapCamera();
          const name = regionId === "home" ? "Your Settlement" : (this.content.regions.find((r) => r.id === regionId)?.name ?? "the wilds");
          this.hud.showBanner(name, regionId === "home" ? "Home again." : "Watch the light.", 1800);
          this.dispatch(ev, performance.now());
        }
      },
    };
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
        case "noammo": audio.play("dryfire"); this.hud.pushLog("Out of arrows."); break;
        case "hit": audio.play(e.crit ? "crit" : "hit"); this.fx.blood(e.x, e.y, e.crit ? 16 : 9); this.fx.float(e.x, e.y - 0.4, String(e.dmg), e.crit ? "#ff6a4a" : "#e8d8b0", e.crit ? 17 : 13); break;
        case "throw": audio.play("throw"); break;
        case "explode": audio.play("explode"); this.fx.explosion(e.x, e.y); this.shake = Math.max(this.shake, 14); break;
        case "kill": audio.creature(e.kind, "die"); this.fx.blood(e.x, e.y, 22); break;
        case "aggro": audio.creature(e.kind, "aggro"); audio.sting(); break;
        case "playerHurt": audio.play("hurt"); this.fx.float(p.pos.x, p.pos.y - 0.6, `-${e.dmg}`, "#ff4a3a", 15); this.fx.blood(p.pos.x, p.pos.y, 6); this.shake = Math.max(this.shake, 6 + e.dmg * 0.2); break;
        case "pickup": audio.play("pickup"); this.hud.pushLog(`+${e.qty} ${this.content.items[e.id]?.name ?? e.id}`); break;
        case "gather": audio.play("gather"); break;
        case "search": audio.play("search"); break;
        case "craft": audio.play("craft"); this.hud.pushLog(`Crafted ${this.content.items[e.id]?.name ?? e.id}.`); break;
        case "build": audio.play("build"); this.hud.pushLog(`${this.content.structures[e.id].name} raised to level ${e.level}.`); this.hud.showBanner(this.content.structures[e.id].name, `Level ${e.level}`, 1500); break;
        case "recruit": audio.play("recruit"); break;
        case "heal": audio.play("heal"); break;
        case "eat": audio.play("eat"); break;
        case "drink": audio.play("drink"); break;
        case "cure": audio.play("heal"); this.hud.pushLog("The fever recedes."); break;
        case "equip": audio.play("equip"); break;
        case "dayBreak": audio.play("daybreak"); audio.setScene("day"); this.hud.showBanner(`Day ${e.day}`, "You saw the dawn.", 2200); break;
        case "nightFall": audio.play("nightfall"); audio.setScene("night"); this.hud.showBanner("Nightfall", "The dead walk. Hold your walls.", 2200); break;
        case "death": audio.play("death"); audio.setScene("day"); this.hud.showDeath(this.world.day); break;
        case "log": this.hud.pushLog(e.msg); break;
      }
    }
    void now;
  }
}

function useSlotById(world: World, content: Content, id: ItemId, out: GameEvent[]): void {
  const i = world.player.inv.findIndex((s) => s && s.id === id);
  if (i >= 0) useSlot(world, content, i, out);
}
