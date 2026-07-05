/**
 * src/client/hud.ts
 * -----------------
 * The HUD: vitals (HP / stamina / hunger / thirst / infection), a day-night
 * clock, a consumable hotbar, the interaction prompt, the message log, and the
 * pack + crafting panel. DOM overlays layered over the canvas; icons come from
 * the procedural glyph + item-icon generators (no images).
 */

import type { Content, ItemId, World } from "../core/types.ts";
import { glyph } from "./glyph.ts";
import { itemIconSVG } from "./itemIcon.ts";
import { canCraft, INV_COLS, isNight } from "../core/world.ts";
import { audio } from "./audio.ts";

export interface HudHandlers {
  onCraft: (recipeId: string) => void;
  onEquip: (itemId: ItemId) => void;
  onUseSlot: (slotIndex: number) => void;
}

/** Consumables bound to number keys 1–5. */
export const HOTBAR: ItemId[] = ["bandage", "cannedfood", "water", "molotov", "antibiotic"];

export class Hud {
  private vitals: HTMLElement;
  private clock: HTMLElement;
  private hotbar: HTMLElement;
  private promptEl: HTMLElement;
  private logEl: HTMLElement;
  private pack: HTMLElement;
  private banner: HTMLElement;
  private audioBtn: HTMLButtonElement;
  private packOpen = false;
  private atBench = false;
  private log: string[] = [];

