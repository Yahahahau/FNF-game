import { ArrowController } from './ArrowController.js';
import { AssetLoader } from './AssetLoader.js';
import { AudioController } from './AudioController.js';
import { HitboxController } from './HitboxController.js';
import { HoldCoverController } from './HoldCoverController.js';
import { NoteController } from './NoteController.js';
import { ScrollController, MAX_SPEED, MIN_SPEED } from './ScrollController.js';
import { SplashEffect } from './SplashEffect.js';
import { DIRECTIONS, NOTE_SPACING } from './constants.js';
import { COLORS } from './PlaceholderAssets.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const statusEl = $('status');
const controlsEl = $('controls');
const judgeEl = $('judge');
const params = new URLSearchParams(location.search);

const DEMO_LEAD_IN_MS = -1800; // clock start: the first note arrives ~1.5 s after the page opens
const DEMO_LOOP_GAP_MS = 1500;

async function boot() {
  const assets = new AssetLoader();
  try {
    await assets.load({ pack: params.get('pack') });
  } catch (err) {
    console.error(err);
    statusEl.classList.add('error');
    statusEl.textContent = `COULD NOT LOAD ASSETS\n${err.message}`;
    return;
  }
  start(assets);
}

function start(assets) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const scroll = new ScrollController();
  const arrows = new ArrowController(assets);
  const splashes = new SplashEffect(assets);
  const audio = new AudioController();
  const recs = arrows.receptors;
  const covers = new HoldCoverController(assets, (dir) => ({ x: recs[dir].centerX, y: recs[dir].centerY }));

  let dpr = 1;
  let raf = 0;
  let last = 0;
  let idleSince = 0;
  let judgeTimer = 0;

  // --- test status line ("SICK +12ms", "HOLD DROPPED"...) --------------------------------------
  let lastJudge = '';
  function onStatus(text, kind) {
    if (text === lastJudge && judgeEl.dataset.kind === kind && judgeEl.classList.contains('show')) {
      judgeEl.classList.remove('show');
      void judgeEl.offsetWidth; // restart the CSS animation for repeated messages
    }
    lastJudge = text;
    judgeEl.textContent = text;
    judgeEl.dataset.kind = kind;
    judgeEl.classList.add('show');
    clearTimeout(judgeTimer);
    judgeTimer = setTimeout(() => judgeEl.classList.remove('show'), 1100);
  }

  const notes = new NoteController({
    assets, scroll, arrows, splashes, covers,
    isHeld: (dir) => hitbox.isHeld(dir),
    onStatus,
  });

  // --- layout ------------------------------------------------------------------------------
  const rec = recs.left;
  const centers = Object.fromEntries(DIRECTIONS.map((d) => [d, recs[d].centerX]));
  const midX = (centers.left + centers.right) / 2;
  let layout = { ox: 0, oy: 0, s: 1, availH: 0, viewW: 0 };

  function relayout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);

    const barH = controlsEl.hidden ? 0 : controlsEl.offsetHeight;
    const availH = Math.max(120, viewH - barH);
    const s = Math.max(0.3, Math.min((viewW * 0.94) / (NOTE_SPACING * 4), (availH * 0.2) / rec.height, 2));
    const snap = (v) => Math.round(v * dpr) / dpr; // keep sprites pixel-aligned
    const recScreenY = availH - rec.height * s * 0.8; // receptors sit near the bottom (downscroll)
    const ox = snap(viewW / 2 - midX * s);
    const oy = snap(recScreenY - rec.centerY * s);
    layout = { ox, oy, s, availH, viewW };

    scroll.setViewport({ receptorY: rec.centerY, topY: -oy / s, bottomY: (availH - oy) / s });
    hitbox.setLayout({ ox, oy, s, centers, recY: rec.y, viewW, viewH });
    requestRender();
  }

  // --- drawing -----------------------------------------------------------------------------
  function drawLanes() {
    const w = NOTE_SPACING - 8;
    const top = scroll.topY - 2;
    const h = scroll.bottomY - top;
    for (const dir of DIRECTIONS) {
      const x = centers[dir] - w / 2;
      ctx.fillStyle = '#f3f3f7';
      ctx.fillRect(x, top, w, h);
      if (hitbox.isHeld(dir)) {
        ctx.fillStyle = `${COLORS[dir]}22`; // lane lights up softly while pressed
        ctx.fillRect(x, top, w, h);
      }
      ctx.fillStyle = '#dcdce4';
      ctx.fillRect(x - 1, top, 2, h);
      ctx.fillRect(x + w - 1, top, 2, h);
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const k = dpr * layout.s;
    ctx.setTransform(k, 0, 0, k, layout.ox * dpr, layout.oy * dpr);

    // playfield is clipped to the area above the control bar
    ctx.save();
    ctx.beginPath();
    ctx.rect(-layout.ox / layout.s, scroll.topY, layout.viewW / layout.s, scroll.bottomY - scroll.topY);
    ctx.clip();
    drawLanes();
    notes.drawTrails(ctx); // sustain bodies + end caps
    arrows.draw(ctx); // receptors
    notes.drawHeads(ctx); // tap / hold heads over the receptors
    covers.draw(ctx); // hold covers
    splashes.draw(ctx); // splashes on top
    ctx.restore();
  }

  // --- main loop -----------------------------------------------------------------------------
  /** One simulation step; the real loop calls it with the elapsed time, tests with fixed steps. */
  function step(dt) {
    scroll.advance(dt);
    notes.update();
    arrows.update(dt);
    splashes.update(dt);
    covers.update(dt);
    if (!scroll.paused && scroll.time > notes.generator.endTime + DEMO_LOOP_GAP_MS && notes.finished()) {
      restartDemo();
    }
  }

  const needsFrame = () =>
    !scroll.paused || arrows.active || splashes.active || covers.active;

  function requestRender() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.1); // a stalled tab never fast-forwards the notes
    last = now;
    step(dt);
    draw();
    if (needsFrame()) raf = requestAnimationFrame(tick);
  }

  function restartDemo() {
    hitbox.releaseAll();
    arrows.resetAll();
    notes.reset();
    scroll.reset(DEMO_LEAD_IN_MS);
    requestRender();
  }

  // --- input -> notes / animation / sound ------------------------------------------------
  const hitbox = new HitboxController(
    canvas,
    {
      onDown(dir) {
        audio.unlock(); // first gesture initialises/resumes the AudioContext
        audio.play(dir); // exactly once per press: key repeat never reaches this
        arrows.press(dir); // static -> press, immediately
        notes.tryHit(dir); // note in the timing window? -> confirm + splash (+ hold cover)
        requestRender();
      },
      onUp(dir) {
        arrows.release(dir); // always back to static
        notes.release(dir); // a held sustain is completed or interrupted right here
        requestRender();
      },
    },
    { debug: params.has('debug') },
  );

  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });

  // --- UI --------------------------------------------------------------------------------
  const sfxBtn = $('sfx-toggle');
  const volEl = $('sfx-volume');
  const speedEl = $('scroll-speed');
  const speedOut = $('speed-out');
  const pauseBtn = $('demo-pause');
  const restartBtn = $('demo-restart');

  const renderSfx = () => {
    sfxBtn.textContent = `ARROW SFX: ${audio.enabled ? 'ON' : 'OFF'}`;
    sfxBtn.setAttribute('aria-pressed', String(audio.enabled));
  };
  volEl.value = String(Math.round(audio.volume * 100));
  renderSfx();

  sfxBtn.addEventListener('click', () => {
    audio.unlock();
    audio.setEnabled(!audio.enabled); // instant; animations are untouched
    renderSfx();
    sfxBtn.blur();
  });
  const giveKeysBack = (el) => { el.addEventListener('change', () => el.blur()); el.addEventListener('pointerup', () => el.blur()); };
  volEl.addEventListener('input', () => audio.setVolume(Number(volEl.value) / 100));
  giveKeysBack(volEl);

  speedEl.min = String(MIN_SPEED * 10);
  speedEl.max = String(MAX_SPEED * 10);
  speedEl.value = String(Math.round(scroll.speed * 10));
  speedOut.textContent = scroll.speed.toFixed(1);
  speedEl.addEventListener('input', () => {
    scroll.setSpeed(Number(speedEl.value) / 10);
    speedOut.textContent = scroll.speed.toFixed(1);
    requestRender();
  });
  giveKeysBack(speedEl);

  pauseBtn.addEventListener('click', () => {
    scroll.paused = !scroll.paused;
    pauseBtn.textContent = scroll.paused ? 'RESUME DEMO' : 'PAUSE DEMO';
    pauseBtn.setAttribute('aria-pressed', String(scroll.paused));
    pauseBtn.blur();
    requestRender();
  });
  restartBtn.addEventListener('click', () => {
    restartDemo();
    restartBtn.blur();
  });

  if (assets.source !== 'placeholder') {
    $('legal').textContent = 'Local test with a user-supplied asset pack \u2014 not affiliated with The Funkin\' Crew Inc. Do not redistribute.';
  }

  // --- go --------------------------------------------------------------------------------
  statusEl.hidden = true;
  controlsEl.hidden = false;
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 150));
  new ResizeObserver(relayout).observe(document.documentElement);
  scroll.reset(DEMO_LEAD_IN_MS);
  relayout();

  // Handy for manual / automated testing.
  window.fnfArrow = {
    assets, scroll, arrows, splashes, covers, notes, hitbox, audio,
    step: (ms) => { for (let t = 0; t < ms; t += 1000 / 60) step(1 / 60); draw(); },
    redraw: draw,
    restart: restartDemo,
  };
}

boot();
