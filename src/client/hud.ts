/**
 * src/client/hud.ts
 * -----------------
 * The HUD: vitals (health / infection), a day-night clock and
 * settler count, a consumable hotbar, the message log, and two modal panels —
 * the Pack (inventory + crafting, gated by your Forge/Workshop) and the
 * Settlement board (raise and upgrade structures). DOM over canvas; all icons
 * are procedural (glyphs + item icons).
 */

import type { Content, InvSlot, ItemDef, ItemId, SettlerRole, StructureId, World } from "../core/types.ts";
import { SETTLER_ROLES } from "../core/types.ts";
import { glyph } from "./glyph.ts";
import { itemIconSVG } from "./itemIcon.ts";
import { canBuild, canCraft, canSpendSkill, capacity, dismantleYield, idleSettlers, INV_COLS } from "../core/world.ts";
import { SKILLS, TREE_NAMES, pointsInTree, xpForNext, nodeUnlocked, type SkillTree } from "../content/skills.ts";
import { SKILL_META, SKILL_GROUPS, SKILL_IDS, MAX_SKILL, levelForXp, levelProgress, type SkillId } from "../content/trainskills.ts";
import { RARITY_META, rarityOf, slotPower, characterPower, weaponDamage, armorSoak, isGearDef, ARMOR_SLOTS, TOOL_SKILLS } from "../content/gear.ts";
import { drawMinimap } from "./render.ts";
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
  onHotbar: (itemId: ItemId) => void;
  onTogglePack: () => void;
  onToggleSkills: () => void;
  onToggleSettlement: () => void;
  onToggleTravel: () => void;
  onToggleStash: () => void;
  onDismantle: (slotIndex: number) => void;
  onDecrypt: (slotIndex: number) => void;
}

const ROLE_INFO: Record<SettlerRole, { name: string; glyph: string; effect: string }> = {
  gatherer: { name: "Gatherer", glyph: "anvil", effect: "Timber, stone & ore each dawn" },
  forager: { name: "Forager", glyph: "meat", effect: "Food & physic each dawn" },
  guard: { name: "Guard", glyph: "shield", effect: "Works the quarry — ore & stone each dawn" },
};

export const HOTBAR: ItemId[] = ["poultice", "bread", "waterskin", "firebomb", "antidote"];

/** Human labels for equip slots (loadout + inspect cards). */
const SLOT_LABEL: Record<string, string> = {
  weapon: "Weapon", offhand: "Off-hand", head: "Head", body: "Body", hands: "Hands", legs: "Legs", feet: "Feet",
};

/** Describe a weapon's feel from its stats: attack speed, reach, and any
 *  armour-pen / crit / cleave traits — so each type reads as distinct. */
function weaponStatLines(_name: string, dmg: number, w: import("../core/types.ts").WeaponDef): string[] {
  const lines: string[] = [];
  const speed = w.cooldown <= 700 ? "Very fast" : w.cooldown <= 950 ? "Fast" : w.cooldown <= 1200 ? "Average" : w.cooldown <= 1400 ? "Slow" : "Very slow";
  const dps = Math.round((dmg * 1000) / w.cooldown);
  lines.push(`Damage ${dmg} · ${speed} (~${dps}/s)`);
  const traits: string[] = [];
  if (w.ammo) traits.push(`Ranged ${w.reach.toFixed(0)} tiles`);
  else if (w.reach >= 2) traits.push(`Reach ${w.reach.toFixed(1)}`);
  if (w.armorPen) traits.push(`Armour-pierce ${w.armorPen}`);
  if (w.crit) traits.push(`+${Math.round(w.crit * 100)}% crit`);
  if (w.cleave) traits.push("Cleaves");
  if (traits.length) lines.push(`<span style="color:var(--toxic)">${traits.join(" · ")}</span>`);
  return lines;
}

export type NearStations = { forge: boolean; workshop: boolean; townboard: boolean; maptable: boolean };

export class Hud {
  private vitals: HTMLElement;
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
  private bannerQueue: { title: string; sub: string; hold: number }[] = [];
  private bannerTimer = 0;
  private backdrop: HTMLElement;
  private inspectEl: HTMLElement;
  private inspectTimer = 0;
  private audioBtn: HTMLButtonElement;
  private mode: "none" | "pack" | "settle" | "travel" | "skills" | "stash" = "none";
  /** The docked side for all modal panels (flippable via the ⇄ control). */
  private panelSide: "left" | "right" = "left";
  private modalPanels: HTMLElement[] = [];
  private near: NearStations = { forge: false, workshop: false, townboard: false, maptable: false };
  private log: string[] = [];
  private tipTimer = 0;
  private lastTask: string | null = null;
  /** True when the open panel needs a DOM rebuild (see markDirty()). */
  private dirty = true;
  /** Last rendered hotbar signature (item:qty,...), to skip no-op rebuilds. */
  private hotbarSig = "";
  /** Tab-bar buttons keyed by the mode they open, for active-tab highlighting. */
  private tabButtons: Partial<Record<"pack" | "settle" | "travel" | "skills" | "stash", HTMLButtonElement>> = {};
  private mmCanvas: HTMLCanvasElement;

