// Chart-free demonstration data (NOT a chart system): a small hard-coded pattern that shows
// downscroll taps, every lane, short holds, long holds and simultaneous holds in different lanes.
// t = ms from the start of the demo, len = sustain length in ms (0 / missing = tap note).

const T = (t, dir, len = 0) => ({ t, dir, len });

export const DEMO_PATTERN = [
  // 1) taps, every lane, both directions
  T(0, 'left'), T(450, 'down'), T(900, 'up'), T(1350, 'right'),
  T(1800, 'right'), T(2250, 'up'), T(2700, 'down'), T(3150, 'left'),
  // 2) short holds, one lane at a time
  T(3800, 'left', 600), T(4900, 'down', 600), T(6000, 'up', 600), T(7100, 'right', 600),
  // 3) long holds
  T(8200, 'down', 2000), T(10700, 'up', 2400),
  // 4) two simultaneous holds in separate lanes, with taps in the other two lanes meanwhile
  T(13600, 'left', 1600), T(13600, 'right', 1600), T(14100, 'down'), T(14600, 'up'),
  // 5) another simultaneous pair, then a closing run of taps
  T(16200, 'down', 1200), T(16200, 'up', 1200),
  T(18000, 'left'), T(18250, 'down'), T(18500, 'up'), T(18750, 'right'),
].sort((a, b) => a.t - b.t);

export class TestNoteGenerator {
  constructor(pattern = DEMO_PATTERN) {
    this.pattern = pattern;
    this.index = 0;
  }

  reset() {
    this.index = 0;
  }

  /** Next not-yet-spawned event, or null. */
  peek() {
    return this.pattern[this.index] ?? null;
  }

  next() {
    return this.pattern[this.index++] ?? null;
  }

  get done() {
    return this.index >= this.pattern.length;
  }

  /** Time at which the last note (including its sustain) is over. */
  get endTime() {
    return this.pattern.reduce((m, e) => Math.max(m, e.t + e.len), 0);
  }
}
