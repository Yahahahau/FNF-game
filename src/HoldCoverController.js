// Hold note cover (official NoteHoldCover lifecycle), one independent instance per lane:
//
//   begin()      -> START (once)  -> HOLD (loops while the sustain is held)
//   end()        -> END (once)    -> removed        (tail completed successfully)
//   interrupt()  -> removed immediately            (released early: no END animation)
//
// A lane owns exactly one sprite, so starting a new cover while an old END is still playing
// restarts it instead of stacking two animations on top of each other.
import { AnimatedSprite, drawFrameCentered } from './ArrowAnimation.js';
import { DIRECTIONS } from './constants.js';

class HoldCover {
  constructor(dir, atlas, cfg, scale, offsets) {
    this.dir = dir;
    this.scale = scale;
    this.offsets = offsets;
    this.alive = false;
    this.sprite = new AnimatedSprite();
    this.sprite.add('start', atlas.byPrefix(cfg.start.prefix), cfg.start.frameRate ?? 24, false);
    this.sprite.add('hold', atlas.byPrefix(cfg.hold.prefix), cfg.hold.frameRate ?? 24, true);
    this.sprite.add('end', atlas.byPrefix(cfg.end.prefix), cfg.end.frameRate ?? 24, false);
    this.sprite.onFinish = (name) => {
      if (name === 'start') this.sprite.play('hold', true); // START -> HOLD, no gap
      else if (name === 'end') this.kill(); // END -> gone
    };
  }

  get stage() {
    return this.alive ? this.sprite.name : 'idle';
  }

  begin() {
    this.alive = true;
    this.sprite.play('start', true);
  }

  end() {
    if (!this.alive || this.sprite.name === 'end') return;
    this.sprite.play('end', true);
  }

  kill() {
    this.alive = false;
    this.sprite.stop();
  }

  update(dt) {
    if (this.alive) this.sprite.update(dt);
  }

  draw(ctx, cx, cy) {
    const f = this.sprite.frame;
    if (this.alive && f) drawFrameCentered(ctx, f, cx + this.offsets[0], cy + this.offsets[1], this.scale);
  }
}

export class HoldCoverController {
  /**
   * @param assets AssetLoader result
   * @param {(dir:string)=>{x:number,y:number}} getCenter receptor centre in world units
   */
  constructor(assets, getCenter) {
    this.style = assets.style.holdNoteCover;
    this.enabled = this.style.data.enabled !== false;
    this.getCenter = getCenter;
    this.covers = {};
    for (const dir of DIRECTIONS) {
      this.covers[dir] = new HoldCover(
        dir, assets.atlas.covers[dir], this.style.data[dir], this.style.scale ?? 1, this.style.offsets ?? [0, 0],
      );
    }
  }

  begin(dir) {
    if (this.enabled) this.covers[dir].begin();
  }
  end(dir) {
    this.covers[dir].end();
  }
  interrupt(dir) {
    this.covers[dir].kill();
  }
  stage(dir) {
    return this.covers[dir].stage;
  }
  clear() {
    for (const dir of DIRECTIONS) this.covers[dir].kill();
  }
  update(dt) {
    for (const dir of DIRECTIONS) this.covers[dir].update(dt);
  }
  get active() {
    return DIRECTIONS.some((d) => this.covers[d].alive);
  }
  draw(ctx) {
    for (const dir of DIRECTIONS) {
      const c = this.covers[dir];
      if (!c.alive) continue;
      const p = this.getCenter(dir);
      c.draw(ctx, p.x, p.y);
    }
  }
}
