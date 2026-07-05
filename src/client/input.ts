/**
 * src/client/input.ts
 * -------------------
 * Keyboard + mouse state. WASD / arrows to move, mouse to aim, click or Space to
 * strike, Shift to sprint, Ctrl / right-click to dodge-roll, E to interact,
 * 1–5 for the hotbar, Tab for the pack. Edge-triggered actions expose a
 * "consume" API so a press fires once.
 */

export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  /** Mouse position in CSS pixels relative to the canvas. */
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  rightDown = false;
  private mouseClicked = false;
  private rightClicked = false;
  wheel = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.down.has(k)) this.pressedThisFrame.add(k);
      this.down.add(k);
      if (["tab", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.key.toLowerCase()));
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      if (e.button === 2) { this.rightDown = true; this.rightClicked = true; }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  }

  held(k: string): boolean { return this.down.has(k); }
  /** Was `k` pressed since the last endFrame()? */
  pressed(k: string): boolean { return this.pressedThisFrame.has(k); }
  consumeClick(): boolean { const c = this.mouseClicked; this.mouseClicked = false; return c; }
  consumeRight(): boolean { const c = this.rightClicked; this.rightClicked = false; return c; }
  consumeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }

  /** Movement vector from WASD / arrows. */
  moveVec(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.down.has("w") || this.down.has("arrowup")) y -= 1;
    if (this.down.has("s") || this.down.has("arrowdown")) y += 1;
    if (this.down.has("a") || this.down.has("arrowleft")) x -= 1;
    if (this.down.has("d") || this.down.has("arrowright")) x += 1;
    return { x, y };
  }

  endFrame(): void { this.pressedThisFrame.clear(); }

  get canvasEl(): HTMLCanvasElement { return this.canvas; }
}
