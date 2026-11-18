// A single tap note: one directional arrow head. Pooled (see ObjectPool), so state lives in
// init()/reset(), never in the constructor only.
import { drawFrameCentered } from './ArrowAnimation.js';
import { MISSED_ALPHA } from './constants.js';

export class TapNote {
  constructor() {
    this.isHold = false;
    this.reset();
  }

  reset() {
    this.dir = 'left';
    this.time = 0; // ms the note must be hit at
    this.state = 'idle'; // idle | hit | missed
    this.y = 0;
    this.headVisible = true;
  }

  init(dir, time) {
    this.reset();
    this.dir = dir;
    this.time = time;
    return this;
  }

  /** Can the player still hit this note? */
  get hittable() {
    return this.state === 'idle';
  }

  hit() {
    this.state = 'hit';
    this.headVisible = false;
  }

  miss() {
    this.state = 'missed';
  }

  /** Lowest point of the whole object (used to decide when it has left the screen). */
  bottomY() {
    return this.y;
  }

  update(scroll) {
    this.y = scroll.yAt(this.time);
  }

  drawHead(ctx, frame, cx, scale) {
    if (!this.headVisible || !frame) return;
    if (this.state === 'missed') ctx.globalAlpha = MISSED_ALPHA;
    drawFrameCentered(ctx, frame, cx, this.y, scale);
    ctx.globalAlpha = 1;
  }
}
