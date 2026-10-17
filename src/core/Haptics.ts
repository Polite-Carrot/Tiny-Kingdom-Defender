// Phone vibration for big moments (boss arrivals, the castle being hit, meteors, thunder).
// Uses navigator.vibrate where the browser supports it; a setting turns it off.

let enabled = true;
let lastAt = 0;

export function setHaptics(on: boolean): void {
  enabled = on;
}

/** Vibrate: a duration in ms or an on/off pattern. Rate-limited so fights don't buzz constantly. */
export function vibrate(pattern: number | number[], minGapMs = 120): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const now = performance.now();
  if (now - lastAt < minGapMs) return;
  lastAt = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* not allowed (no user gesture yet) */
  }
}
