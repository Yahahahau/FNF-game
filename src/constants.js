// Layout constants taken from funkin/play/notes/Strumline.hx (all in "game pixels").
export const STRUMLINE_SIZE = 104;
export const NOTE_SPACING = STRUMLINE_SIZE + 8; // distance between lane origins
export const INITIAL_OFFSET = -0.275 * STRUMLINE_SIZE;
export const KEY_COUNT = 4;
export const NOTE_SPLASH_CAP = 6;
export const CONFIRM_HOLD_TIME = 0.15; // StrumlineNote.CONFIRM_HOLD_TIME (seconds)

// --- Phase 1.5 gameplay constants --------------------------------------------------------
export const SCROLL_PX_PER_MS = 0.45; // FNF: 0.45 px/ms at scroll speed 1.0
export const HIT_WINDOW_MS = 150; // +/- window for tap notes and hold heads
export const SICK_MS = 45;
export const GOOD_MS = 90;
export const HOLD_END_TOLERANCE_MS = 100; // letting go this close to the tail end still completes
export const MISSED_ALPHA = 0.4;

/** Order matches the keyboard row: left, down, up, right. */
export const DIRECTIONS = ['left', 'down', 'up', 'right'];

export const DIR_INFO = {
  left: { index: 0, upper: 'LEFT', color: 'Purple', keys: ['ArrowLeft', 'KeyA'] },
  down: { index: 1, upper: 'DOWN', color: 'Blue', keys: ['ArrowDown', 'KeyS'] },
  up: { index: 2, upper: 'UP', color: 'Green', keys: ['ArrowUp', 'KeyW'] },
  right: { index: 3, upper: 'RIGHT', color: 'Red', keys: ['ArrowRight', 'KeyD'] },
};

export const KEY_TO_DIR = Object.fromEntries(
  DIRECTIONS.flatMap((d) => DIR_INFO[d].keys.map((k) => [k, d])),
);

/** Lane origin x in strumline space (StrumlineNote x before INITIAL_OFFSET). */
export const laneX = (dir) => DIR_INFO[dir].index * NOTE_SPACING;
