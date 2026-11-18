// Four independent hitboxes + all input sources (keyboard, mouse, multi-touch).
//
// Modelled on funkin/mobile/ui/FunkinHitbox.hx: a hitbox follows its receptor horizontally and
// reaches far above and below it, which gives phones a very large target. Here each box is
// exactly one lane wide and spans the whole playfield height, so a touch is never ambiguous.
//
// Every lane keeps a *set of active sources* ("k:KeyA", "k:ArrowLeft", "p:3"...). The lane is
// pressed while the set is non-empty, so e.g. A + ArrowLeft together do not release early.
import { DIRECTIONS, KEY_TO_DIR, NOTE_SPACING } from './constants.js';

const MIN_HALF_WIDTH_PX = 44; // keep a 88px+ wide target on small screens

export class HitboxController {
  /**
   * @param {HTMLElement} surface element that receives pointer events (the canvas)
   * @param {{onDown:(dir:string)=>void, onUp:(dir:string)=>void}} handlers
   * @param {{debug?:boolean}} [opts]
   */
  constructor(surface, handlers, opts = {}) {
    this.surface = surface;
    this.handlers = handlers;
    this.sources = Object.fromEntries(DIRECTIONS.map((d) => [d, new Set()]));
    this.pointerLane = new Map(); // pointerId -> dir
    this.layout = null;
    this.rects = {};
    this.debugEls = null;
    this.abort = new AbortController();
    if (opts.debug) this.createDebug();
    this.bind();
  }

  /**
   * @param {{ox:number, oy:number, s:number, centers:Record<string,number>, recY:number, viewW:number, viewH:number}} layout
   * `centers` are receptor centre x positions in world units; ox/oy/s map world -> CSS px.
   */
  setLayout(layout) {
    this.layout = layout;
    const { ox, oy, s, centers, recY, viewH } = layout;
    const half = Math.max((NOTE_SPACING * s) / 2, MIN_HALF_WIDTH_PX);
    const outer = NOTE_SPACING * s * 0.35;
    const top = 0; // each hitbox is its whole lane: the full height of the playfield
    DIRECTIONS.forEach((dir, i) => {
      const cx = ox + centers[dir] * s;
      this.rects[dir] = {
        left: cx - half - (i === 0 ? outer : 0),
        right: cx + half + (i === DIRECTIONS.length - 1 ? outer : 0),
        top,
        bottom: viewH,
      };
    });
    if (this.debugEls) this.updateDebug();
  }

  laneAt(x, y) {
    for (const dir of DIRECTIONS) {
      const r = this.rects[dir];
      if (r && x >= r.left && x < r.right && y >= r.top && y <= r.bottom) return dir;
    }
    return null;
  }

  isHeld(dir) {
    return this.sources[dir].size > 0;
  }

  add(dir, id) {
    const set = this.sources[dir];
    if (set.has(id)) return;
    const wasEmpty = set.size === 0;
    set.add(id);
    if (wasEmpty) this.handlers.onDown(dir);
  }

  remove(dir, id) {
    const set = this.sources[dir];
    if (!set.delete(id)) return;
    if (set.size === 0) this.handlers.onUp(dir);
  }

  /** Drops every source (blur, tab hidden, mode change...). Nothing may remain pressed. */
  releaseAll() {
    this.pointerLane.clear();
    for (const dir of DIRECTIONS) {
      if (this.sources[dir].size) {
        this.sources[dir].clear();
        this.handlers.onUp(dir);
      }
    }
  }

  bind() {
    const { signal } = this.abort;
    const s = this.surface;

    // --- keyboard -----------------------------------------------------------------------
    window.addEventListener('keydown', (e) => {
      const dir = KEY_TO_DIR[e.code];
      if (!dir) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'range') return; // slider keeps its arrows
      e.preventDefault(); // no page scrolling with the arrow keys
      if (e.repeat) return; // holding a key must not retrigger
      this.add(dir, `k:${e.code}`);
    }, { signal });

    window.addEventListener('keyup', (e) => {
      const dir = KEY_TO_DIR[e.code];
      if (!dir) return;
      this.remove(dir, `k:${e.code}`);
    }, { signal });

    window.addEventListener('blur', () => this.releaseAll(), { signal });
    window.addEventListener('pagehide', () => this.releaseAll(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    }, { signal });

    // --- pointer (mouse / touch / pen, multi-touch) -------------------------------------
    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const dir = this.laneAt(e.clientX, e.clientY);
      if (!dir) return;
      e.preventDefault();
      try { s.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this.pointerLane.set(e.pointerId, dir);
      this.add(dir, `p:${e.pointerId}`);
    }, { signal });

    s.addEventListener('pointermove', (e) => {
      const cur = this.pointerLane.get(e.pointerId);
      if (cur === undefined) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) { this.endPointer(e.pointerId); return; }
      const next = this.laneAt(e.clientX, e.clientY);
      if (next === cur) return;
      // Sliding off a lane releases it (FunkinHint.onOut); sliding onto another presses it.
      this.remove(cur, `p:${e.pointerId}`);
      if (next) {
        this.pointerLane.set(e.pointerId, next);
        this.add(next, `p:${e.pointerId}`);
      } else {
        this.pointerLane.set(e.pointerId, null);
      }
    }, { signal });

    const end = (e) => this.endPointer(e.pointerId);
    s.addEventListener('pointerup', end, { signal });
    s.addEventListener('pointercancel', end, { signal });
    s.addEventListener('lostpointercapture', end, { signal });
    window.addEventListener('pointerup', end, { signal }); // release outside the window
    s.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  }

  endPointer(id) {
    if (!this.pointerLane.has(id)) return;
    const dir = this.pointerLane.get(id);
    this.pointerLane.delete(id);
    if (dir) this.remove(dir, `p:${id}`);
  }

  // --- optional visual debug (?debug) --------------------------------------------------
  createDebug() {
    this.debugEls = {};
    for (const dir of DIRECTIONS) {
      const el = document.createElement('div');
      el.className = 'hitbox-debug';
      el.dataset.dir = dir;
      document.body.appendChild(el);
      this.debugEls[dir] = el;
    }
  }

  updateDebug() {
    for (const dir of DIRECTIONS) {
      const r = this.rects[dir];
      const el = this.debugEls[dir];
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.right - r.left}px`;
      el.style.height = `${r.bottom - r.top}px`;
    }
  }

  dispose() {
    this.abort.abort();
    this.releaseAll();
    if (this.debugEls) for (const el of Object.values(this.debugEls)) el.remove();
  }
}
