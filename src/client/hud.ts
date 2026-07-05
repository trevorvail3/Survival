/**
 * src/client/hud.ts
 * -----------------
 * The HUD: vitals (health / hunger / thirst / infection), a day-night clock and
 * settler count, a consumable hotbar, the message log, and two modal panels —
 * the Pack (inventory + crafting, gated by your Forge/Workshop) and the
 * Settlement board (raise and upgrade structures). DOM over canvas; all icons
 * are procedural (glyphs + item icons).
 */

import type { Content, ItemId, SettlerRole, StructureId, World } from "../core/types.ts";
import { SETTLER_ROLES } from "../core/types.ts";
import { glyph } from "./glyph.ts";
import { itemIconSVG } from "./itemIcon.ts";
import { canBuild, canCraft, idleSettlers, INV_COLS, isNight } from "../core/world.ts";
import { settlementCapacity } from "../content/settlement.ts";
import { audio } from "./audio.ts";

export interface HudHandlers {
  onCraft: (recipeId: string) => void;
  onBuild: (id: StructureId) => void;
  onEquip: (itemId: ItemId) => void;
  onUseSlot: (slotIndex: number) => void;
  onTravel: (regionId: string) => void;
  onAssign: (role: SettlerRole, delta: number) => void;
  onSkipTutorial: () => void;
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
  private bossBar: HTMLElement;
  private tracker: HTMLElement;
  private tipEl: HTMLElement;
  private banner: HTMLElement;
  private audioBtn: HTMLButtonElement;
  private mode: "none" | "pack" | "settle" | "travel" = "none";
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

  /** Show/refresh the current onboarding objective (null hides the tracker). */
  setTask(task: string | null): void {
    if (task === this.lastTask) return;
    this.lastTask = task;
    if (!task) { this.tracker.style.display = "none"; return; }
    this.tracker.style.display = "block";
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
  }
  togglePack(): void { this.mode = this.mode === "pack" ? "none" : "pack"; this.show(); }
  openPack(): void { this.mode = "pack"; this.show(); }
  openSettlement(): void { this.mode = "settle"; this.show(); }
  openTravel(): void { this.mode = "travel"; this.show(); }
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
    this.vitals.innerHTML =
      `<div class="hud-heading">Vitals</div>` +
      this.bar("heart", p.hp, p.maxHp, "#c23b2c") +
      this.bar("meat", p.hunger, 100, "#9a6a3c") +
      this.bar("drop", p.thirst, 100, "#3f6d8c") +
      (p.infection > 0 ? this.bar("biohazard", p.infection, 100, "#7f9a3c") : "");

    const night = isNight(world.timeOfDay);
    const alive = world.enemies.filter((e) => e.state !== "dead").length;
    const phase = Math.floor(world.timeOfDay * 24);
    const cap = settlementCapacity(world.settlement.structures.quarters);
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
  }

  private renderTravel(world: World): void {
    const atHome = world.zoneId === "home";
    const skulls = (n: number) => `<span style="color:#8e2b23">${Array.from({ length: n }, () => "◆").join("")}</span>`;
    const homeRow = `<div class="wrow">
      <span style="width:20px;height:20px;color:var(--amber);display:inline-block">${glyph("home")}</span>
      <div style="flex:1"><div style="color:var(--ink)">Your Settlement</div><div style="font-size:11px;color:var(--ink-dim)">Safe walls, hearth, forge and workshop.</div></div>
      ${atHome ? `<span style="color:var(--amber);font-size:12px">HERE</span>` : `<button class="act" data-travel="home">Return</button>`}
    </div>`;
    const rows = this.content.regions.map((r) => {
      const here = world.zoneId === r.id;
      return `<div class="wrow">
        <span style="width:20px;height:20px;color:var(--toxic);display:inline-block">${glyph("map")}</span>
        <div style="flex:1"><div style="color:var(--ink)">${r.name} <span style="font-size:11px">${skulls(r.danger)}</span></div>
        <div style="font-size:11px;color:var(--ink-dim)">${r.blurb}</div></div>
        ${here ? `<span style="color:var(--amber);font-size:12px">HERE</span>` : `<button class="act" data-travel="${r.id}">Set Out</button>`}
      </div>`;
    }).join("");
    this.travel.innerHTML =
      `<style>.wrow{display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #1c1e20}</style>
      <div class="hud-heading">The Ways ${atHome ? "" : "· abroad"}</div>
      ${homeRow}${rows}
      <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--ink-dim)">Time passes on the road. Return before the light fails. [Esc] close</div>`;
    this.travel.querySelectorAll<HTMLElement>("button[data-travel]").forEach((el) => {
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
    const cap = settlementCapacity(world.settlement.structures.quarters);
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