  constructor(private root: HTMLElement, private content: Content, private handlers: HudHandlers) {
    root.innerHTML = "";
    this.vitals = this.panel({ left: "12px", top: "12px", minWidth: "196px" });
    this.logEl = this.panel({ left: "12px", bottom: "12px", maxWidth: "340px", fontSize: "12px", color: "var(--ink-dim)" });
    this.hotbar = this.floating({ left: "50%", bottom: "12px", transform: "translateX(-50%)", display: "flex", gap: "6px" });
    this.promptEl = this.floating({ left: "50%", bottom: "76px", transform: "translateX(-50%)", pointerEvents: "none", fontFamily: "'Cinzel',serif", fontSize: "13px", letterSpacing: "0.08em", color: "var(--amber)", textShadow: "0 1px 6px #000", whiteSpace: "nowrap" });
    // Modal panels are stationary side-drawers, not floating centre overlays:
    // docked to one edge (top-to-bottom), a fixed minimal width, flippable
    // left/right (see applyPanelSide / the ⇄ control). Left by default so the
    // right-hand tab strip stays clear.
    const dock: Partial<CSSStyleDeclaration> = {
      position: "fixed", top: "12px", bottom: "12px", width: "min(370px,94vw)",
      overflow: "auto", display: "none", zIndex: "50", transform: "none",
    };
    this.pack = this.panel({ ...dock });
    this.settle = this.panel({ ...dock });
    this.travel = this.panel({ ...dock });
    this.skillsP = this.panel({ ...dock });
    this.stashP = this.panel({ ...dock });
    this.modalPanels = [this.pack, this.settle, this.travel, this.skillsP, this.stashP];
    this.applyPanelSide();

    this.bossBar = this.floating({ left: "50%", top: "64px", transform: "translateX(-50%)", width: "min(440px,72vw)", display: "none", textAlign: "center" });
    this.tracker = this.panel({ left: "12px", top: "172px", maxWidth: "230px", display: "none" });
    this.tipEl = this.floating({ left: "50%", top: "112px", transform: "translateX(-50%)", width: "min(460px,86vw)", textAlign: "center", opacity: "0", transition: "opacity 0.5s ease", pointerEvents: "none" });

    // Transparent click-catcher behind the docked panel — tapping anywhere off
    // the panel closes it. No dimming: the world stays fully visible (minimal).
    this.backdrop = document.createElement("div");
    Object.assign(this.backdrop.style, {
      position: "fixed", inset: "0", background: "transparent",
      zIndex: "40", display: "none", pointerEvents: "auto",
    } as Partial<CSSStyleDeclaration>);
    this.backdrop.onclick = () => this.closeAll();
    root.appendChild(this.backdrop);

    // Inspect tooltip — hover (desktop) or long-press (touch) an item to read it.
    this.inspectEl = document.createElement("div");
    this.inspectEl.className = "hud-panel";
    Object.assign(this.inspectEl.style, {
      position: "fixed", zIndex: "60", maxWidth: "230px", display: "none",
      pointerEvents: "none", fontSize: "12px", lineHeight: "1.5",
    } as Partial<CSSStyleDeclaration>);
    root.appendChild(this.inspectEl);

    this.banner = document.createElement("div");
    this.banner.className = "hud-banner";
    this.banner.style.opacity = "0";
    this.banner.style.transition = "opacity 0.6s ease";
    root.appendChild(this.banner);

    this.audioBtn = document.createElement("button");
    this.audioBtn.className = "act";
    Object.assign(this.audioBtn.style, { position: "absolute", right: "12px", top: "144px", width: "40px", padding: "6px" });
    this.audioBtn.innerHTML = ico(audio.getMuted() ? "mute" : "sound");
    this.audioBtn.onclick = () => { audio.setMuted(!audio.getMuted()); this.audioBtn.innerHTML = ico(audio.getMuted() ? "mute" : "sound"); };
    root.appendChild(this.audioBtn);

    // Minimap — a small always-on overhead view of your surroundings, tucked
    // into the top-right corner.
    const mmSize = 120;
    const mmWrap = document.createElement("div");
    Object.assign(mmWrap.style, {
      position: "absolute", right: "12px", top: "12px", width: `${mmSize}px`, height: `${mmSize}px`,
      borderRadius: "50%", overflow: "hidden", border: "2px solid var(--panel-edge)",
      boxShadow: "0 4px 18px rgba(0,0,0,0.6)",
    } as Partial<CSSStyleDeclaration>);
    this.mmCanvas = document.createElement("canvas");
    this.mmCanvas.width = mmSize; this.mmCanvas.height = mmSize;
    mmWrap.appendChild(this.mmCanvas);
    root.appendChild(mmWrap);

    this.buildTabBar();
  }

  /** Redraw the minimap — call once per frame with the live world. */
  renderMinimap(world: World): void {
    const g = this.mmCanvas.getContext("2d");
    if (g) drawMinimap(g, world, this.mmCanvas.width, 16);
  }