  constructor(private root: HTMLElement, private content: Content, private handlers: HudHandlers) {
    root.innerHTML = "";
    this.vitals = this.panel("vitals", { left: "12px", top: "12px", minWidth: "190px" });
    this.clock = this.panel("clock", { right: "12px", top: "12px", textAlign: "right", minWidth: "150px" });
    this.logEl = this.panel("log", { left: "12px", bottom: "12px", maxWidth: "320px", fontSize: "12px", color: "var(--ink-dim)" });
    this.hotbar = this.floating({ left: "50%", bottom: "12px", transform: "translateX(-50%)", display: "flex", gap: "6px" });
    this.promptEl = this.floating({ left: "50%", bottom: "84px", transform: "translateX(-50%)", pointerEvents: "none" });
    this.pack = this.panel("pack", { left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(560px,92vw)", maxHeight: "86vh", overflow: "auto", display: "none" });

    this.banner = document.createElement("div");
    this.banner.className = "hud-banner";
    this.banner.style.opacity = "0";
    this.banner.style.transition = "opacity 0.6s ease";
    root.appendChild(this.banner);

    this.audioBtn = document.createElement("button");
    this.audioBtn.className = "act";
    this.audioBtn.style.position = "absolute";
    this.audioBtn.style.right = "12px";
    this.audioBtn.style.top = "92px";
    this.audioBtn.style.width = "40px";
    this.audioBtn.style.padding = "6px";
    this.audioBtn.innerHTML = iconMarkup(audio.getMuted() ? "mute" : "sound");
    this.audioBtn.onclick = () => {
      audio.setMuted(!audio.getMuted());
      this.audioBtn.innerHTML = iconMarkup(audio.getMuted() ? "mute" : "sound");
    };
    root.appendChild(this.audioBtn);
  }

  private panel(id: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
    const el = document.createElement("div");
    el.className = "hud-panel";
    el.id = `hud-${id}`;
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

  pushLog(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 6) this.log.shift();
  }

  togglePack(atBench: boolean): void {
    this.packOpen = !this.packOpen;
    this.atBench = atBench;
    this.pack.style.display = this.packOpen ? "block" : "none";
  }
  get isPackOpen(): boolean { return this.packOpen; }
  setBench(v: boolean): void { this.atBench = v; }

  showBanner(title: string, sub: string, hold = 2200): void {
    this.banner.innerHTML = `<h1>${title}</h1><p>${sub}</p>`;
    this.banner.style.opacity = "1";
    window.setTimeout(() => { this.banner.style.opacity = "0"; }, hold);
  }
  showDeath(day: number): void {
    this.banner.innerHTML = `<h1>You Died</h1><p>You lasted ${day} ${day === 1 ? "day" : "days"}. The Grid keeps its dead.</p><p style="margin-top:14px"><button class="act" id="restartBtn">Try Again</button></p>`;
    this.banner.style.opacity = "1";
    this.banner.style.pointerEvents = "auto";
    const btn = this.banner.querySelector<HTMLButtonElement>("#restartBtn");
    if (btn) btn.onclick = () => location.reload();
  }

  private bar(label: string, glyphName: string, val: number, max: number, color: string): string {
    const pct = Math.max(0, Math.min(100, (val / max) * 100));
    return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
      <span style="width:16px;height:16px;color:${color};display:inline-block">${glyph(glyphName)}</span>
      <div style="flex:1;height:9px;background:#0c0d0e;border:1px solid #26282a;border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};transition:width .12s linear"></div>
      </div>
      <span style="width:34px;text-align:right;color:var(--ink-dim);font-size:11px">${Math.ceil(val)}</span>
      <span style="display:none">${label}</span>
    </div>`;
  }

  update(world: World, prompt: string | null): void {
    const p = world.player;
    this.vitals.innerHTML =
      `<div class="hud-heading">Vitals</div>` +
      this.bar("Health", "heart", p.hp, p.maxHp, "#c23b2c") +
      this.bar("Stamina", "bolt", p.stamina, p.maxStamina, "#c8922e") +
      this.bar("Hunger", "meat", p.hunger, 100, "#9a6a3c") +
      this.bar("Thirst", "drop", p.thirst, 100, "#3f6d8c") +
      (p.infection > 0 ? this.bar("Infection", "biohazard", p.infection, 100, "#7f9a3c") : "");

    const night = isNight(world.timeOfDay);
    const alive = world.enemies.filter((e) => e.state !== "dead").length;
    const phase = Math.floor(world.timeOfDay * 24);
    this.clock.innerHTML =
      `<div class="hud-heading" style="justify-content:flex-end">Day ${world.day}</div>` +
      `<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;font-size:13px">
        <span style="width:16px;height:16px;color:${night ? "#8fa6c0" : "#c8922e"};display:inline-block">${glyph(night ? "moon" : "sun")}</span>
        <span style="color:${night ? "#8fa6c0" : "var(--ink)"}">${night ? "Night" : "Day"} · ${String(phase).padStart(2, "0")}:00</span>
      </div>` +
      `<div style="font-size:12px;color:var(--ink-dim);margin-top:4px">
        <span style="width:13px;height:13px;color:#8e2b23;display:inline-block;vertical-align:-2px">${glyph("skull")}</span> ${alive} nearby
      </div>`;

    // Hotbar.
    this.hotbar.innerHTML = HOTBAR.map((id, i) => {
      const def = this.content.items[id]!;
      const qty = count(world, id);
      const dim = qty > 0 ? 1 : 0.3;
      return `<div class="hud-panel" style="width:52px;height:52px;padding:3px;position:relative;opacity:${dim}">
        <div style="width:100%;height:100%">${itemIconSVG(def)}</div>
        <span style="position:absolute;top:1px;left:3px;font-size:10px;color:var(--ink-dim)">${i + 1}</span>
        <span style="position:absolute;bottom:1px;right:3px;font-size:11px;color:var(--ink)">${qty || ""}</span>
      </div>`;
    }).join("");

    // Prompt.
    this.promptEl.innerHTML = prompt
      ? `<div class="hud-panel prompt" style="color:var(--ink)"><b style="color:var(--amber)">[E]</b> ${prompt}</div>`
      : "";

    // Log.
    this.logEl.innerHTML =
      `<div class="hud-heading">Log</div>` +
      (this.log.length ? this.log.map((m) => `<div>${m}</div>`).join("") : `<div style="opacity:.5">…</div>`);

    if (this.packOpen) this.renderPack(world);
  }

  private renderPack(world: World): void {
    const p = world.player;
    const slots = p.inv
      .map((s, i) => {
        if (!s) return `<div class="slot empty"></div>`;
        const def = this.content.items[s.id]!;
        const equipped = p.equipped === s.id;
        return `<div class="slot" data-slot="${i}" title="${def.name} — ${def.desc}" style="${equipped ? "border-color:var(--amber)" : ""}">
          <div class="ic">${itemIconSVG(def)}</div>
          ${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ""}
          ${def.weapon ? `<span class="e">${equipped ? "✓" : ""}</span>` : ""}
        </div>`;
      })
      .join("");

    const recipes = this.content.recipes
      .map((r) => {
        const ok = canCraft(world, this.content, r.id, this.atBench);
        const need = r.inputs.map((i) => `${this.content.items[i.id]!.name} ×${i.qty}`).join(", ");
        const locked = r.bench && !this.atBench;
        return `<div class="recipe ${ok ? "ok" : "no"}" data-recipe="${r.id}">
          <div class="ic" style="width:34px;height:34px">${itemIconSVG(this.content.items[r.out]!)}</div>
          <div style="flex:1">
            <div style="color:${ok ? "var(--ink)" : "var(--ink-dim)"}">${r.name}${locked ? ' <span style="color:var(--rust)">· bench</span>' : ""}</div>
            <div style="font-size:11px;color:var(--ink-dim)">${need}</div>
          </div>
          <button class="act" ${ok ? "" : "disabled"} style="opacity:${ok ? 1 : 0.4}">Make</button>
        </div>`;
      })
      .join("");

    this.pack.innerHTML =
      `<style>
        #hud-pack .grid{display:grid;grid-template-columns:repeat(${INV_COLS},1fr);gap:5px;margin-bottom:14px}
        #hud-pack .slot{aspect-ratio:1;background:#101112;border:1px solid #26282a;border-radius:3px;position:relative;cursor:pointer}
        #hud-pack .slot.empty{opacity:.4;cursor:default}
        #hud-pack .slot .ic{width:100%;height:100%;padding:3px}
        #hud-pack .slot .q{position:absolute;bottom:1px;right:3px;font-size:11px}
        #hud-pack .slot .e{position:absolute;top:1px;right:3px;font-size:11px;color:var(--amber)}
        #hud-pack .recipe{display:flex;align-items:center;gap:10px;padding:6px;border-bottom:1px solid #1c1e20}
      </style>
      <div class="hud-heading">The Pack ${this.atBench ? "· <span style='color:var(--amber)'>Workbench</span>" : ""}</div>
      <div class="grid">${slots}</div>
      <div class="hud-heading">Craft</div>
      ${recipes}
      <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--ink-dim)">[Tab] close · click a weapon to equip · click an item to use</div>`;

    this.pack.querySelectorAll<HTMLElement>(".slot[data-slot]").forEach((el) => {
      el.onclick = () => {
        const i = Number(el.dataset["slot"]);
        const slot = world.player.inv[i];
        if (!slot) return;
        const def = this.content.items[slot.id]!;
        if (def.weapon) this.handlers.onEquip(slot.id);
        else this.handlers.onUseSlot(i);
      };
    });
    this.pack.querySelectorAll<HTMLElement>(".recipe").forEach((el) => {
      const btn = el.querySelector("button");
      if (btn && !btn.hasAttribute("disabled")) btn.onclick = () => this.handlers.onCraft(el.dataset["recipe"]!);
    });
  }
}

function count(world: World, id: ItemId): number {
  let n = 0;
  for (const s of world.player.inv) if (s && s.id === id) n += s.qty;
  return n;
}

function iconMarkup(name: string): string {
  return `<span style="width:16px;height:16px;display:inline-block;color:var(--ink)">${glyph(name)}</span>`;
}
