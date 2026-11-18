// A hold note = directional head + long sustain body + terminal end cap.
// The sustain length is the real duration (duration * pxPerMs). The head is just a TapNote head.
//
// States: idle -> holding -> completed | dropped      (idle -> missed if the head is never hit)
//   holding   head was hit, input must be maintained until the tail reaches the receptor
//   completed tail reached the receptor while held (or released within the end tolerance)
//   dropped   released early: no success effects, the remaining tail keeps scrolling, greyed
import { TapNote } from './TapNote.js';
import { MISSED_ALPHA } from './constants.js';

export class HoldNote extends TapNote {
  constructor() {
    super();
    this.isHold = true;
    this.duration = 0;
  }

  init(dir, time, duration) {
    super.init(dir, time);
    this.duration = duration;
    this.endY = undefined;
    return this;
  }

  get endTime() {
    return this.time + this.duration;
  }

  begin() {
    this.state = 'holding';
    this.headVisible = false;
  }

  complete() {
    this.state = 'completed';
  }

  drop() {
    this.state = 'dropped';
  }

  /** Position of the sustain's far (upper) end: once even that is below the screen, nothing is left to see. */
  bottomY() {
    return this.endY ?? this.y;
  }

  update(scroll) {
    super.update(scroll);
    this.endY = scroll.yAt(this.endTime);
  }

  /** Geometry in world units for the current clock; see SustainTrail.draw. */
  trailState(scroll) {
    const holding = this.state === 'holding';
    const yHeadRaw = scroll.yAt(this.time);
    return {
      // once hit, the sustain is cut at the receptor: the head stays glued to it
      yHead: holding ? Math.min(yHeadRaw, scroll.receptorY) : yHeadRaw,
      yEnd: scroll.yAt(this.endTime),
      clipBottom: holding ? scroll.receptorY : Infinity,
      alpha: this.state === 'missed' || this.state === 'dropped' ? MISSED_ALPHA : 1,
    };
  }
}
