/**
 * Wall-clock frame timing.
 *
 * Deliberately not `engine.getDeltaTime()`. That value is only updated inside
 * Babylon's `beginFrame`/`endFrame` pair, so anything driving the scene by
 * another route -- an XR frame callback, a manual `scene.render()`, a tool
 * stepping frames -- reads zero from it. Every animation scaled by that delta
 * then silently never advances: the caption stays at zero opacity with its text
 * correctly drawn and its mesh correctly placed, which is a genuinely difficult
 * bug to see.
 *
 * The clamp matters too. After a stall, a tab regaining focus, or a headset
 * being put back on, a raw delta can be seconds long and would snap an
 * animation straight to its end.
 */
export class FrameClock {
  private last = performance.now();

  /** Seconds since the previous call, clamped to a sane frame length. */
  tick(maxSeconds = 0.1): number {
    const now = performance.now();
    const seconds = (now - this.last) / 1000;
    this.last = now;
    return Math.min(Math.max(seconds, 0), maxSeconds);
  }

  /** Forget the elapsed time, so the next tick starts from now. */
  reset(): void {
    this.last = performance.now();
  }
}
