/**
 * src/client/input.ts
 * -------------------
 * Pure point-and-click input (OSRS-style, like the sibling `world` project):
 * everything is a click or tap, on the canvas or on a HUD button — there is no
 * keyboard control surface. Clicks are edge-triggered and consumed once.
 *
 * Zoom is the one continuous control: the scroll wheel (desktop) and a two-
 * finger pinch (touch) both accumulate a multiplicative factor the loop drains
 * each frame via consumeZoom().
 */

export class Input {
  mouseX = 0;
  mouseY = 0;
  private clickX = 0;
  private clickY = 0;
  private clicked = false;
  // Multiplicative zoom factor accumulated since the last consumeZoom().
  private zoomAccum = 1;
  // Two-finger pinch tracking.
  private pinchDist = 0;
  private pinching = false;

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
    // Scroll wheel zooms (up = in). preventDefault stops the page scrolling.
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomAccum *= Math.exp(-e.deltaY * 0.0015);
    }, { passive: false });
    // Touch: one finger is a tap (move / interact / attack), and its position is
    // also the aim used for thrown items. Two fingers is a pinch-zoom (and must
    // NOT also register as a tap). preventDefault stops synthesised mouse events
    // and page gestures.
    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length >= 2) {
        this.pinching = true;
        this.clicked = false; // a two-finger gesture is not a tap
        this.pinchDist = touchDist(e);
        e.preventDefault();
        return;
      }
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
    canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length >= 2) {
        const d = touchDist(e);
        if (this.pinchDist > 0 && d > 0) this.zoomAccum *= d / this.pinchDist;
        this.pinchDist = d;
        e.preventDefault();
      }
    }, { passive: false });
    canvas.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) { this.pinching = false; this.pinchDist = 0; }
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Consume a pending left-click; returns its canvas coords or null. */
  consumeClick(): { x: number; y: number } | null {
    if (!this.clicked || this.pinching) { this.clicked = false; return null; }
    this.clicked = false;
    return { x: this.clickX, y: this.clickY };
  }
  /** Consume the accumulated zoom factor since last call (1 = no change). */
  consumeZoom(): number {
    const f = this.zoomAccum;
    this.zoomAccum = 1;
    return f;
  }
  endFrame(): void { /* no per-frame key state to clear anymore */ }
}

function touchDist(e: TouchEvent): number {
  const a = e.touches[0], b = e.touches[1];
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