  /** The permanent, always-visible OSRS-style tab strip — every panel opens by
   *  clicking here. There is no keyboard control surface and no device-specific
   *  gating: the same buttons serve mouse and touch. */
  private buildTabBar(): void {
    const TABS: { mode: "pack" | "settle" | "travel" | "skills" | "stash"; glyphName: string; label: string; onTap: () => void }[] = [
      { mode: "pack", glyphName: "backpack", label: "Pack", onTap: () => this.handlers.onTogglePack() },
      { mode: "skills", glyphName: "sword", label: "Skills", onTap: () => this.handlers.onToggleSkills() },
      { mode: "settle", glyphName: "home", label: "Settlement", onTap: () => this.handlers.onToggleSettlement() },
      { mode: "travel", glyphName: "map", label: "Expedition", onTap: () => this.handlers.onToggleTravel() },
      { mode: "stash", glyphName: "box", label: "Stash", onTap: () => this.handlers.onToggleStash() },
    ];
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      position: "absolute", right: "12px", top: "200px", zIndex: "55",
      display: "flex", flexDirection: "column", gap: "6px",
    } as Partial<CSSStyleDeclaration>);
    for (const t of TABS) {
      const b = document.createElement("button");
      b.className = "act tabBtn";
      b.title = t.label;
      b.setAttribute("aria-label", t.label);
      Object.assign(b.style, {
        width: "44px", height: "44px", padding: "9px", borderRadius: "6px",
      } as Partial<CSSStyleDeclaration>);
      b.innerHTML = `<span style="width:100%;height:100%;display:block">${glyph(t.glyphName)}</span>`;
      b.onclick = t.onTap;
      bar.appendChild(b);
      this.tabButtons[t.mode] = b;
    }
    this.root.appendChild(bar);
  }

  /** Amber-highlight whichever tab's panel is currently open. */
  private updateTabHighlight(): void {
    for (const [m, btn] of Object.entries(this.tabButtons)) {
      btn.style.borderColor = m === this.mode ? "var(--amber)" : "";
      btn.style.color = m === this.mode ? "var(--amber)" : "";
    }
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
    this.backdrop.style.display = this.mode === "none" ? "none" : "block";
    this.dirty = true;
    this.updateTabHighlight();
  }
  togglePack(): void { this.mode = this.mode === "pack" ? "none" : "pack"; this.show(); }
  toggleSkills(): void { this.mode = this.mode === "skills" ? "none" : "skills"; this.show(); }
  toggleSettlement(): void { this.mode = this.mode === "settle" ? "none" : "settle"; this.show(); }
  toggleTravel(): void { this.mode = this.mode === "travel" ? "none" : "travel"; this.show(); }
  toggleStash(): void { this.mode = this.mode === "stash" ? "none" : "stash"; this.show(); }
  openPack(): void { this.mode = "pack"; this.show(); }
  openSettlement(): void { this.mode = "settle"; this.show(); }
  openTravel(): void { this.mode = "travel"; this.show(); }
  openStash(): void { this.mode = "stash"; this.show(); }
  closeAll(): void { this.mode = "none"; this.show(); }

  /** Force the open panel to rebuild on the next update() — call after any
   *  action that changes what it shows (craft, build, equip, travel, ...). A
   *  panel's DOM is otherwise built ONCE per open and left alone: rebuilding it
   *  every frame (the old behaviour) destroys and recreates every element —
   *  including whatever the player's mouse is on — so a real human's
   *  mousedown-to-mouseup (which spans several frames) never lands a `click`,
   *  since the browser only fires one when mouseup's target is still the
   *  element mousedown started on. */
  markDirty(): void { this.dirty = true; }

  /** Rich inspect card for an inventory slot — name, rarity/Power, stats, text. */
  private inspectHTML(s: InvSlot): string {
    const def = this.content.items[s.id];
    if (!def) return "";
    const gear = isGearDef(def);
    const stat: string[] = [];
    let head: string;
    if (gear) {
      const rm = RARITY_META[rarityOf(s)];
      head = `<span style="color:${rm.color};font-family:'Cinzel',serif">${rm.name} ${def.name}</span>`;
      stat.push(`<span style="color:var(--amber)">◈ Power ${slotPower(s)}</span>`);
      if (def.weapon) {
        const w = def.weapon;
        stat.push(...weaponStatLines(def.name, weaponDamage(def, s), w));
      } else {
        stat.push(`Armour ${armorSoak(def, s)} · ${SLOT_LABEL[def.slot ?? "body"] ?? def.slot}`);
      }
      const y = dismantleYield(this.content, s, false);
      stat.push(`<span style="color:var(--ink-dim)">Salvage → ${y.qty} ${this.content.items[y.id]?.name ?? y.id} (2× at base)</span>`);
    } else {
      head = `<span style="font-family:'Cinzel',serif">${def.name}</span>`;
      if (def.heal) stat.push(`Heals ${def.heal}`);
      if (def.cure) stat.push(`Cures ${def.cure} rot`);
      if (def.throwDamage) stat.push(`Throw ${def.throwDamage} dmg`);
    }
    return `<div style="color:var(--ink);margin-bottom:3px">${head}</div>` +
      (stat.length ? `<div style="color:var(--ink);margin-bottom:4px">${stat.join(" · ")}</div>` : "") +
      `<div style="color:var(--ink-dim);font-style:italic">${def.desc}</div>`;
  }

  private showInspect(s: InvSlot, x: number, y: number): void {
    const html = this.inspectHTML(s);
    if (!html) return;
    this.inspectEl.innerHTML = html;
    this.inspectEl.style.display = "block";
    // Clamp to the viewport (offset from the cursor/finger).
    const w = 230, gx = Math.min(x + 14, window.innerWidth - w - 8);
    const gy = Math.min(y + 14, window.innerHeight - this.inspectEl.offsetHeight - 8);
    this.inspectEl.style.left = `${Math.max(8, gx)}px`;
    this.inspectEl.style.top = `${Math.max(8, gy)}px`;
  }
  private hideInspect(): void { this.inspectEl.style.display = "none"; }

  /** Wire hover (desktop) + long-press (touch) inspect onto a slot element.
   *  Returns whether a long-press just fired, so the click handler can skip. */
  private attachInspect(el: HTMLElement, get: () => InvSlot | null): void {
    el.addEventListener("mouseenter", (e) => { const s = get(); if (s) this.showInspect(s, e.clientX, e.clientY); });
    el.addEventListener("mousemove", (e) => { if (this.inspectEl.style.display !== "none") { const s = get(); if (s) this.showInspect(s, e.clientX, e.clientY); } });
    el.addEventListener("mouseleave", () => this.hideInspect());
    el.addEventListener("touchstart", (e) => {
      const t = e.touches[0]; if (!t) return;
      if (this.inspectTimer) clearTimeout(this.inspectTimer);
      this.inspectTimer = window.setTimeout(() => {
        const s = get(); if (s) { this.showInspect(s, t.clientX, t.clientY); el.dataset["longpress"] = "1"; window.setTimeout(() => this.hideInspect(), 2600); }
      }, 400);
    }, { passive: true });
    const cancel = () => { if (this.inspectTimer) { clearTimeout(this.inspectTimer); this.inspectTimer = 0; } };
    el.addEventListener("touchend", cancel);
    el.addEventListener("touchmove", cancel);
    el.addEventListener("touchcancel", cancel);
  }

  private addClose(panel: HTMLElement): void {
    // Sticky controls pinned to the panel's top edge (stay put as it scrolls):
    // ✕ closes; ⇄ flips the drawer to the other side.
    const btn = (cls: string, label: string, glyph: string) =>
      `<button class="act ${cls}" aria-label="${label}" title="${label}" style="position:sticky;float:right;top:0;margin:-2px -2px 0 8px;width:34px;height:34px;padding:0;border-radius:50%;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;z-index:2">${glyph}</button>`;
    panel.insertAdjacentHTML("afterbegin", btn("closeX", "close", "✕") + btn("flipX", "move left/right", "⇄"));
    const x = panel.querySelector<HTMLButtonElement>(".closeX");
    if (x) x.onclick = () => this.closeAll();
    const f = panel.querySelector<HTMLButtonElement>(".flipX");
    if (f) f.onclick = () => this.flipSide();
  }

  /** Dock every modal panel to the current side. */
  private applyPanelSide(): void {
    for (const el of this.modalPanels) {
      if (this.panelSide === "left") { el.style.left = "12px"; el.style.right = "auto"; }
      else { el.style.right = "12px"; el.style.left = "auto"; }
    }
  }
  private flipSide(): void {
    this.panelSide = this.panelSide === "left" ? "right" : "left";
    this.applyPanelSide();
  }

  /** Queues a banner rather than showing it immediately — several GameEvents
   *  (a boss kill's levelUp + guaranteed drop, say) can fire in the same
   *  dispatch, and overwriting a still-visible banner mid-hold loses it. */
  showBanner(title: string, sub: string, hold = 2200): void {
    this.bannerQueue.push({ title, sub, hold });
    if (!this.bannerTimer) this.advanceBanner();
  }
  private advanceBanner(): void {
    const next = this.bannerQueue.shift();
    if (!next) { this.bannerTimer = 0; return; }
    this.banner.innerHTML = `<h1>${next.title}</h1><p>${next.sub}</p>`;
    this.banner.style.opacity = "1";
    this.bannerTimer = window.setTimeout(() => {
      this.banner.style.opacity = "0";
      this.bannerTimer = window.setTimeout(() => this.advanceBanner(), 500);
    }, next.hold);
  }
  showDeath(day: number): void {
    this.bannerQueue.length = 0;
    if (this.bannerTimer) { window.clearTimeout(this.bannerTimer); this.bannerTimer = 0; }
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
      (p.infection > 0 ? this.bar("biohazard", p.infection, 100, "#7f9a3c") : "") +
      `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;border-top:1px solid #1c1e20;padding-top:6px">
        <span style="font-family:'Cinzel',serif;font-size:12px;color:var(--amber);white-space:nowrap">Lv ${p.level}</span>
        <div style="flex:1;height:6px;background:#0c0d0e;border:1px solid #26282a;border-radius:2px;overflow:hidden"><div style="width:${xpPct}%;height:100%;background:#6a5aa0"></div></div>
        ${p.points > 0 ? `<span style="font-size:11px;color:var(--amber);white-space:nowrap">+${p.points} pt${p.points > 1 ? "s" : ""}</span>` : ""}
      </div>` +
      `<div style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px">
        <span style="color:var(--amber);font-family:'Cinzel',serif">◈ Power ${characterPower(p.equipped, [...ARMOR_SLOTS.map((s) => p.armor[s]), p.offhand])}</span>
        ${world.zoneId !== "home" ? `<span style="color:var(--ink-dim);font-size:11px">/ rec. ${this.content.regions.find((r) => r.id === world.zoneId)?.power ?? 0}</span>` : ""}
      </div>`;

    // Rebuild only when a shown quantity actually changed — quantities are
    // touched from many places (pickup, craft, use, salvage, store/take), too
    // many to flag individually, so compare a cheap signature instead. See
    // markDirty() for why rebuilding on every frame breaks real mouse clicks.
    const hotbarSig = HOTBAR.map((id) => `${id}:${count(world, id)}`).join(",");
    if (hotbarSig !== this.hotbarSig) {
      this.hotbarSig = hotbarSig;
      this.hotbar.innerHTML = HOTBAR.map((id, i) => {
        const def = this.content.items[id]!;
        const qty = count(world, id);
        return `<div class="hud-panel" data-hotbar="${id}" style="width:50px;height:50px;padding:3px;position:relative;opacity:${qty > 0 ? 1 : 0.3};cursor:${qty > 0 ? "pointer" : "default"}">
          <div style="width:100%;height:100%">${itemIconSVG(def)}</div>
          <span style="position:absolute;top:1px;left:3px;font-size:10px;color:var(--ink-dim)">${i + 1}</span>
          <span style="position:absolute;bottom:1px;right:3px;font-size:11px;color:var(--ink)">${qty || ""}</span>
        </div>`;
      }).join("");
      this.hotbar.querySelectorAll<HTMLElement>("[data-hotbar]").forEach((el) => {
        const id = el.dataset["hotbar"] as ItemId;
        this.attachInspect(el, () => (count(world, id) > 0 ? { id, qty: count(world, id) } : { id, qty: 0 }));
        if (count(world, id) > 0) el.onclick = () => { if (el.dataset["longpress"]) { delete el.dataset["longpress"]; return; } this.handlers.onHotbar(id); };
      });
    }

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

    // Rebuild the open panel's DOM only when something actually changed —
    // see markDirty() for why a per-frame rebuild breaks real mouse clicks.
    if (this.dirty) {
      if (this.mode === "pack") this.renderPack(world);
      else if (this.mode === "settle") this.renderSettlement(world);
      else if (this.mode === "travel") this.renderTravel(world);
      else if (this.mode === "skills") this.renderSkills(world);
      else if (this.mode === "stash") this.renderStash(world);
      this.dirty = false;
    }
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
        <div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">Bank your gains here before a dangerous run.</div>
      </div>`;
    this.stashP.querySelectorAll<HTMLElement>(".slot[data-store]").forEach((el) => {
      const i = Number(el.dataset["store"]);
      this.attachInspect(el, () => world.player.inv[i] ?? null);
      el.onclick = () => { if (el.dataset["longpress"]) { delete el.dataset["longpress"]; return; } this.handlers.onStore(i); };
    });
    this.stashP.querySelectorAll<HTMLElement>(".slot[data-take]").forEach((el) => {
      const i = Number(el.dataset["take"]);
      this.attachInspect(el, () => world.stash[i] ?? null);
      el.onclick = () => { if (el.dataset["longpress"]) { delete el.dataset["longpress"]; return; } this.handlers.onTake(i); };
    });
    this.addClose(this.stashP);
  }

  private skillTotal(world: World): number {
    return SKILL_IDS.reduce((n, id) => n + levelForXp(world.player.trained[id] ?? 0), 0);
  }

  /** The OSRS-style trainable skills, grouped, each with level + XP bar. */
  private trainedGrid(world: World): string {
    const t = world.player.trained;
    const chip = (id: SkillId): string => {
      const m = SKILL_META[id];
      const xp = t[id] ?? 0;
      const lvl = levelForXp(xp);
      const prog = Math.round(levelProgress(xp) * 100);
      const maxed = lvl >= MAX_SKILL;
      return `<div title="${m.name} — ${m.blurb}" style="display:flex;align-items:center;gap:7px;background:#101112;border:1px solid #24262a;border-radius:3px;padding:5px 7px">
        <span style="width:17px;height:17px;color:var(--amber);flex:none;display:inline-block">${glyph(m.glyph)}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink)"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</span><span style="color:${maxed ? "var(--amber)" : "var(--ink-dim)"};padding-left:6px">${lvl}${maxed ? "" : `/${MAX_SKILL}`}</span></div>
          <div style="height:4px;background:#0c0d0e;border-radius:2px;overflow:hidden;margin-top:3px"><div style="width:${maxed ? 100 : prog}%;height:100%;background:${maxed ? "var(--amber)" : "#6a5aa0"}"></div></div>
        </div>
      </div>`;
    };
    const groups = SKILL_GROUPS.map((g) => {
      const ids = SKILL_IDS.filter((id) => SKILL_META[id].group === g);
      return `<div style="flex:1;min-width:150px">
        <div style="font-family:'Cinzel',serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-dim);margin:0 0 4px 2px">${g}</div>
        <div style="display:grid;grid-template-columns:1fr;gap:4px">${ids.map(chip).join("")}</div>
      </div>`;
    }).join("");
    return `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">${groups}</div>`;
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
      `<div class="hud-heading">Character — Level ${p.level} · <span style="color:var(--amber)">${p.points} skill point${p.points === 1 ? "" : "s"}</span> · Skill total ${this.skillTotal(world)}</div>` +
      this.trainedGrid(world) +
      `<div class="hud-heading" style="margin-top:14px">Perks — spend points earned by levelling up</div>` +
      `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">${treeSvg("warfare")}${treeSvg("endurance")}${treeSvg("dominion")}</div>` +
      `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">Skills grow as you use them. Perks unlock along the lines — hover for detail.</div>`;

    this.skillsP.querySelectorAll<SVGGElement>("g[data-skill]").forEach((el) => {
      el.onclick = () => this.handlers.onSpendSkill(el.dataset["skill"]!);
    });
    this.addClose(this.skillsP);
  }

  private renderTravel(world: World): void {
    const W = 460, H = 340; // parchment map
    const hx = W / 2, hy = H / 2;
    const skulls = (n: number) => Array.from({ length: n }, () => "◆").join("");
    // You choose an expedition from HOME. Out in the field the map is a
    // reference only — there is no warp-home button; you leave by reaching a
    // waystone (an extraction point) on foot.
    const atHome = world.zoneId === "home";

    // Roads from the settlement out to each region.
    const roads = this.content.regions.map((r) => {
      const active = world.zoneId === r.id;
      return `<line x1="${hx}" y1="${hy}" x2="${r.mx * W}" y2="${r.my * H}" stroke="${active ? "#c8922e" : "#7a5a36"}" stroke-width="2.5" stroke-dasharray="4 5" opacity="0.7"/>`;
    }).join("");

    // Region pins.
    const myPow = characterPower(world.player.equipped, [...ARMOR_SLOTS.map((s) => world.player.armor[s]), world.player.offhand]);
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
      const powCol = myPow >= r.power ? "#7f9a3c" : myPow >= r.power - 8 ? "#c8922e" : "#c23b2c";
      const powTag = locked || cleansed ? "" : ` <tspan fill="${powCol}">◈${r.power}</tspan>`;
      const sub = locked ? `<tspan fill="#7a6b4a">sealed</tspan>` : cleansed ? `<tspan fill="#e6b24e">cleansed</tspan>` : `<tspan fill="${dcol}">${skulls(r.danger)}</tspan>${powTag}${here ? " · here" : ""}`;
      const clickable = atHome && this.near.maptable && !locked;
      return `<g ${clickable ? `data-travel="${r.id}"` : ""} style="cursor:${clickable ? "pointer" : "default"};opacity:${locked ? 0.7 : 1}">
        <title>${r.name} — ${locked ? "Slay both the Barrow King and the Pale Prior to unlock." : r.blurb}</title>
        <circle cx="${px}" cy="${py}" r="${here ? 11 : 9}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
        ${locked ? `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="11" fill="#c8922e">🔒</text>` : ""}
        <text x="${lx}" y="${py - 2}" text-anchor="${anchor}" font-size="13" font-family="Cinzel, serif" fill="#e6dcc4">${r.name}</text>
        <text x="${lx}" y="${py + 13}" text-anchor="${anchor}" font-size="11">${sub}</text>
      </g>`;
    }).join("");

    const home = `<g style="cursor:default">
      <title>Your Settlement — safe walls, hearth, forge and workshop</title>
      <rect x="${hx - 13}" y="${hy - 11}" width="26" height="22" rx="2" fill="${atHome ? "#c8922e" : "#3a2c1c"}" stroke="${atHome ? "#fff2cf" : "#c8922e"}" stroke-width="2.5"/>
      <path d="M${hx - 15} ${hy - 11} L${hx} ${hy - 20} L${hx + 15} ${hy - 11}" fill="none" stroke="${atHome ? "#fff2cf" : "#c8922e"}" stroke-width="2.5"/>
      <text x="${hx}" y="${hy + 34}" text-anchor="middle" font-size="12" font-family="Cinzel, serif" fill="#e6dcc4">Settlement${atHome ? " · here" : ""}</text>
    </g>`;

    const footer = !atHome
      ? `You're in the field. There's no warp home — reach a <span style="color:#78b4dc">waystone</span> (an extraction point) on foot to leave with your haul. Slaying the region's warden opens one where it falls.`
      : this.near.maptable
        ? `Choose an expedition — click a region to set out. Time passes on the road.`
        : `<span style="color:var(--rust)">Stand at the war map</span> in your settlement to set out on an expedition.`;

    this.travel.innerHTML =
      `<div class="hud-heading" style="text-align:center">The Hold — ${atHome ? "choose an expedition" : "extraction"}</div>` +
      `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:radial-gradient(circle at 50% 45%, #2a2418, #1a160e);border:1px solid #4a3d2c;border-radius:4px" xmlns="http://www.w3.org/2000/svg">${roads}${home}${pins}</svg>` +
      `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">${footer}</div>`;

    if (atHome) this.travel.querySelectorAll<SVGGElement>("g[data-travel]").forEach((el) => {
      el.onclick = () => this.handlers.onTravel(el.dataset["travel"]!);
    });
    this.addClose(this.travel);
  }

  private renderPack(world: World): void {
    const p = world.player;
    const atHome = world.zoneId === "home";
    const slots = p.inv.map((s, i) => {
      if (!s) return `<div class="slot empty"></div>`;
      const def = this.content.items[s.id]!;
      const gear = isGearDef(def);
      const coffer = s.id === "coffer";
      // Coffers show their guaranteed rarity FLOOR (its border + "+" tag); gear
      // shows its rolled rarity + Power.
      const col = gear || coffer ? RARITY_META[rarityOf(s)].color : "#26282a";
      const pw = gear ? `<span class="e" style="color:${col}">◈${slotPower(s)}</span>`
        : coffer ? `<span class="e" style="color:${col}">${RARITY_META[rarityOf(s)].name[0]}+</span>` : "";
      // Gear salvages (⊟); a coffer breaks its seal (only at the settlement).
      const act = gear ? `<button class="salv" data-salv="${i}" title="Salvage for parts (more at base)">⊟</button>`
        : coffer ? `<button class="salv seal" data-seal="${i}" title="${atHome ? "Break the seal — reveal what it holds" : "Carry it home to break the seal"}" ${atHome ? "" : "disabled"}>✦</button>` : "";
      const tip = coffer ? `${RARITY_META[rarityOf(s)].name}+ Sealed Coffer — break it open at your settlement (◈${slotPower(s)} band)` : gearTip(def, s);
      return `<div class="slot" data-slot="${i}" title="${tip}" style="border-color:${col}">
        <div class="ic">${itemIconSVG(def)}</div>${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ""}${pw}${act}
      </div>`;
    }).join("");

    // Loadout: equipped weapon + the five armour slots, each with rarity/Power,
    // plus your gear score (the average Power of what you have equipped).
    const loadoutCell = (slot: InvSlot | null, label: string): string => {
      if (!slot) return `<div class="ld empty" title="${label}: empty"><div class="ldslot">${label}</div><div style="color:var(--ink-dim);font-size:11px">— empty —</div></div>`;
      const def = this.content.items[slot.id]!;
      // Gear (weapon/armour/shield) shows rarity colour + Power; tools don't.
      const gear = isGearDef(def);
      const col = gear ? RARITY_META[rarityOf(slot)].color : "#2a2c2e";
      const sub = gear ? `${label} · ◈${slotPower(slot)}` : label;
      return `<div class="ld" title="${gearTip(def, slot)}" style="border-color:${col}">
        <div style="width:26px;height:26px;flex:none">${itemIconSVG(def)}</div>
        <div style="min-width:0"><div style="color:${gear ? col : "var(--ink)"};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${def.name}</div>
        <div style="font-size:10px;color:var(--ink-dim)">${sub}</div></div>
      </div>`;
    };
    const power = characterPower(p.equipped, [...ARMOR_SLOTS.map((sl) => p.armor[sl]), p.offhand]);
    const loadout =
      `<style>
        #hud-loadout{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}
        #hud-loadout .ld{display:flex;align-items:center;gap:7px;padding:5px 7px;background:#101112;border:1px solid #2a2c2e;border-radius:3px;min-width:0}
        #hud-loadout .ld.empty{opacity:.55}
        #hud-loadout .ldslot{font-size:11px;color:var(--ink-dim)}
      </style>
      <div class="hud-heading">Loadout <span style="color:var(--amber);text-transform:none;letter-spacing:0">· ◈ Power ${power}</span></div>
       <div id="hud-loadout">
         ${loadoutCell(p.equipped, "Weapon")}
         ${loadoutCell(p.offhand, "Off-hand")}
         ${ARMOR_SLOTS.map((sl) => loadoutCell(p.armor[sl], SLOT_LABEL[sl]!)).join("")}
       </div>`;

    // Tool belt — gathering tools, always to hand (not in the pack grid).
    const toolLabel: Record<string, string> = { woodcutting: "Axe", mining: "Pickaxe", fishing: "Rod" };
    const toolbelt =
      `<div class="hud-heading">Tool Belt</div>
       <div id="hud-loadout" style="grid-template-columns:repeat(3,1fr)">
         ${TOOL_SKILLS.map((sk) => loadoutCell(p.tools[sk] ?? null, toolLabel[sk]!)).join("")}
       </div>`;

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
        .slot .salv{position:absolute;bottom:1px;left:1px;width:15px;height:15px;padding:0;font-size:11px;line-height:1;border:1px solid #3a3d40;border-radius:3px;background:#17191a;color:#9aa09b;cursor:pointer}
        .slot .salv:hover{border-color:var(--rust);color:#fff}
        .slot .seal{color:var(--amber);border-color:#6a5326}
        .slot .seal:hover:not([disabled]){border-color:var(--amber);color:#fff;box-shadow:0 0 6px rgba(200,146,46,.6)}
        .slot .seal[disabled]{opacity:.4;cursor:default}
        .recipe{display:flex;align-items:center;gap:10px;padding:6px;border-bottom:1px solid #1c1e20}
      </style>
      ${loadout}
      ${toolbelt}
      <div class="hud-heading">The Pack</div>
      <div id="hud-pack-grid">${slots}</div>
      <div class="hud-heading">Craft</div>
      ${this.near.forge || this.near.workshop ? "" : `<div style="text-align:center;font-size:12px;color:var(--rust);padding:4px 0 8px">Work at the forge or workshop to craft.</div>`}${recipes}
      <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--ink-dim)">Click gear to equip, ⊟ to salvage · ✦ breaks a Sealed Coffer open (at home) · click an item to use</div>`;

    this.pack.querySelectorAll<HTMLElement>(".slot[data-slot]").forEach((el) => {
      const i = Number(el.dataset["slot"]);
      this.attachInspect(el, () => world.player.inv[i] ?? null);
      el.onclick = () => { if (el.dataset["longpress"]) { delete el.dataset["longpress"]; return; } this.handlers.onUseSlot(i); }; // useSlot equips gear, uses consumables
    });
    this.pack.querySelectorAll<HTMLElement>(".salv[data-salv]").forEach((el) => {
      el.onclick = (ev) => { ev.stopPropagation(); this.handlers.onDismantle(Number(el.dataset["salv"])); };
    });
    this.pack.querySelectorAll<HTMLElement>(".seal[data-seal]").forEach((el) => {
      el.onclick = (ev) => { ev.stopPropagation(); if (!el.hasAttribute("disabled")) this.handlers.onDecrypt(Number(el.dataset["seal"])); };
    });
    this.pack.querySelectorAll<HTMLElement>(".recipe").forEach((el) => {
      const btn = el.querySelector("button");
      if (btn && !btn.hasAttribute("disabled")) btn.onclick = () => this.handlers.onCraft(el.dataset["recipe"]!);
    });
    this.addClose(this.pack);
  }

  private renderSettlement(world: World): void {
    const cap = capacity(world);
    // Building + assigning people is done AT the town board, not from the tab.
    const atBoard = this.near.townboard;
    const rows = (Object.keys(this.content.structures) as StructureId[]).map((id) => {
      const def = this.content.structures[id];
      const level = world.settlement.structures[id];
      const maxed = level >= def.maxLevel;
      const cost = maxed ? null : def.costs[level]!;
      const affordable = !maxed && canBuild(world, this.content, id);
      const canDo = affordable && atBoard;
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
        ${maxed ? `<span style="color:var(--amber);font-size:12px">MAX</span>` : `<button class="act" data-build="${id}" ${canDo ? "" : "disabled"} style="opacity:${canDo ? 1 : 0.4}">${level === 0 ? "Build" : "Upgrade"}</button>`}
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
          <button class="act rbtn" data-role="${role}" data-delta="-1" style="width:26px;padding:6px 0" ${atBoard && n > 0 ? "" : "disabled"}>−</button>
          <span style="min-width:16px;text-align:center;color:var(--ink)">${n}</span>
          <button class="act rbtn" data-role="${role}" data-delta="1" style="width:26px;padding:6px 0" ${atBoard && idle > 0 ? "" : "disabled"}>+</button>
        </div>
      </div>`;
    }).join("");

    const boardNote = atBoard ? "" : `<div style="text-align:center;font-size:12px;color:var(--rust);margin-bottom:8px">Stand at the town board to build and assign your people.</div>`;
    this.settle.innerHTML =
      `<style>.srow{display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #1c1e20}</style>
      ${boardNote}
      <div class="hud-heading">Structures</div>
      ${rows}
      <div class="hud-heading" style="margin-top:12px">Your People — ${idle} idle of ${world.settlement.population}/${cap}</div>
      ${world.settlement.population > 0 ? roleRows : `<div style="font-size:12px;color:var(--ink-dim);padding:6px 4px">Rescue survivors in the wilds, then assign them here.</div>`}`;

    this.settle.querySelectorAll<HTMLElement>("button[data-build]").forEach((el) => {
      if (!el.hasAttribute("disabled")) el.onclick = () => this.handlers.onBuild(el.dataset["build"] as StructureId);
    });
    this.settle.querySelectorAll<HTMLElement>("button.rbtn").forEach((el) => {
      if (!el.hasAttribute("disabled")) el.onclick = () => this.handlers.onAssign(el.dataset["role"] as SettlerRole, Number(el.dataset["delta"]));
    });
    this.addClose(this.settle);
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
/** Tooltip for a slot — gear shows its rarity, Power and stats. */
function gearTip(def: ItemDef, s: InvSlot): string {
  if (!isGearDef(def)) return `${def.name} — ${def.desc}`;
  const stat = def.weapon ? `Dmg ${weaponDamage(def, s)}` : `Armour ${armorSoak(def, s)} · ${SLOT_LABEL[def.slot ?? ""] ?? ""}`;
  return `${RARITY_META[rarityOf(s)].name} ${def.name} · ◈Power ${slotPower(s)} · ${stat} — ${def.desc}`;
}
