// Owns every live note: spawning (from the demo generator), hit detection, hold-note state
// machine, misses, recycling (pooling) and drawing.
//
// Successful hold sequence, exactly in this order:
//   HEAD HIT -> SPLASH -> COVER START -> COVER HOLD (loop) -> TAIL COMPLETED -> COVER END -> FINAL EFFECT
// Released early: COVER is interrupted (no END), no success effects, receptor back to idle.
import { drawFrameCentered } from './ArrowAnimation.js';
import { DIRECTIONS, GOOD_MS, HIT_WINDOW_MS, HOLD_END_TOLERANCE_MS, SICK_MS } from './constants.js';
import { HoldNote } from './HoldNote.js';
import { ObjectPool } from './ObjectPool.js';
import { SustainTrail } from './SustainTrail.js';
import { TapNote } from './TapNote.js';
import { TestNoteGenerator } from './TestNoteGenerator.js';

export class NoteController {
  /**
   * @param {object} deps
   * @param deps.assets      AssetLoader result
   * @param deps.scroll      ScrollController
   * @param deps.arrows      ArrowController (receptors)
   * @param deps.splashes    SplashEffect
   * @param deps.covers      HoldCoverController
   * @param deps.isHeld      (dir) => boolean, current input state of a lane
   * @param deps.onStatus    (text, kind) => void, simple test status line
   * @param deps.generator   optional note source
   */
  constructor({ assets, scroll, arrows, splashes, covers, isHeld, onStatus = () => {}, generator = new TestNoteGenerator() }) {
    this.scroll = scroll;
    this.arrows = arrows;
    this.splashes = splashes;
    this.covers = covers;
    this.isHeld = isHeld;
    this.onStatus = onStatus;
    this.generator = generator;

    this.active = [];
    this.tapPool = new ObjectPool(() => new TapNote());
    this.holdPool = new ObjectPool(() => new HoldNote());

    // per-direction skins, built once from the cached atlases
    const noteStyle = assets.style.note;
    const holdStyle = assets.style.holdNote;
    this.noteScale = noteStyle.scale ?? 0.35;
    this.heads = {};
    this.trails = {};
    for (const dir of DIRECTIONS) {
      this.heads[dir] = assets.atlas.notes.byPrefix(noteStyle.data[dir].prefix)[0];
      const body = assets.atlas.sustains.byPrefix(holdStyle.data[dir].body.prefix)[0];
      const end = assets.atlas.sustains.byPrefix(holdStyle.data[dir].end.prefix)[0];
      this.trails[dir] = new SustainTrail(
        { bodyCanvas: assets.atlas.sustains.frameCanvas(body), endCanvas: assets.atlas.sustains.frameCanvas(end) },
        holdStyle.scale ?? 0.35,
      );
    }
  }

  get count() {
    return this.active.length;
  }

  /** Receptor centre for a lane, in world units. */
  center(dir) {
    const r = this.arrows.receptors[dir];
    return { x: r.centerX, y: r.centerY };
  }

  reset() {
    for (const n of this.active) this.recycle(n);
    this.active.length = 0;
    this.generator.reset();
    this.covers.clear();
    this.splashes.clear();
  }

  recycle(n) {
    (n.isHold ? this.holdPool : this.tapPool).release(n);
  }

  /** True when the demo pattern has been fully played and nothing is left on screen. */
  finished() {
    return this.generator.done && this.active.length === 0;
  }

