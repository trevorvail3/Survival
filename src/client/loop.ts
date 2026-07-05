/**
 * src/client/loop.ts
 * ------------------
 * The game loop. Owns the canvas, camera and per-frame flow: read input →
 * advance the pure core (movement, `tick`, actions) → drain the resulting
 * `GameEvent`s into audio + particles + HUD → render the world, effects, and
 * the darkness. The eased world-pixel camera + transform-applied zoom follow
 * the pattern proven in the sibling `world` project.
 */

import type { Content, ItemId, World } from "../core/types.ts";
import {
  craft,
  dodge,
  interact,
  isNight,
  movePlayer,
  nearestProp,
  playerAttack,
  restAtFire,
  throwEquippedThrowable,
  tick,
  useSlot,
  type GameEvent,
} from "../core/world.ts";
import { drawLighting, drawWorld, TILE, type Camera } from "./render.ts";
import { Fx } from "./fx.ts";
import { Input } from "./input.ts";
import { Hud, HOTBAR } from "./hud.ts";
import { audio } from "./audio.ts";

const WALK_SPEED = 3.6; // tiles/sec
const SPRINT_SPEED = 5.8;
const SPRINT_DRAIN = 20; // stamina/sec

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
    // Centre camera immediately so the first frame isn't a lurch.
    this.cam.x = world.player.pos.x * TILE - this.viewW / this.zoom / 2;
    this.cam.y = world.player.pos.y * TILE - this.viewH / this.zoom / 2;
    audio.setScene(isNight(world.timeOfDay) ? "night" : "day");
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.viewW = w;
    this.viewH = h;
    // Show ~24 tiles across, clamped, so the dark feels close.
    this.zoom = Math.max(1.1, Math.min(2.2, w / (24 * TILE)));
  }

  start(): void {
    this.last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(50, t - this.last);
      this.last = t;
      this.step(dt, t);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  stop(): void { cancelAnimationFrame(this.raf); }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx / this.zoom + this.cam.x) / TILE, y: (sy / this.zoom + this.cam.y) / TILE };
  }

  private step(dtMs: number, now: number): void {
    const world = this.world;
    const p = world.player;
    const ctx = { now, rng: this.rng };
    this.events.length = 0;

    // --- Aim toward the mouse ---
    const aim = this.screenToWorld(this.input.mouseX, this.input.mouseY);
    if (p.alive) p.facing = Math.atan2(aim.y - p.pos.y, aim.x - p.pos.x);

    // --- Movement + sprint ---
    if (p.alive && !this.hud.isPackOpen) {
      const mv = this.input.moveVec();
      const moving = mv.x !== 0 || mv.y !== 0;
      const wantSprint = this.input.held("shift") && moving && p.stamina > 1;
      p.sprinting = wantSprint;
      if (wantSprint) p.stamina = Math.max(0, p.stamina - (SPRINT_DRAIN * dtMs) / 1000);
      const speed = wantSprint ? SPRINT_SPEED : WALK_SPEED;
      movePlayer(world, mv.x, mv.y, dtMs, speed);

      // --- Actions ---
      if (this.input.mouseDown) playerAttack(world, this.content, ctx, this.events);
      if (this.input.pressed(" ")) {
        const dir = moving ? mv : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
        dodge(world, { now }, dir.x, dir.y, this.events);
      }
      if (this.input.pressed("e")) this.doInteract(ctx);
      if (this.input.pressed("q")) this.cycleWeapon();
      for (let i = 0; i < HOTBAR.length; i++) {
        if (this.input.pressed(String(i + 1))) this.useHotbar(HOTBAR[i]!, aim, ctx);
      }
    } else {
      p.sprinting = false;
    }

    if (this.input.pressed("tab")) {
      const bench = this.benchNearby();
      this.hud.togglePack(bench);
      audio.play("click");
    }

    // --- Advance the simulation ---
    tick(world, this.content, ctx, dtMs, this.events);
    this.dispatch(this.events, now);

    // --- Low-HP heartbeat ---
    if (p.alive && p.hp / p.maxHp < 0.3 && now > this.nextHeartbeat) {
      audio.play("lowhp");
      this.nextHeartbeat = now + 1100;
    }

    // --- Camera follow (eased) ---
    const tx = p.pos.x * TILE - this.viewW / this.zoom / 2;
    const ty = p.pos.y * TILE - this.viewH / this.zoom / 2;
    this.cam.x += (tx - this.cam.x) * 0.12;
    this.cam.y += (ty - this.cam.y) * 0.12;

    // --- Render ---
    this.fx.update(dtMs, now);
    this.shake *= 0.86;
    const shakeCam: Camera = {
      x: this.cam.x + (this.rng() - 0.5) * this.shake,
      y: this.cam.y + (this.rng() - 0.5) * this.shake,
    };
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.viewW, this.viewH);
    drawWorld(this.g, world, this.content, shakeCam, now, this.viewW, this.viewH, this.zoom);
    // World-space effects under the same zoom transform.
    this.g.setTransform(this.zoom, 0, 0, this.zoom, -shakeCam.x * this.zoom, -shakeCam.y * this.zoom);
    this.fx.draw(this.g);
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    drawLighting(this.g, world, shakeCam, this.viewW, this.viewH, this.zoom, this.fx.activeLights());

    // --- HUD ---
    this.hud.update(world, this.hoverPrompt());
    this.input.endFrame();
  }

  private benchNearby(): boolean {
    const pr = nearestProp(this.world, 1.6);
    return pr?.kind === "workbench";
  }

  private hoverPrompt(): string | null {
    if (!this.world.player.alive) return null;
    const pr = nearestProp(this.world, 1.4);
    if (!pr) return null;
    if (pr.kind === "campfire") return "Rest by the fire";
    if (pr.kind === "workbench") return "Use workbench";
    if (pr.used) return null;
    const label: Record<string, string> = { crate: "Search crate", locker: "Search locker", corpse: "Search body", car: "Search wreck", barrel: "Search barrel" };
    return label[pr.kind] ?? "Search";
  }

  private doInteract(ctx: { now: number; rng: () => number }): void {
    const res = interact(this.world, this.content, ctx, this.events);
    if (res.kind === "rest") {
      restAtFire(this.world, this.events);
      this.hud.showBanner("Rest", "Dawn will come. So will they.", 1800);
    } else if (res.kind === "bench") {
      if (!this.hud.isPackOpen) this.hud.togglePack(true);
      else this.hud.setBench(true);
    }
    this.dispatch(this.events, ctx.now);
    this.events.length = 0;
  }

  private useHotbar(id: ItemId, aim: { x: number; y: number }, ctx: { now: number; rng: () => number }): void {
    const idx = this.world.player.inv.findIndex((s) => s && s.id === id);
    if (idx < 0) return;
    const def = this.content.items[id]!;
    if (def.use === "throw") throwEquippedThrowable(this.world, this.content, ctx, idx, aim.x, aim.y, this.events);
    else useSlot(this.world, this.content, idx, this.events);
    this.dispatch(this.events, ctx.now);
    this.events.length = 0;
  }

  private cycleWeapon(): void {
    const weapons: ItemId[] = [];
    for (const s of this.world.player.inv) if (s && this.content.items[s.id]?.weapon) weapons.push(s.id);
    if (weapons.length === 0) return;
    const cur = this.world.player.equipped;
    const i = cur ? weapons.indexOf(cur) : -1;
    const next = weapons[(i + 1) % weapons.length]!;
    this.world.player.equipped = next;
    audio.play("equip");
    this.hud.pushLog(`Equipped ${this.content.items[next]!.name}.`);
  }

  private equip(id: ItemId): void {
    this.world.player.equipped = id;
    audio.play("equip");
    this.hud.pushLog(`Equipped ${this.content.items[id]!.name}.`);
  }

  handlers() {
    return {
      onCraft: (recipeId: string) => {
        const ev: GameEvent[] = [];
        const bench = this.benchNearby();
        if (craft(this.world, this.content, recipeId, bench, ev)) this.dispatch(ev, performance.now());
      },
      onEquip: (id: ItemId) => this.equip(id),
      onUseSlot: (i: number) => {
        const ev: GameEvent[] = [];
        useSlot(this.world, this.content, i, ev);
        this.dispatch(ev, performance.now());
      },
    };
  }

  private dispatch(events: GameEvent[], now: number): void {
    const p = this.world.player;
    for (const e of events) {
      switch (e.t) {
        case "melee": audio.play("melee"); break;
        case "hit":
          audio.play(e.crit ? "crit" : "hit");
          this.fx.blood(e.x, e.y, e.crit ? 16 : 9);
          this.fx.float(e.x, e.y - 0.4, String(e.dmg), e.crit ? "#ff6a4a" : "#e8d8b0", e.crit ? 17 : 13);
          break;
        case "gunshot": audio.play("gunshot"); this.fx.muzzle(p.pos.x, p.pos.y, p.facing); this.shake = Math.max(this.shake, 8); break;
        case "dryfire": audio.play("dryfire"); break;
        case "throw": audio.play("throw"); break;
        case "explode": audio.play("explode"); this.fx.explosion(e.x, e.y); this.shake = Math.max(this.shake, 14); break;
        case "dodge": audio.play("dodge"); break;
        case "kill":
          audio.creature(e.kind, "die");
          this.fx.blood(e.x, e.y, 22);
          break;
        case "aggro": audio.creature(e.kind, "aggro"); audio.sting(); break;
        case "playerHurt":
          audio.play("hurt");
          this.fx.float(p.pos.x, p.pos.y - 0.6, `-${e.dmg}`, "#ff4a3a", 15);
          this.fx.blood(p.pos.x, p.pos.y, 6);
          this.shake = Math.max(this.shake, 6 + e.dmg * 0.2);
          break;
        case "pickup":
          audio.play("pickup");
          this.hud.pushLog(`+${e.qty} ${this.content.items[e.id]?.name ?? e.id}`);
          break;
        case "craft": audio.play("craft"); this.hud.pushLog(`Crafted ${this.content.items[e.id]?.name ?? e.id}.`); break;
        case "heal": audio.play("heal"); break;
        case "eat": audio.play("eat"); break;
        case "drink": audio.play("drink"); break;
        case "search": audio.play("search"); break;
        case "equip": audio.play("equip"); break;
        case "dayBreak":
          audio.play("daybreak");
          audio.setScene("day");
          this.hud.showBanner(`Day ${e.day}`, "You made it to dawn.", 2400);
          break;
        case "nightFall":
          audio.play("nightfall");
          audio.setScene("night");
          this.hud.showBanner("Night", "They come with the dark. Find light.", 2400);
          break;
        case "death":
          audio.play("death");
          audio.setScene("day");
          this.hud.showDeath(this.world.day);
          break;
        case "log": this.hud.pushLog(e.msg); break;
      }
    }
    void now;
  }
}
