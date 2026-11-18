// Note splashes (official NoteSplash behaviour):
//  - spawned only when a note (or a hold head) is hit, never for a plain key press;
//  - pooled (cap 6): a free one is reused, if all are busy a random one is restarted;
//  - random variant per spawn, framerate = 24 +/- 2, killed automatically when the animation ends.
// Hold covers live in HoldCoverController.js.
import { AnimatedSprite, drawFrameCentered } from './ArrowAnimation.js';
import { DIRECTIONS, DIR_INFO, NOTE_SPLASH_CAP } from './constants.js';

class Splash {
  constructor(atlas, style, rng) {
    this.alpha = style.alpha ?? 1;
    this.scale = style.scale ?? 1;
    this.rng = rng;
    this.baseFps = style.data.framerateDefault ?? 24;
    this.fpsVariance = style.data.framerateVariance ?? 2;
    this.offsets = style.offsets ?? [0, 0];
    this.alive = false;
    this.cx = 0;
    this.cy = 0;

    this.sprite = new AnimatedSprite();
    this.variants = {};
    for (const dir of DIRECTIONS) {
      const list = style.data[`${dir}Splashes`] ?? [];
      this.variants[dir] = list.length;
      list.forEach((entry, i) => {
        this.sprite.add(`splash${DIR_INFO[dir].upper}${i}`, atlas.byPrefix(entry.prefix), this.baseFps, false);
      });
    }
    this.sprite.onFinish = () => this.kill();
  }

  play(dir, cx, cy, variant) {
    const count = this.variants[dir];
    if (!count) return;
    const v = variant ?? Math.floor(this.rng() * count);
    this.sprite.play(`splash${DIR_INFO[dir].upper}${v}`, true);
    const jitter = Math.floor(this.rng() * (this.fpsVariance * 2 + 1)) - this.fpsVariance;
    this.sprite.setFrameRate(this.baseFps + jitter);
    this.cx = cx + this.offsets[0];
    this.cy = cy + this.offsets[1];
    this.alive = true;
  }

  kill() {
    this.alive = false;
    this.sprite.stop();
  }

  update(dt) {
    if (this.alive) this.sprite.update(dt);
  }

  draw(ctx) {
    const f = this.sprite.frame;
    if (!this.alive || !f) return;
    ctx.globalAlpha = this.alpha;
    drawFrameCentered(ctx, f, this.cx, this.cy, this.scale);
    ctx.globalAlpha = 1;
  }
}

export class SplashEffect {
  constructor(assets, rng = Math.random) {
    this.rng = rng;
    this.style = assets.style.noteSplash;
    this.enabled = this.style.data.enabled !== false;
    this.atlas = assets.atlas.splash;
    this.pool = [];
  }

  /** @param cx,cy centre of the receptor the splash belongs to (world units) */
  spawn(dir, cx, cy, variant) {
    if (!this.enabled) return null;
    let s = this.pool.find((p) => !p.alive);
    if (!s) {
      if (this.pool.length < NOTE_SPLASH_CAP) {
        s = new Splash(this.atlas, this.style, this.rng);
        this.pool.push(s);
      } else {
        s = this.pool[Math.floor(this.rng() * this.pool.length)]; // all busy: restart a random one
      }
    }
    s.play(dir, cx, cy, variant);
    return s;
  }

  clear() {
    for (const s of this.pool) s.kill();
  }

  update(dt) {
    for (const s of this.pool) s.update(dt);
  }

  get active() {
    return this.pool.some((s) => s.alive);
  }

  get aliveCount() {
    return this.pool.filter((s) => s.alive).length;
  }

  draw(ctx) {
    for (const s of this.pool) s.draw(ctx);
  }
}
