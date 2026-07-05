/**
 * src/client/input.ts
 * -------------------
 * Point-and-click input (like the sibling `world` project): the mouse does the
 * work — left-click to walk / interact / attack, and a few keys for the pack,
 * hotbar and firepot. Clicks are edge-triggered and consumed once.
 */

export class Input {
  mouseX = 0;
  mouseY = 0;
  private clickX = 0;
  private clickY = 0;
  private clicked = false;
  private rightClicked = false;
  private pressedKeys = new Set<string>();
  private downKeys = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) { this.rightClicked = true; return; }
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      this.clickX = e.clientX - r.left;
      this.clickY = e.clientY - r.top;
      this.clicked = true;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.downKeys.has(k)) this.pressedKeys.add(k);
      this.downKeys.add(k);
      if (k === "tab") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.downKeys.delete(e.key.toLowerCase()));
  }

  /** Consume a pending left-click; returns its canvas coords or null. */
  consumeClick(): { x: number; y: number } | null {
    if (!this.clicked) return null;
    this.clicked = false;
    return { x: this.clickX, y: this.clickY };
  }
  /** Consume a pending right-click (used for dodge). */
  consumeRight(): boolean { const c = this.rightClicked; this.rightClicked = false; return c; }
  pressed(k: string): boolean { return this.pressedKeys.has(k); }
  endFrame(): void { this.pressedKeys.clear(); }
}
