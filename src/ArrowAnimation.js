// Frame animation controller that mirrors the behaviour of Flixel's FlxAnimationController
// closely enough for FNF: fixed-rate frames, force restarts, non-looped animations holding
// their last frame, and a finish callback. Frames are advanced one at a time, so a slow
// render tick never skips a frame (it catches up instead).

export class AnimatedSprite {
  constructor() {
    this.anims = new Map();
    this.cur = null;
    this.frameIndex = 0;
    this.timer = 0;
    this.finished = true;
    /** @type {(name:string)=>void} */
    this.onFinish = null;
  }

  /** @param {{name:string, frames:object[], fps?:number, loop?:boolean}} def */
  add(name, frames, fps = 24, loop = false) {
    if (!frames.length) throw new Error(`Animation "${name}" has no frames`);
    this.anims.set(name, { name, frames, fps, loop });
  }

  has(name) {
    return this.anims.has(name);
  }

  get name() {
    return this.cur ? this.cur.name : '';
  }

  get frame() {
    return this.cur ? this.cur.frames[this.frameIndex] : null;
  }

  /** Overrides the frame rate of the *current* animation (used for splash speed variance). */
  setFrameRate(fps) {
    if (this.cur) this.cur.fps = fps;
  }

  /**
   * Same rules as FlxAnimationController.play: re-playing the animation that is already
   * running is a no-op unless `force` is set (or it already finished).
   */
  play(name, force = false, startFrame = 0) {
    const next = this.anims.get(name);
    if (!next) return false;
    if (this.cur === next && !force) {
      if (next.loop) return true;
      if (!this.finished) return true;
    }
    this.cur = next;
    this.frameIndex = Math.min(startFrame, next.frames.length - 1);
    this.timer = 0;
    this.finished = false;
    return true;
  }

  stop() {
    this.cur = null;
    this.finished = true;
    this.timer = 0;
  }

  update(dt) {
    const a = this.cur;
    if (!a || this.finished) return;
    const frameDuration = 1 / a.fps;
    this.timer += dt;
    while (this.timer >= frameDuration) {
      this.timer -= frameDuration;
      if (this.frameIndex < a.frames.length - 1) {
        this.frameIndex++;
      } else if (a.loop) {
        this.frameIndex = 0;
      } else {
        this.finished = true;
        this.timer = 0;
        if (this.onFinish) this.onFinish(a.name);
        return; // the callback may have started another animation
      }
    }
  }

  /** True while something is still ticking (used to sleep the render loop). */
  get active() {
    return !!this.cur && !this.finished;
  }
}

/** Draws one atlas frame so that its *full frame box* has its top-left at (x, y). */
export function drawFrame(ctx, frame, x, y, scale = 1) {
  ctx.drawImage(
    frame.source,
    frame.sx, frame.sy, frame.w, frame.h,
    x - frame.frameX * scale, y - frame.frameY * scale,
    frame.w * scale, frame.h * scale,
  );
}

/** Draws a frame so that its full frame box is centred on (cx, cy). */
export function drawFrameCentered(ctx, frame, cx, cy, scale = 1) {
  drawFrame(ctx, frame, cx - (frame.frameW * scale) / 2, cy - (frame.frameH * scale) / 2, scale);
}
