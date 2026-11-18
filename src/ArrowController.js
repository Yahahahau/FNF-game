// The four receptors (StrumlineNote in the official game) and their state machine:
//   static  -> press            (key down, no note: "ghost tap")
//   press   -> static           (key up)
//   *       -> confirm          (a note was hit; only ever triggered by the preview mode here)
//   confirm -> confirm-hold     (hold note being held)
// After `confirm` finishes on the player's side a short timer drops the receptor back to
// `static`; if the key is still held the per-frame "pressed keys" pass then shows `press`.
import { AnimatedSprite, drawFrame } from './ArrowAnimation.js';
import { CONFIRM_HOLD_TIME, DIRECTIONS, INITIAL_OFFSET, laneX } from './constants.js';

export class Receptor {
  constructor(dir, atlas, style) {
    this.dir = dir;
    this.scale = style.scale ?? 0.35;
    this.offsets = style.offsets ?? [0, 0];
    this.held = false; // Strumline.isKeyHeld
    this.confirmHoldTimer = -1;

    this.sprite = new AnimatedSprite();
    const data = style.data;
    // Same names the game registers: static / press / confirm / confirm-hold.
    const map = { static: 'Static', press: 'Press', confirm: 'Confirm', 'confirm-hold': 'ConfirmHold' };
    for (const [anim, suffix] of Object.entries(map)) {
      const prefix = data[`${dir}${suffix}`].prefix;
      this.sprite.add(anim, atlas.byPrefix(prefix), data[`${dir}${suffix}`].frameRate ?? 24, false);
    }
    this.sprite.onFinish = (name) => this.onAnimationFinished(name);

    // Hitbox of the sprite, fixed at setup time from the static frame (updateHitbox()).
    const f = this.sprite.anims.get('static').frames[0];
    this.width = f.frameW * this.scale;
    this.height = f.frameH * this.scale;
    this.x = laneX(dir) + INITIAL_OFFSET + this.offsets[0];
    this.y = this.offsets[1];

    this.playStatic();
  }

  get centerX() {
    return this.x + this.width / 2;
  }
  get centerY() {
    return this.y + this.height / 2;
  }

  onAnimationFinished(name) {
    // Player side: let `confirm` linger briefly, then fall back (press again if held).
    if (name === 'confirm') this.confirmHoldTimer = 0;
  }

  playStatic() {
    this.confirmHoldTimer = -1;
    this.sprite.play('static', true);
  }
  playPress() {
    this.confirmHoldTimer = -1;
    this.sprite.play('press', true);
  }
  playConfirm() {
    this.sprite.play('confirm', true);
    this.confirmHoldTimer = -1; // isPlayer
  }
  /** StrumlineNote.holdConfirm(): confirm, then confirm-hold once confirm has finished. */
  holdConfirm() {
    const cur = this.sprite.name;
    if (cur === 'confirm-hold') return;
    if (cur === 'confirm') {
      if (this.sprite.finished) {
        this.confirmHoldTimer = -1;
        this.sprite.play('confirm-hold');
      }
    } else {
      this.sprite.play('confirm');
    }
  }

  update(dt) {
    this.sprite.update(dt);
    if (this.confirmHoldTimer >= 0) {
      this.confirmHoldTimer += dt;
      if (this.confirmHoldTimer >= CONFIRM_HOLD_TIME) {
        this.confirmHoldTimer = -1;
        this.playStatic();
      }
    }
    // Strumline.update: a held key on a static receptor shows `press`.
    if (this.held && this.sprite.name === 'static') this.playPress();
  }

  get active() {
    return this.sprite.active || this.confirmHoldTimer >= 0;
  }

  draw(ctx) {
    const f = this.sprite.frame;
    if (!f) return;
    // centerOffsets(): the frame box stays centred on the (fixed) hitbox for every animation.
    const w = f.frameW * this.scale;
    const h = f.frameH * this.scale;
    drawFrame(ctx, f, this.centerX - w / 2, this.centerY - h / 2, this.scale);
  }
}

export class ArrowController {
  constructor(assets) {
    this.receptors = {};
    for (const dir of DIRECTIONS) {
      this.receptors[dir] = new Receptor(dir, assets.atlas.strumline, assets.style.noteStrumline);
    }
  }

  /** Input went down on a lane. Immediately switches static -> press. */
  press(dir) {
    const r = this.receptors[dir];
    r.held = true;
    r.playPress();
  }

  /** Input released on a lane. Always returns it to static. */
  release(dir) {
    const r = this.receptors[dir];
    r.held = false;
    r.playStatic();
  }

  confirm(dir) {
    this.receptors[dir].playConfirm();
  }

  holdConfirm(dir) {
    this.receptors[dir].holdConfirm();
  }

  /** Hard reset (window blur, visibility change, mode change): nothing may stay pressed. */
  resetAll() {
    for (const dir of DIRECTIONS) this.release(dir);
  }

  update(dt) {
    for (const dir of DIRECTIONS) this.receptors[dir].update(dt);
  }

  get active() {
    return DIRECTIONS.some((d) => this.receptors[d].active);
  }

  draw(ctx) {
    for (const dir of DIRECTIONS) this.receptors[dir].draw(ctx);
  }
}
