/**
 * src/client/hud.ts
 * -----------------
 * The HUD: vitals (health / hunger / thirst / infection), a day-night clock and
 * settler count, a consumable hotbar, the message log, and two modal panels —
 * the Pack (inventory + crafting, gated by your Forge/Workshop) and the
 * Settlement board (raise and upgrade structures). DOM over canvas; all icons
 * are procedural (glyphs + item icons).
 */

import type { Content, InvSlot, ItemId, SettlerRole, StructureId, World } from "../core/types.ts";
import { SETTLER_ROLES } from "../core/types.ts";
import { glyph } from "./glyph.ts";
import { itemIconSVG } from "./itemIcon.ts";
import { canBuild, canCraft, canSpendSkill, capacity, idleSettlers, INV_COLS, isNight } from "../core/world.ts";
import { SKILLS, TREE_NAMES, pointsInTree, xpForNext, nodeUnlocked, type SkillTree } from "../content/skills.ts";
import { audio } from "./audio.ts";

export interface HudHandlers {
  onCraft: (recipeId: string) => void;
  onBuild: (id: StructureId) => void;
  onEquip: (itemId: ItemId) => void;
  onUseSlot: (slotIndex: number) => void;
  onTravel: (regionId: string) => void;
  onAssign: (role: SettlerRole, delta: number) => void;
  onSkipTutorial: () => void;
  onSpendSkill: (nodeId: string) => void;
  onStore: (packIndex: number) => void;
  onTake: (stashIndex: number) => void;
}

const ROLE_INFO: Record<SettlerRole, { name: string; glyph: string; effect: string }> = {
  gatherer: { name: "Gatherer", glyph: "anvil", effect: "Timber, stone & ore each dawn" },
  forager: { name: "Forager", glyph: "meat", effect: "Food & physic each dawn" },
  guard: { name: "Guard", glyph: "shield", effect: "Holds the wall — thins night raids" },
};

export const HOTBAR: ItemId[] = ["poultice", "bread", "waterskin", "firebomb", "antidote"];

type NearStations = { forge: boolean; workshop: boolean };

export class Hud {
  private vitals: HTMLElement;
  private clock: HTMLElement;
  private hotbar: HTMLElement;
  private promptEl: HTMLElement;
  private logEl: HTMLElement;
  private pack: HTMLElement;
  private settle: HTMLElement;
  private travel: HTMLElement;
  private skillsP: HTMLElement;
  private stashP: HTMLElement;
  private bossBar: HTMLElement;
  private tracker: HTMLElement;
  private tipEl: HTMLElement;
  private banner: HTMLElement;
  private audioBtn: HTMLButtonElement;
  private mode: "none" | "pack" | "settle" | "travel" | "skills" | "stash" = "none";
  private near: NearStations = { forge: false, workshop: false };
  private log: string[] = [];
  private tipTimer = 0;
  private lastTask: string | null = null;

