/**
 * src/client/onboarding.ts
 * ------------------------
 * Learn-by-doing onboarding. A short ordered list of objectives that advance as
 * the player actually performs each action (move, gather, search, open the pack,
 * use the town board, set out, rescue), plus one-time contextual tips (first
 * wound, nightfall, infection, a boss). Progress lives on `world.onboard`
 * so it persists with the save and resets with a New Game.
 *
 * The loop feeds `notify(signal)`; the tutorial returns any messages to toast and
 * exposes the current objective for the HUD tracker. It never touches the DOM.
 */

import type { World } from "../core/types.ts";

interface Step { signal: string; task: string; done: string; }

const STEPS: Step[] = [
  { signal: "move", task: "Click the ground to walk there.", done: "You go where you point." },
  { signal: "gather", task: "Click a tree in your yard to fell timber.", done: "Timber, stone and ore raise your settlement." },
  { signal: "search", task: "Click a chest or barrel to search it.", done: "Scavenge all you can — supplies are scarce." },
  { signal: "pack", task: "Open your pack (Tab, or the ▤ button) to craft or equip.", done: "Craft poultices and arms from what you gather." },
  { signal: "board", task: "Click the town board to manage your settlement.", done: "Raise walls and forge here; assign the folk you save." },
  { signal: "travel", task: "Click the waystone to set out on an expedition.", done: "Range out by day — be behind your walls before dark." },
  { signal: "rescue", task: "Out in the wilds, find and rescue a survivor.", done: "Bring them home. Your settlement grows. Good luck." },
];

const HINTS: Record<string, string> = {
  hurt: "Wounded — press 1 to bind it with a Poultice.",
  night: "Night falls. The dead grow bold — keep to the light or head home.",
  infected: "The plague festers in your blood — press 5 for an Antidote.",
  boss: "A great foe stirs nearby. Come armed — or flee.",
};

export class Tutorial {
  constructor(private world: World) {
    if (!this.world.onboard) this.world.onboard = { step: 0, seen: [] };
  }

  private get st() { return this.world.onboard; }

  /** Record something the player did/experienced; returns messages to toast. */
  notify(signal: string): string[] {
    const out: string[] = [];
    // One-time contextual tips, independent of the objective sequence.
    const hint = HINTS[signal];
    if (hint && !this.st.seen.includes(signal)) {
      this.st.seen.push(signal);
      out.push(hint);
    }
    // Advance the objective if this is what it was waiting for.
    const step = STEPS[this.st.step];
    if (step && step.signal === signal) {
      this.st.step++;
      out.push(step.done);
    }
    return out;
  }

  /** The current objective text, or null when onboarding is complete. */
  currentTask(): string | null {
    const s = STEPS[this.st.step];
    return s ? s.task : null;
  }

  get active(): boolean { return this.st.step < STEPS.length; }

  /** Dismiss the rest of the tutorial. */
  skip(): void { this.st.step = STEPS.length; }
}
