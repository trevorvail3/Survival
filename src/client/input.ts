/**
 * src/client/input.ts
 * -------------------
 * Pure point-and-click input (OSRS-style, like the sibling `world` project):
 * everything is a click or tap, on the canvas or on a HUD button — there is no
 * keyboard control surface. Clicks are edge-triggered and consumed once.
 */

export class Input {
  mouseX = 0;
  mouseY = 0;
  private clickX = 0;
  private clickY = 0;
  private clicked = false;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      this.clickX = e.clientX - r.left;
      this.clickY = e.clientY - r.top;
      this.clicked = true;
    });
    // Touch: a tap on the canvas is a left-click (move / interact / attack), and
    // its position is also the aim used by the on-screen dodge button. We call
    // preventDefault so the browser doesn't also synthesise a duplicate mouse
    // event (which would register the tap twice).
    canvas.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (!t) return;
      const r = canvas.getBoundingClientRect();
      this.mouseX = t.clientX - r.left;
      this.mouseY = t.clientY - r.top;
      this.clickX = this.mouseX;
      this.clickY = this.mouseY;
      this.clicked = true;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Consume a pending left-click; returns its canvas coords or null. */
  consumeClick(): { x: number; y: number } | null {
    if (!this.clicked) return null;
    this.clicked = false;
    return { x: this.clickX, y: this.clickY };
  }
  endFrame(): void { /* no per-frame key state to clear anymore */ }
}