  constructor(private root: HTMLElement, private content: Content, private handlers: HudHandlers) {
    root.innerHTML = "";
    this.vitals = this.panel({ left: "12px", top: "12px", minWidth: "196px" });
    this.clock = this.panel({ right: "12px", top: "12px", textAlign: "right", minWidth: "160px" });
    this.logEl = this.panel({ left: "12px", bottom: "12px", maxWidth: "340px", fontSize: "12px", color: "var(--ink-dim)" });
    this.hotbar = this.floating({ left: "50%", bottom: "12px", transform: "translateX(-50%)", display: "flex", gap: "6px" });
    this.promptEl = this.floating({ left: "50%", bottom: "76px", transform: "translateX(-50%)", pointerEvents: "none", fontFamily: "'Cinzel',serif", fontSize: "13px", letterSpacing: "0.08em", color: "var(--amber)", textShadow: "0 1px 6px #000", whiteSpace: "nowrap" });
    this.pack = this.panel({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(560px,92vw)", maxHeight: "86vh", overflow: "auto", display: "none" });
    this.settle = this.panel({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(520px,92vw)", maxHeight: "86vh", overflow: "auto", display: "none" });
    this.travel = this.panel({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(520px,92vw)", maxHeight: "86vh", overflow: "auto", display: "none" });
    this.skillsP = this.panel({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(780px,96vw)", maxHeight: "90vh", overflow: "auto", display: "none" });
    this.stashP = this.panel({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(680px,94vw)", maxHeight: "88vh", overflow: "auto", display: "none" });

    this.bossBar = this.floating({ left: "50%", top: "64px", transform: "translateX(-50%)", width: "min(440px,72vw)", display: "none", textAlign: "center" });
    this.tracker = this.panel({ left: "12px", top: "172px", maxWidth: "230px", display: "none" });
    this.tipEl = this.floating({ left: "50%", top: "112px", transform: "translateX(-50%)", width: "min(460px,86vw)", textAlign: "center", opacity: "0", transition: "opacity 0.5s ease", pointerEvents: "none" });

    this.banner = document.createElement("div");
    this.banner.className = "hud-banner";
    this.banner.style.opacity = "0";
    this.banner.style.transition = "opacity 0.6s ease";
    root.appendChild(this.banner);

    this.audioBtn = document.createElement("button");
    this.audioBtn.className = "act";
    Object.assign(this.audioBtn.style, { position: "absolute", right: "12px", top: "104px", width: "40px", padding: "6px" });
    this.audioBtn.innerHTML = ico(audio.getMuted() ? "mute" : "sound");
    this.audioBtn.onclick = () => { audio.setMuted(!audio.getMuted()); this.audioBtn.innerHTML = ico(audio.getMuted() ? "mute" : "sound"); };
    root.appendChild(this.audioBtn);
  }

  private panel(style: Partial<CSSStyleDeclaration>): HTMLElement {
    const el = document.createElement("div");
    el.className = "hud-panel";
    Object.assign(el.style, style);
    this.root.appendChild(el);
    return el;
  }
  private floating(style: Partial<CSSStyleDeclaration>): HTMLElement {
    const el = document.createElement("div");
    el.style.position = "absolute";
    Object.assign(el.style, style);
    this.root.appendChild(el);
    return el;
  }

  pushLog(msg: string): void { this.log.push(msg); if (this.log.length > 6) this.log.shift(); }

  /** A transient onboarding/contextual tip, shown as a fading note. */
  tip(msg: string): void {
    this.tipEl.innerHTML = `<div style="display:inline-block;background:var(--panel);border:1px solid var(--amber);border-radius:4px;padding:9px 14px;font-size:14px;color:var(--ink);box-shadow:0 4px 18px rgba(0,0,0,0.6);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)">${msg}</div>`;
    this.tipEl.style.opacity = "1";
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => { this.tipEl.style.opacity = "0"; }, 4600);
  }

  /** Show/refresh the current onboarding objective (null hides the tracker).
   *  Hidden while a modal panel is open so it doesn't overlap. */
  setTask(task: string | null): void {
    this.tracker.style.display = task && !this.isModalOpen ? "block" : "none";
    if (task === this.lastTask) return;
    this.lastTask = task;
    if (!task) return;
    this.tracker.innerHTML =
      `<div class="hud-heading" style="color:var(--amber)">Objective</div>` +
      `<div style="font-size:13px;color:var(--ink);line-height:1.45">${task}</div>` +
      `<div style="margin-top:7px"><span id="tutSkip" style="font-size:11px;color:var(--ink-dim);cursor:pointer;pointer-events:auto;text-decoration:underline">skip tutorial</span></div>`;
    const sk = this.tracker.querySelector<HTMLElement>("#tutSkip");
    if (sk) sk.onclick = () => this.handlers.onSkipTutorial();
  }

  get isModalOpen(): boolean { return this.mode !== "none"; }
  private show(): void {
    this.pack.style.display = this.mode === "pack" ? "block" : "none";
    this.settle.style.display = this.mode === "settle" ? "block" : "none";
    this.travel.style.display = this.mode === "travel" ? "block" : "none";
    this.skillsP.style.display = this.mode === "skills" ? "block" : "none";
    this.stashP.style.display = this.mode === "stash" ? "block" : "none";
  }
  togglePack(): void { this.mode = this.mode === "pack" ? "none" : "pack"; this.show(); }
  toggleSkills(): void { this.mode = this.mode === "skills" ? "none" : "skills"; this.show(); }
  openPack(): void { this.mode = "pack"; this.show(); }
  openSettlement(): void { this.mode = "settle"; this.show(); }
  openTravel(): void { this.mode = "travel"; this.show(); }
  openStash(): void { this.mode = "stash"; this.show(); }
  closeAll(): void { this.mode = "none"; this.show(); }

  showBanner(title: string, sub: string, hold = 2200): void {
    this.banner.innerHTML = `<h1>${title}</h1><p>${sub}</p>`;
    this.banner.style.opacity = "1";
    window.setTimeout(() => { this.banner.style.opacity = "0"; }, hold);
  }
  showDeath(day: number): void {
    this.banner.innerHTML = `<h1>You Fell</h1><p>You held ${day} ${day === 1 ? "day" : "days"} against the dark.</p><p style="margin-top:14px"><button class="act" id="restartBtn">Begin Again</button></p>`;
    this.banner.style.opacity = "1";
    this.banner.style.pointerEvents = "auto";
    const btn = this.banner.querySelector<HTMLButtonElement>("#restartBtn");
    if (btn) btn.onclick = () => location.reload();
  }

  private bar(glyphName: string, val: number, max: number, color: string): string {
    const pct = Math.max(0, Math.min(100, (val / max) * 100));
    return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
      <span style="width:16px;height:16px;color:${color};display:inline-block">${glyph(glyphName)}</span>
      <div style="flex:1;height:9px;background:#0c0d0e;border:1px solid #26282a;border-radius:2px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${color};transition:width .12s linear"></div></div>
      <span style="width:32px;text-align:right;color:var(--ink-dim);font-size:11px">${Math.ceil(val)}</span>
    </div>`;
  }

  update(world: World, prompt: string | null, near: NearStations): void {
    this.near = near;
    this.promptEl.textContent = this.isModalOpen ? "" : (prompt ?? "");
    const p = world.player;
    const xpPct = Math.min(100, (p.xp / xpForNext(p.level)) * 100);
    this.vitals.innerHTML =
      `<div class="hud-heading">Vitals</div>` +
      this.bar("heart", p.hp, p.maxHp, "#c23b2c") +
      this.bar("meat", p.hunger, 100, "#9a6a3c") +
      this.bar("drop", p.thirst, 100, "#3f6d8c") +
      (p.infection > 0 ? this.bar("biohazard", p.infection, 100, "#7f9a3c") : "") +
      `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;border-top:1px solid #1c1e20;padding-top:6px">
        <span style="font-family:'Cinzel',serif;font-size:12px;color:var(--amber);white-space:nowrap">Lv ${p.level}</span>
        <div style="flex:1;height:6px;background:#0c0d0e;border:1px solid #26282a;border-radius:2px;overflow:hidden"><div style="width:${xpPct}%;height:100%;background:#6a5aa0"></div></div>
        ${p.points > 0 ? `<span style="font-size:11px;color:var(--amber);white-space:nowrap">+${p.points} pt${p.points > 1 ? "s" : ""}</span>` : ""}
      </div>`;

    const night = isNight(world.timeOfDay);
    const alive = world.enemies.filter((e) => e.state !== "dead").length;
    const phase = Math.floor(world.timeOfDay * 24);
    const cap = capacity(world);
    const zoneName = world.zoneId === "home" ? "Your Settlement" : (this.content.regions.find((r) => r.id === world.zoneId)?.name ?? "The Wilds");
    this.clock.innerHTML =
      `<div style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:.1em;color:var(--amber);text-align:right;margin-bottom:2px">${zoneName}</div>` +
      `<div class="hud-heading" style="justify-content:flex-end">Day ${world.day}</div>` +
      `<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;font-size:13px">
        <span style="width:16px;height:16px;color:${night ? "#8fa6c0" : "#c8922e"};display:inline-block">${glyph(night ? "moon" : "sun")}</span>
        <span style="color:${night ? "#8fa6c0" : "var(--ink)"}">${night ? "Night" : "Day"} · ${String(phase).padStart(2, "0")}:00</span>
      </div>` +
      `<div style="font-size:12px;color:var(--ink-dim);margin-top:4px;display:flex;gap:10px;justify-content:flex-end">
        <span><span style="width:13px;height:13px;color:#7aa06a;display:inline-block;vertical-align:-2px">${glyph("people")}</span> ${world.settlement.population}/${cap}</span>
        <span><span style="width:13px;height:13px;color:#8e2b23;display:inline-block;vertical-align:-2px">${glyph("skull")}</span> ${alive}</span>
      </div>`;

    this.hotbar.innerHTML = HOTBAR.map((id, i) => {
      const def = this.content.items[id]!;
      const qty = count(world, id);
      return `<div class="hud-panel" style="width:50px;height:50px;padding:3px;position:relative;opacity:${qty > 0 ? 1 : 0.3}">
        <div style="width:100%;height:100%">${itemIconSVG(def)}</div>
        <span style="position:absolute;top:1px;left:3px;font-size:10px;color:var(--ink-dim)">${i + 1}</span>
        <span style="position:absolute;bottom:1px;right:3px;font-size:11px;color:var(--ink)">${qty || ""}</span>
      </div>`;
    }).join("");

    this.logEl.innerHTML = `<div class="hud-heading">Log</div>` + (this.log.length ? this.log.map((m) => `<div>${m}</div>`).join("") : `<div style="opacity:.5">…</div>`);

    // Boss health bar.
    const boss = world.enemies.find((e) => e.boss && e.state !== "dead");
    if (boss && (boss.hp < boss.maxHp || boss.state === "hunt" || boss.state === "attack" || boss.state === "stagger")) {
      const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
      this.bossBar.style.display = "block";
      this.bossBar.innerHTML =
        `<div style="font-family:'Cinzel',serif;letter-spacing:.16em;color:var(--blood-bright);font-size:14px;text-transform:uppercase;text-shadow:0 1px 8px #000">${this.content.enemies[boss.kind].name}</div>` +
        `<div style="height:12px;background:#0c0d0e;border:1px solid #3a1512;border-radius:2px;overflow:hidden;margin-top:3px"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#8e2b23,#c23b2c);transition:width .15s linear"></div></div>`;
    } else {
      this.bossBar.style.display = "none";
    }

    if (this.mode === "pack") this.renderPack(world);
    else if (this.mode === "settle") this.renderSettlement(world);
    else if (this.mode === "travel") this.renderTravel(world);
    else if (this.mode === "skills") this.renderSkills(world);
    else if (this.mode === "stash") this.renderStash(world);
  }

  private renderStash(world: World): void {
    const cell = (s: InvSlot | null, kind: string, i: number): string => {
      if (!s) return `<div class="slot empty"></div>`;
      const def = this.content.items[s.id]!;
      return `<div class="slot" data-${kind}="${i}" title="${def.name} — ${def.desc}"><div class="ic">${itemIconSVG(def)}</div>${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ""}</div>`;
    };
    const pack = world.player.inv.map((s, i) => cell(s, "store", i)).join("");
    const stash = world.stash.map((s, i) => cell(s, "take", i)).join("");
    this.stashP.innerHTML =
      `<style>
        #hud-stash .grid{display:grid;gap:5px;margin-bottom:12px}
        #hud-stash .pk{grid-template-columns:repeat(6,1fr)}
        #hud-stash .sk{grid-template-columns:repeat(8,1fr)}
        #hud-stash .slot{aspect-ratio:1;background:#101112;border:1px solid #26282a;border-radius:3px;position:relative;cursor:pointer}
        #hud-stash .slot.empty{opacity:.4;cursor:default}#hud-stash .slot .ic{width:100%;height:100%;padding:3px}
        #hud-stash .slot .q{position:absolute;bottom:1px;right:3px;font-size:11px}
      </style>
      <div id="hud-stash">
        <div class="hud-heading">Your Pack <span style="color:var(--ink-dim);text-transform:none;letter-spacing:0">— click to store ▸</span></div>
        <div class="grid pk">${pack}</div>
        <div class="hud-heading">Storage <span style="color:var(--ink-dim);text-transform:none;letter-spacing:0">— click to take ◂ · safe if you fall</span></div>
        <div class="grid sk">${stash}</div>
        <div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">Bank your gains here before a dangerous run. [Esc] close</div>
      </div>`;
    this.stashP.querySelectorAll<HTMLElement>(".slot[data-store]").forEach((el) => { el.onclick = () => this.handlers.onStore(Number(el.dataset["store"])); });
    this.stashP.querySelectorAll<HTMLElement>(".slot[data-take]").forEach((el) => { el.onclick = () => this.handlers.onTake(Number(el.dataset["take"])); });
  }

  private renderSkills(world: World): void {
    const p = world.player;
    const COLX = [42, 110, 178], ROWY = [46, 118, 190, 262], R = 21;

    const treeSvg = (tree: SkillTree): string => {
      const nodes = SKILLS.filter((n) => n.tree === tree);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const cx = (n: (typeof nodes)[number]) => COLX[n.x]!;
      const cy = (n: (typeof nodes)[number]) => ROWY[n.y]!;

      // Prerequisite lines — bright where the parent is already taken.
      const edges = nodes.flatMap((n) => n.requires.map((rid) => {
        const par = byId.get(rid); if (!par) return "";
        const active = (p.skills[rid] ?? 0) > 0;
        return `<line x1="${cx(par)}" y1="${cy(par)}" x2="${cx(n)}" y2="${cy(n)}" stroke="${active ? "#c8922e" : "#2c2e30"}" stroke-width="3"/>`;
      })).join("");

      const circles = nodes.map((n) => {
        const rank = p.skills[n.id] ?? 0;
        const maxed = rank >= n.maxRank;
        const unlocked = nodeUnlocked(p.skills, n);
        const can = canSpendSkill(world, n.id);
        let fill = "#141517", stroke = "#2a2c2e", op = "0.5";
        if (maxed) { fill = "#e6b24e"; stroke = "#fff2cf"; op = "1"; }
        else if (rank > 0) { fill = "#c8922e"; stroke = "#e6c07a"; op = "1"; }
        else if (unlocked) { fill = "#1c1f22"; stroke = can ? "#c8922e" : "#5a5040"; op = "1"; }
        const inner = rank > 0 ? `<text x="${cx(n)}" y="${cy(n) + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#141013">${rank}</text>`
          : `<text x="${cx(n)}" y="${cy(n) + 4}" text-anchor="middle" font-size="12" fill="#5a5f5a">${n.maxRank}</text>`;
        const tip = `${n.name} — ${n.effect(Math.max(1, rank))} · ${rank}/${n.maxRank}${!unlocked ? " · locked" : can ? " · click to raise" : ""}`;
        return `<g data-skill="${n.id}" style="cursor:${can ? "pointer" : "default"};opacity:${op}"><title>${tip}</title>` +
          `<circle cx="${cx(n)}" cy="${cy(n)}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>${inner}` +
          `<text x="${cx(n)}" y="${cy(n) + R + 13}" text-anchor="middle" font-size="10" fill="#c3c6c4">${n.name}</text></g>`;
      }).join("");

      return `<div style="flex:1;min-width:200px"><div class="hud-heading" style="color:var(--amber);text-align:center">${TREE_NAMES[tree]} · ${pointsInTree(p.skills, tree)} pt</div>` +
        `<svg viewBox="0 0 220 300" width="100%" style="max-width:230px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">${edges}${circles}</svg></div>`;
    };

    this.skillsP.innerHTML =
      `<div class="hud-heading">Character — Level ${p.level} · <span style="color:var(--amber)">${p.points} skill point${p.points === 1 ? "" : "s"}</span></div>` +
      `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">${treeSvg("warfare")}${treeSvg("endurance")}${treeSvg("dominion")}</div>` +
      `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">Follow the lines — each perk unlocks the next. Hover for detail. [C] or [Esc] close</div>`;

    this.skillsP.querySelectorAll<SVGGElement>("g[data-skill]").forEach((el) => {
      el.onclick = () => this.handlers.onSpendSkill(el.dataset["skill"]!);
    });
  }

  private renderTravel(world: World): void {
    const W = 460, H = 340; // parchment map
    const hx = W / 2, hy = H / 2;
    const skulls = (n: number) => Array.from({ length: n }, () => "◆").join("");

    // Roads from the settlement out to each region.
    const roads = this.content.regions.map((r) => {
      const active = world.zoneId === r.id;
      return `<line x1="${hx}" y1="${hy}" x2="${r.mx * W}" y2="${r.my * H}" stroke="${active ? "#c8922e" : "#7a5a36"}" stroke-width="2.5" stroke-dasharray="4 5" opacity="0.7"/>`;
    }).join("");

    // Region pins.
    const pins = this.content.regions.map((r) => {
      const px = r.mx * W, py = r.my * H;
      const here = world.zoneId === r.id;
      const locked = !!r.requires && !r.requires.every((k) => world.bossesSlain.includes(k));
      const cleansed = !!r.final && world.won;
      const dcol = r.danger >= 4 ? "#a24bd6" : r.danger === 3 ? "#c23b2c" : r.danger === 2 ? "#c8922e" : "#7f9a3c";
      const labelLeft = r.mx < 0.5;
      const anchor = labelLeft ? "start" : "end";
      const lx = labelLeft ? px + 15 : px - 15;
      const fill = locked ? "#1a1712" : here ? "#c8922e" : "#2a2620";
      const stroke = cleansed ? "#e6b24e" : locked ? "#4a4030" : here ? "#fff2cf" : dcol;
      const sub = locked ? `<tspan fill="#7a6b4a">sealed</tspan>` : cleansed ? `<tspan fill="#e6b24e">cleansed</tspan>` : `<tspan fill="${dcol}">${skulls(r.danger)}</tspan>${here ? " · here" : ""}`;
      return `<g data-travel="${r.id}" style="cursor:pointer;opacity:${locked ? 0.7 : 1}">
        <title>${r.name} — ${locked ? "Slay both the Barrow King and the Pale Prior to unlock." : r.blurb}</title>
        <circle cx="${px}" cy="${py}" r="${here ? 11 : 9}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
        ${locked ? `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="11" fill="#c8922e">🔒</text>` : ""}
        <text x="${lx}" y="${py - 2}" text-anchor="${anchor}" font-size="13" font-family="Cinzel, serif" fill="#e6dcc4">${r.name}</text>
        <text x="${lx}" y="${py + 13}" text-anchor="${anchor}" font-size="11">${sub}</text>
      </g>`;
    }).join("");

    const atHome = world.zoneId === "home";
    const home = `<g data-travel="home" style="cursor:${atHome ? "default" : "pointer"}">
      <title>Your Settlement — safe walls, hearth, forge and workshop</title>
      <rect x="${hx - 13}" y="${hy - 11}" width="26" height="22" rx="2" fill="${atHome ? "#c8922e" : "#3a2c1c"}" stroke="${atHome ? "#fff2cf" : "#c8922e"}" stroke-width="2.5"/>
      <path d="M${hx - 15} ${hy - 11} L${hx} ${hy - 20} L${hx + 15} ${hy - 11}" fill="none" stroke="${atHome ? "#fff2cf" : "#c8922e"}" stroke-width="2.5"/>
      <text x="${hx}" y="${hy + 34}" text-anchor="middle" font-size="12" font-family="Cinzel, serif" fill="#e6dcc4">Settlement${atHome ? " · here" : ""}</text>
    </g>`;

    this.travel.innerHTML =
      `<div class="hud-heading" style="text-align:center">The Vale — ${atHome ? "choose an expedition" : "return, or press on"}</div>` +
      `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:radial-gradient(circle at 50% 45%, #2a2418, #1a160e);border:1px solid #4a3d2c;border-radius:4px" xmlns="http://www.w3.org/2000/svg">${roads}${home}${pins}</svg>` +
      `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">Time passes on the road — be home before the light fails. [Esc] close</div>`;

    this.travel.querySelectorAll<SVGGElement>("g[data-travel]").forEach((el) => {
      el.onclick = () => this.handlers.onTravel(el.dataset["travel"]!);
    });
  }

  private renderPack(world: World): void {
    const p = world.player;
    const slots = p.inv.map((s, i) => {
      if (!s) return `<div class="slot empty"></div>`;
      const def = this.content.items[s.id]!;
      const on = p.equipped === s.id || p.armor === s.id;
      return `<div class="slot" data-slot="${i}" title="${def.name} — ${def.desc}" style="${on ? "border-color:var(--amber)" : ""}">
        <div class="ic">${itemIconSVG(def)}</div>${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ""}${def.weapon || def.slot === "body" ? `<span class="e">${on ? "✓" : ""}</span>` : ""}
      </div>`;
    }).join("");

    const s = world.settlement.structures;
    const recipes = this.content.recipes.map((r) => {
      const structOk = (!r.forge || s.forge >= r.forge) && (!r.workshop || s.workshop >= r.workshop);
      const nearOk = (!r.forge || this.near.forge) && (!r.workshop || this.near.workshop);
      const ok = canCraft(world, this.content, r.id) && nearOk;
      const need = r.inputs.map((i) => `${this.content.items[i.id]!.name} ×${i.qty}`).join(", ");
      let note = "";
      if (!structOk) note = r.forge ? ` · needs Forge ${r.forge}` : ` · needs Workshop ${r.workshop}`;
      else if (!nearOk) note = r.forge ? " · at the forge" : " · at the workshop";
      return `<div class="recipe" data-recipe="${r.id}">
        <div class="ic" style="width:32px;height:32px">${itemIconSVG(this.content.items[r.out]!)}</div>
        <div style="flex:1"><div style="color:${ok ? "var(--ink)" : "var(--ink-dim)"}">${r.name}<span style="color:var(--rust)">${note}</span></div>
        <div style="font-size:11px;color:var(--ink-dim)">${need}</div></div>
        <button class="act" ${ok ? "" : "disabled"} style="opacity:${ok ? 1 : 0.4}">Make</button></div>`;
    }).join("");

    this.pack.innerHTML =
      `<style>
        #hud-pack-grid{display:grid;grid-template-columns:repeat(${INV_COLS},1fr);gap:5px;margin-bottom:14px}
        .slot{aspect-ratio:1;background:#101112;border:1px solid #26282a;border-radius:3px;position:relative;cursor:pointer}
        .slot.empty{opacity:.4;cursor:default}.slot .ic{width:100%;height:100%;padding:3px}
        .slot .q{position:absolute;bottom:1px;right:3px;font-size:11px}.slot .e{position:absolute;top:1px;right:3px;font-size:11px;color:var(--amber)}
        .recipe{display:flex;align-items:center;gap:10px;padding:6px;border-bottom:1px solid #1c1e20}
      </style>
      <div class="hud-heading">The Pack</div>
      <div id="hud-pack-grid">${slots}</div>
      <div class="hud-heading">Craft</div>${recipes}
      <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--ink-dim)">[Tab] close · click a weapon or armour to equip · click an item to use</div>`;

    this.pack.querySelectorAll<HTMLElement>(".slot[data-slot]").forEach((el) => {
      el.onclick = () => {
        const i = Number(el.dataset["slot"]);
        const slot = world.player.inv[i];
        if (!slot) return;
        const def = this.content.items[slot.id]!;
        if (def.weapon || def.slot === "body") this.handlers.onEquip(slot.id);
        else this.handlers.onUseSlot(i);
      };
    });
    this.pack.querySelectorAll<HTMLElement>(".recipe").forEach((el) => {
      const btn = el.querySelector("button");
      if (btn && !btn.hasAttribute("disabled")) btn.onclick = () => this.handlers.onCraft(el.dataset["recipe"]!);
    });
  }

  private renderSettlement(world: World): void {
    const cap = capacity(world);
    const rows = (Object.keys(this.content.structures) as StructureId[]).map((id) => {
      const def = this.content.structures[id];
      const level = world.settlement.structures[id];
      const maxed = level >= def.maxLevel;
      const cost = maxed ? null : def.costs[level]!;
      const affordable = !maxed && canBuild(world, this.content, id);
      const costStr = cost ? cost.map((c) => `${this.content.items[c.id]!.name} ×${c.qty}`).join(", ") : "—";
      const gicon = { palisade: "shield", forge: "anvil", workshop: "hammer", quarters: "home" }[id];
      return `<div class="srow">
        <span style="width:20px;height:20px;color:var(--amber);display:inline-block">${glyph(gicon)}</span>
        <div style="flex:1">
          <div style="color:var(--ink)">${def.name} <span style="color:var(--ink-dim);font-size:12px">Lv ${level}/${def.maxLevel}</span></div>
          <div style="font-size:12px;color:var(--toxic)">${def.effect(level)}</div>
          <div style="font-size:11px;color:var(--ink-dim)">${def.blurb}</div>
          ${maxed ? "" : `<div style="font-size:11px;color:${affordable ? "var(--ink-dim)" : "var(--rust)"};margin-top:2px">Cost: ${costStr}</div>`}
        </div>
        ${maxed ? `<span style="color:var(--amber);font-size:12px">MAX</span>` : `<button class="act" data-build="${id}" ${affordable ? "" : "disabled"} style="opacity:${affordable ? 1 : 0.4}">${level === 0 ? "Build" : "Upgrade"}</button>`}
      </div>`;
    }).join("");

    const idle = idleSettlers(world);
    const roleRows = SETTLER_ROLES.map((role) => {
      const info = ROLE_INFO[role];
      const n = world.settlement.roles[role];
      return `<div class="srow">
        <span style="width:20px;height:20px;color:var(--steel);display:inline-block">${glyph(info.glyph)}</span>
        <div style="flex:1"><div style="color:var(--ink)">${info.name}</div><div style="font-size:11px;color:var(--toxic)">${info.effect}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="act rbtn" data-role="${role}" data-delta="-1" style="width:26px;padding:6px 0" ${n > 0 ? "" : "disabled"}>−</button>
          <span style="min-width:16px;text-align:center;color:var(--ink)">${n}</span>
          <button class="act rbtn" data-role="${role}" data-delta="1" style="width:26px;padding:6px 0" ${idle > 0 ? "" : "disabled"}>+</button>
        </div>
      </div>`;
    }).join("");

    this.settle.innerHTML =
      `<style>.srow{display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #1c1e20}</style>
      <div class="hud-heading">Structures</div>
      ${rows}
      <div class="hud-heading" style="margin-top:12px">Your People — ${idle} idle of ${world.settlement.population}/${cap}</div>
      ${world.settlement.population > 0 ? roleRows : `<div style="font-size:12px;color:var(--ink-dim);padding:6px 4px">Rescue survivors in the wilds, then assign them here.</div>`}
      <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--ink-dim)">[Esc] close</div>`;

    this.settle.querySelectorAll<HTMLElement>("button[data-build]").forEach((el) => {
      if (!el.hasAttribute("disabled")) el.onclick = () => this.handlers.onBuild(el.dataset["build"] as StructureId);
    });
    this.settle.querySelectorAll<HTMLElement>("button.rbtn").forEach((el) => {
      if (!el.hasAttribute("disabled")) el.onclick = () => this.handlers.onAssign(el.dataset["role"] as SettlerRole, Number(el.dataset["delta"]));
    });
  }
}

function count(world: World, id: ItemId): number {
  let n = 0;
  for (const s of world.player.inv) if (s && s.id === id) n += s.qty;
  return n;
}
function ico(name: string): string {
  return `<span style="width:16px;height:16px;display:inline-block;color:var(--ink)">${glyph(name)}</span>`;
}
