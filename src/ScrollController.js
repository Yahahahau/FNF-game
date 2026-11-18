// Scroll clock + note <-> screen mapping.
//
// DOWNSCROLL: receptors sit near the bottom, notes spawn above the top edge and travel DOWN.
// A note's y is derived from the song clock (elapsed-time based), never from per-frame
// increments, so it is smooth and independent of the frame rate:
//
//     y(noteTime) = receptorY - (noteTime - now) * pxPerMs      (future notes are above)
//
// World units are the same as the receptor layout; main.js maps them to the screen.
import { SCROLL_PX_PER_MS } from './constants.js';

/** +1 = notes move toward larger y (down the screen). Never change this to -1 (upscroll). */
export const SCROLL_DIRECTION = 1;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 5;

const LS_SPEED = 'fnf-arrow-playground:scroll-speed';

function readSpeed() {
  try {
    const v = parseFloat(localStorage.getItem(LS_SPEED));
    return Number.isFinite(v) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, v)) : 2;
  } catch {
    return 2;
  }
}

export class ScrollController {
  constructor() {
    this.speed = readSpeed();
    this.time = 0; // ms, the demo clock
    this.paused = false;
    this.receptorY = 0;
    this.topY = 0;
    this.bottomY = 0;
  }

  setSpeed(v) {
    this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
    try { localStorage.setItem(LS_SPEED, String(this.speed)); } catch { /* ignore */ }
  }

  get pxPerMs() {
    return SCROLL_PX_PER_MS * this.speed;
  }

  /** World-space playfield: receptor centre y, visible top edge, visible bottom edge. */
  setViewport({ receptorY, topY, bottomY }) {
    this.receptorY = receptorY;
    this.topY = topY;
    this.bottomY = bottomY;
  }

  /** Advances the clock by real elapsed seconds (the caller clamps long stalls). */
  advance(dtSeconds) {
    if (!this.paused) this.time += dtSeconds * 1000;
  }

  reset(startMs) {
    this.time = startMs;
  }

  /** y of a note head's centre for a note scheduled at `noteTime` (ms). */
  yAt(noteTime) {
    return this.receptorY - (noteTime - this.time) * this.pxPerMs * SCROLL_DIRECTION;
  }

  /** Length in world units of a sustain lasting `ms`. */
  lengthPx(ms) {
    return ms * this.pxPerMs;
  }

  /** How many ms before its hit time a note must exist so it enters from above the screen. */
  spawnLeadMs(marginPx = 200) {
    return Math.max(0, (this.receptorY - this.topY + marginPx) / this.pxPerMs);
  }

  /** Has an object whose lowest point is `y` fully left the bottom of the screen? */
  isBelowScreen(y, marginPx = 120) {
    return y > this.bottomY + marginPx;
  }
}