  // ------------------------------------------------------------------------------------------
  update() {
    const { scroll } = this;
    const now = scroll.time;

    // 1) spawn: a note exists as soon as it would be above the top edge of the screen
    const lead = scroll.spawnLeadMs();
    for (let e = this.generator.peek(); e && e.t - now <= lead; e = this.generator.peek()) {
      this.generator.next();
      const n = e.len > 0 ? this.holdPool.acquire().init(e.dir, e.t, e.len) : this.tapPool.acquire().init(e.dir, e.t);
      this.active.push(n);
    }

    // 2) advance every note
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      n.update(scroll);

      if (n.state === 'idle' && now > n.time + HIT_WINDOW_MS) {
        n.miss(); // nobody hit the head in time
        this.onStatus(n.isHold ? 'HOLD MISSED' : 'MISS', 'bad');
      }

      if (n.isHold && n.state === 'holding') {
        if (now >= n.endTime) this.completeHold(n);
        else if (!this.isHeld(n.dir)) this.endHold(n); // safety net; release() normally gets there first
        else this.arrows.holdConfirm(n.dir); // keep the receptor in confirm / confirm-hold
      }

      const gone =
        n.state === 'completed' ||
        (n.state === 'hit') ||
        ((n.state === 'missed' || n.state === 'dropped') && scroll.isBelowScreen(n.bottomY()));
      if (gone) {
        this.recycle(n);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  /** Input went down on `dir`. Returns the hit note, or null for a ghost tap. */
  tryHit(dir) {
    const now = this.scroll.time;
    let best = null;
    for (const n of this.active) {
      if (n.dir !== dir || !n.hittable) continue;
      if (Math.abs(now - n.time) > HIT_WINDOW_MS) continue;
      if (!best || n.time < best.time) best = n; // earliest note in the window, like the real game
    }
    if (!best) return null;

    const delta = now - best.time;
    const abs = Math.abs(delta);
    const label = abs <= SICK_MS ? 'SICK' : abs <= GOOD_MS ? 'GOOD' : 'BAD';
    const c = this.center(dir);
    const sign = delta >= 0 ? '+' : '';

    this.arrows.confirm(dir); // receptor confirm
    this.splashes.spawn(dir, c.x, c.y); // initial impact splash (taps AND hold heads)

    if (best.isHold) {
      best.hit();
      best.begin(); // head registered, now the input has to be maintained
      this.covers.begin(dir); // cover START -> HOLD
      this.onStatus(`${label} ${sign}${Math.round(delta)}ms · HOLD!`, 'good');
    } else {
      best.hit();
      this.onStatus(`${label} ${sign}${Math.round(delta)}ms`, 'good');
    }
    return best;
  }

  /** Input released on `dir` (keyboard up, pointer up/cancel, blur...). */
  release(dir) {
    for (const n of this.active) {
      if (n.dir === dir && n.isHold && n.state === 'holding') this.endHold(n);
    }
  }

  /** Released while holding: success only if the tail is (almost) over, otherwise interrupted. */
  endHold(n) {
    if (this.scroll.time >= n.endTime - HOLD_END_TOLERANCE_MS) this.completeHold(n);
    else this.dropHold(n);
  }

  completeHold(n) {
    n.complete();
    this.covers.end(n.dir); // cover END
    this.arrows.confirm(n.dir); // final completion pop, then the receptor returns to idle
    this.onStatus('HOLD COMPLETE', 'good');
  }

  dropHold(n) {
    n.drop();
    this.covers.interrupt(n.dir); // stop the loop immediately, no END animation
    this.arrows.receptors[n.dir].playStatic(); // appropriate idle state (press again if still held)
    this.onStatus('HOLD DROPPED', 'bad');
  }

  // ------------------------------------------------------------------------------------------
  drawTrails(ctx) {
    const { scroll } = this;
    for (const n of this.active) {
      if (!n.isHold) continue;
      const cx = this.arrows.receptors[n.dir].centerX;
      this.trails[n.dir].draw(ctx, n.trailState(scroll), cx, scroll.topY);
    }
  }

  drawHeads(ctx) {
    for (const n of this.active) {
      if (n.y < this.scroll.topY - 120) continue; // above the screen
      n.drawHead(ctx, this.heads[n.dir], this.arrows.receptors[n.dir].centerX, this.noteScale);
    }
  }
}
