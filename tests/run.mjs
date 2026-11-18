// Headless logic tests (no browser needed). Everything runs against the real placeholder
// sprite pack (packed + exported to Sparrow XML, then parsed again), so prefixes, frame counts
// and animation names are verified end to end.
//   npm test
import assert from 'node:assert/strict';

// --- minimal DOM stubs so the modules can run under Node ----------------------------------------
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true });
const stubCanvas = (w = 1, h = 1) => ({ width: w, height: h, getContext: () => noop });
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { hidden: false, createElement: () => stubCanvas() });
globalThis.HTMLInputElement = class {};
globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
})();

const { AssetLoader, parseSparrow, parseJsonAtlas, framesByPrefix, missingPrefixes, resolveAssetUrl } =
  await import('../src/AssetLoader.js');
const { AnimatedSprite } = await import('../src/ArrowAnimation.js');
const { ArrowController } = await import('../src/ArrowController.js');
const { SplashEffect } = await import('../src/SplashEffect.js');
const { HoldCoverController } = await import('../src/HoldCoverController.js');
const { HitboxController } = await import('../src/HitboxController.js');
const { ScrollController, SCROLL_DIRECTION } = await import('../src/ScrollController.js');
const { NoteController } = await import('../src/NoteController.js');
const { TestNoteGenerator, DEMO_PATTERN } = await import('../src/TestNoteGenerator.js');
const { trailGeometry } = await import('../src/SustainTrail.js');
const { ObjectPool } = await import('../src/ObjectPool.js');
const C = await import('../src/constants.js');
const { DIRECTIONS, NOTE_SPLASH_CAP, KEY_TO_DIR, HIT_WINDOW_MS, HOLD_END_TOLERANCE_MS } = C;

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n${e.stack}`); process.exitCode = 1; }
};

const assets = await new AssetLoader().load({ makeCanvas: stubCanvas });
const STEP = 1 / 60;
const run = (fn, seconds) => { for (let t = 0; t < seconds; t += STEP) fn(STEP); };

console.log('sprite pack / loader');
test('placeholder pack is complete (no missing prefixes in any group)', () => {
  const a = assets.atlas;
  for (const g of ['noteStrumline', 'noteSplash', 'note', 'holdNote', 'holdNoteCover']) {
    assert.deepEqual(missingPrefixes(g, assets.style[g], a), [], g);
  }
});
test('strumline frame counts: static 1, press 4, confirm 4, confirmHold 3', () => {
  const d = assets.style.noteStrumline.data;
  for (const dir of DIRECTIONS) {
    const n = (k) => assets.atlas.strumline.byPrefix(d[`${dir}${k}`].prefix).length;
    assert.deepEqual([n('Static'), n('Press'), n('Confirm'), n('ConfirmHold')], [1, 4, 4, 3]);
  }
});
test('"confirmLeft" does not swallow confirmHoldLeft frames', () => {
  const names = assets.atlas.strumline.byPrefix('confirmLeft').map((f) => f.name);
  assert.equal(names.length, 4);
  assert.ok(names.every((n) => n.startsWith('confirmLeft0')));
});
test('every splash direction has 2 variants x 4 ordered frames, in its own colour', () => {
  const colour = { left: 'Purple', down: 'Blue', up: 'Green', right: 'Red' };
  for (const dir of DIRECTIONS) {
    const list = assets.style.noteSplash.data[`${dir}Splashes`];
    assert.equal(list.length, 2);
    for (const v of list) {
      const f = assets.atlas.splash.byPrefix(v.prefix);
      assert.equal(f.length, 4);
      assert.ok(v.prefix.includes(colour[dir]));
      assert.deepEqual(f.map((x) => x.name), [...f.map((x) => x.name)].sort());
    }
  }
});
test('hold cover: start 5 / hold 4 / end 5 frames per direction', () => {
  for (const dir of DIRECTIONS) {
    const c = assets.style.holdNoteCover.data[dir];
    const at = assets.atlas.covers[dir];
    assert.deepEqual([c.start, c.hold, c.end].map((k) => at.byPrefix(k.prefix).length), [5, 4, 5]);
  }
});
test('sustain skin: one tileable body + one end cap per direction', () => {
  for (const dir of DIRECTIONS) {
    const s = assets.style.holdNote.data[dir];
    assert.equal(assets.atlas.sustains.byPrefix(s.body.prefix).length, 1);
    assert.equal(assets.atlas.sustains.byPrefix(s.end.prefix).length, 1);
  }
});
test('Sparrow parser: frameX/rotated/missing attributes', () => {
  const f = parseSparrow('<TextureAtlas><SubTexture name="a0001" x="1" y="2" width="3" height="4" frameX="-5" frameY="-6" frameWidth="30" frameHeight="40" rotated="true"/><SubTexture name="a0002" x="9" y="9" width="2" height="2"/></TextureAtlas>');
  assert.equal(f.length, 2);
  assert.deepEqual([f[0].frameX, f[0].frameW, f[0].rotated], [-5, 30, true]);
  assert.deepEqual([f[1].frameW, f[1].rotated], [2, false]);
});
test('JSON atlas parser (hash + array forms)', () => {
  const hash = parseJsonAtlas({ frames: { 'b0000.png': { frame: { x: 4, y: 5, w: 6, h: 7 }, sourceSize: { w: 8, h: 9 }, spriteSourceSize: { x: 1, y: 2, w: 6, h: 7 } } } });
  assert.deepEqual([hash[0].name, hash[0].x, hash[0].w, hash[0].frameW, hash[0].frameX], ['b0000', 4, 6, 8, -1]);
  const arr = parseJsonAtlas({ frames: [{ filename: 'c1', frame: { x: 0, y: 0, w: 2, h: 3 } }] });
  assert.equal(arr[0].name, 'c1');
});
test('missing assets are reported, not thrown', () => {
  const miss = missingPrefixes('noteStrumline', assets.style.noteStrumline, { strumline: { byPrefix: () => [] } });
  assert.ok(miss.length > 0);
  assert.deepEqual(missingPrefixes('holdNoteCover', { data: {} }, { covers: {} }).length > 0, true);
});
test('asset url resolution ignores the namespace', () => {
  assert.equal(resolveAssetUrl('/p/', 'shared:noteStrumline'), '/p/noteStrumline');
  assert.equal(resolveAssetUrl('/p', 'x'), '/p/x');
});
globalThis.fetch = async () => ({ ok: false, status: 404 });
const failedPack = await new AssetLoader().load({ pack: '/nope', makeCanvas: stubCanvas });
test('a user pack that fails to load falls back to the placeholder pack', () => {
  const l = failedPack;
  assert.equal(l.source, 'placeholder');
  assert.ok(l.warnings.length > 0);
  assert.deepEqual(missingPrefixes('noteStrumline', l.style.noteStrumline, l.atlas), []);
});

console.log('animation controller');
test('24 fps, 4 frames: finishes after 4/24 s, fires onFinish once, holds last frame', () => {
  const s = new AnimatedSprite();
  s.add('a', [0, 1, 2, 3].map((i) => ({ i })), 24, false);
  let fin = 0;
  s.onFinish = () => fin++;
  s.play('a');
  s.update(1 / 24 - 0.001);
  assert.equal(s.frame.i, 0);
  s.update(0.002);
  assert.equal(s.frame.i, 1);
  s.update(2 / 24);
  assert.equal(s.frame.i, 3);
  assert.equal(fin, 0);
  s.update(1 / 24);
  assert.equal(fin, 1);
  assert.equal(s.frame.i, 3);
  s.update(1);
  assert.equal(fin, 1);
});
test('a long frame never skips frames when callbacks are involved (catch-up is sequential)', () => {
  const s = new AnimatedSprite();
  const seen = [];
  s.add('a', [0, 1, 2, 3, 4].map((i) => ({ i })), 24, true);
  s.play('a');
  for (let k = 0; k < 20; k++) { s.update(1 / 24 + 1e-6); seen.push(s.frame.i); }
  for (let k = 1; k < seen.length; k++) assert.equal(seen[k], (seen[k - 1] + 1) % 5);
});
test('play() of the running animation is a no-op, force restarts', () => {
  const s = new AnimatedSprite();
  s.add('a', [0, 1, 2].map((i) => ({ i })), 24, false);
  s.play('a');
  s.update(1 / 24);
  s.play('a');
  assert.equal(s.frame.i, 1);
  s.play('a', true);
  assert.equal(s.frame.i, 0);
});


console.log('receptors');
test('press -> static on release; press is immediate and per lane', () => {
  const c = new ArrowController(assets);
  for (const dir of DIRECTIONS) {
    c.press(dir);
    assert.equal(c.receptors[dir].sprite.name, 'press');
    c.release(dir);
    assert.equal(c.receptors[dir].sprite.name, 'static');
  }
  c.press('up');
  assert.equal(c.receptors.left.sprite.name, 'static');
});
test('confirm plays 4 frames, lingers 0.15s, falls back to static; to press if still held', () => {
  const c = new ArrowController(assets);
  c.confirm('down');
  run((dt) => c.update(dt), 4 / 24 + 0.05);
  assert.equal(c.receptors.down.sprite.name, 'confirm');
  run((dt) => c.update(dt), 0.2);
  assert.equal(c.receptors.down.sprite.name, 'static');
  c.press('left');
  c.confirm('left');
  run((dt) => c.update(dt), 4 / 24 + 0.3);
  assert.equal(c.receptors.left.sprite.name, 'press');
});
test('holdConfirm: confirm -> confirm-hold; release returns to static', () => {
  const c = new ArrowController(assets);
  c.press('right');
  run((dt) => { c.holdConfirm('right'); c.update(dt); }, 0.6);
  assert.equal(c.receptors.right.sprite.name, 'confirm-hold');
  c.release('right');
  assert.equal(c.receptors.right.sprite.name, 'static');
});

console.log('splash + hold cover controller');
const centerOf = () => ({ x: 100, y: 200 });
test('splash: random variant, 22-26 fps, killed when finished, own direction', () => {
  const sp = new SplashEffect(assets);
  for (const dir of DIRECTIONS) {
    const s = sp.spawn(dir, 10, 20);
    assert.ok(s.sprite.name.startsWith(`splash${dir.toUpperCase()}`));
    assert.ok(s.sprite.cur.fps >= 22 && s.sprite.cur.fps <= 26);
    assert.equal([s.cx, s.cy].join(), '10,20');
  }
  run((dt) => sp.update(dt), 1);
  assert.equal(sp.aliveCount, 0);
});
test(`splash pool is capped at ${NOTE_SPLASH_CAP} and reuses objects`, () => {
  const sp = new SplashEffect(assets);
  for (let i = 0; i < 40; i++) sp.spawn(DIRECTIONS[i % 4], 0, 0);
  assert.equal(sp.pool.length, NOTE_SPLASH_CAP);
});
test('cover: START (once) -> HOLD (loops forever) -> END -> removed', () => {
  const hc = new HoldCoverController(assets, centerOf);
  hc.begin('down');
  assert.equal(hc.stage('down'), 'start');
  run((dt) => hc.update(dt), 0.1);
  assert.equal(hc.stage('down'), 'start');
  run((dt) => hc.update(dt), 0.5);
  assert.equal(hc.stage('down'), 'hold');
  run((dt) => hc.update(dt), 5);
  assert.equal(hc.stage('down'), 'hold');
  hc.end('down');
  assert.equal(hc.stage('down'), 'end');
  run((dt) => hc.update(dt), 1);
  assert.equal(hc.stage('down'), 'idle');
  assert.equal(hc.active, false);
});
test('cover: interrupt() removes it at once, with no END animation', () => {
  const hc = new HoldCoverController(assets, centerOf);
  hc.begin('up');
  run((dt) => hc.update(dt), 0.5);
  hc.interrupt('up');
  assert.equal(hc.stage('up'), 'idle');
  hc.end('up'); // a late end() must not resurrect it
  assert.equal(hc.stage('up'), 'idle');
});
test('cover: lanes are independent; restarting never stacks two animations', () => {
  const hc = new HoldCoverController(assets, centerOf);
  hc.begin('left'); hc.begin('right');
  run((dt) => hc.update(dt), 0.6);
  hc.end('left');
  assert.equal(hc.stage('left'), 'end');
  assert.equal(hc.stage('right'), 'hold');
  hc.begin('left'); // while END is still playing
  assert.equal(hc.stage('left'), 'start');
});

console.log('scroll / downscroll');
const mkScroll = () => {
  const s = new ScrollController();
  s.setSpeed(2);
  s.setViewport({ receptorY: 700, topY: 0, bottomY: 800 });
  s.reset(0);
  return s;
};
test('direction constant is DOWN (+y), never upscroll', () => {
  assert.equal(SCROLL_DIRECTION, 1);
});
test('a future note is above the receptor, reaches it exactly on time, then passes below', () => {
  const s = mkScroll();
  const t = 1000;
  assert.ok(s.yAt(t) < 700);
  s.reset(t);
  assert.equal(s.yAt(t), 700);
  s.reset(t + 200);
  assert.ok(s.yAt(t) > 700);
});
test('y strictly increases as time passes (top -> bottom) at constant spacing', () => {
  const s = mkScroll();
  let prev = -Infinity;
  const ys = [];
  for (let i = 0; i < 50; i++) {
    s.advance(1 / 60);
    const y = s.yAt(900);
    assert.ok(y > prev);
    ys.push(y);
    prev = y;
  }
  const d = ys.slice(1).map((v, i) => v - ys[i]);
  assert.ok(Math.max(...d) - Math.min(...d) < 1e-9);
  assert.ok(Math.abs(d[0] - s.pxPerMs * (1000 / 60)) < 1e-9);
});
test('movement is elapsed-time based: 1x60Hz and 2x30Hz agree', () => {
  const a = mkScroll(); const b = mkScroll();
  for (let i = 0; i < 60; i++) a.advance(1 / 60);
  for (let i = 0; i < 30; i++) b.advance(1 / 30);
  assert.ok(Math.abs(a.yAt(500) - b.yAt(500)) < 1e-6);
});
test('speed is configurable and scales distance per ms; pause freezes the clock', () => {
  const s = mkScroll();
  const base = s.pxPerMs;
  s.setSpeed(4);
  assert.equal(s.pxPerMs, base * 2);
  s.paused = true;
  s.advance(1);
  assert.equal(s.time, 0);
});
test('spawn lead puts the head above the top edge', () => {
  const s = mkScroll();
  const lead = s.spawnLeadMs();
  assert.ok(s.yAt(lead) <= s.topY - 150);
});

console.log('demo generator');
test('pattern covers taps in all lanes, short + long holds and simultaneous holds', () => {
  const taps = DEMO_PATTERN.filter((e) => !e.len);
  const holds = DEMO_PATTERN.filter((e) => e.len);
  for (const d of DIRECTIONS) assert.ok(taps.some((e) => e.dir === d), `tap ${d}`);
  assert.ok(holds.some((e) => e.len <= 700), 'short hold');
  assert.ok(holds.some((e) => e.len >= 2000), 'long hold');
  assert.ok(holds.some((a) => holds.some((b) => a !== b && a.t < b.t + b.len && b.t < a.t + a.len && a.dir !== b.dir)), 'simultaneous');
  assert.deepEqual(DEMO_PATTERN.map((e) => e.t), DEMO_PATTERN.map((e) => e.t).sort((a, b) => a - b));
});
test('no two notes overlap inside the same lane (head inside another sustain)', () => {
  for (const a of DEMO_PATTERN) {
    for (const b of DEMO_PATTERN) {
      if (a !== b && a.dir === b.dir && a.len > 0) assert.ok(!(b.t >= a.t && b.t <= a.t + a.len + 150), `${a.dir}@${a.t} vs @${b.t}`);
    }
  }
});

console.log('sustain trail geometry');
test('tail length equals duration * speed; body joins head and cap with no gap', () => {
  const s = mkScroll();
  const dur = 1500;
  const yHead = s.yAt(1000);
  const yEnd = s.yAt(1000 + dur);
  const g = trailGeometry({ yHead, yEnd, capH: 28 });
  assert.ok(Math.abs(g.length - dur * s.pxPerMs) < 1e-9);
  assert.equal(g.bodyTop, g.capBottom); // continuous: cap ends where the body starts
  assert.equal(g.bodyBottom, yHead); // body reaches the head
  assert.ok(g.capTop < g.bodyTop && g.bodyTop < g.bodyBottom); // cap is at the far (upper) end
  const longer = trailGeometry({ yHead, yEnd: s.yAt(1000 + 3000), capH: 28 });
  assert.ok(longer.length > g.length * 1.9); // scales with duration
});

console.log('note gameplay (tap + hold state machine)');
function makeGame(pattern) {
  const scroll = mkScroll();
  scroll.reset(-2000);
  const arrows = new ArrowController(assets);
  const splashes = new SplashEffect(assets);
  const covers = new HoldCoverController(assets, centerOf);
  const held = new Set();
  const log = [];
  const status = [];
  // record the cover lifecycle in order
  for (const m of ['begin', 'end', 'interrupt']) {
    const orig = covers[m].bind(covers);
    covers[m] = (d) => { log.push(`cover.${m}:${d}`); return orig(d); };
  }
  const origSpawn = splashes.spawn.bind(splashes);
  splashes.spawn = (...a) => { log.push(`splash:${a[0]}`); return origSpawn(...a); };
  const notes = new NoteController({
    assets, scroll, arrows, splashes, covers,
    isHeld: (d) => held.has(d), onStatus: (t, k) => status.push(`${k}:${t}`),
    generator: new TestNoteGenerator(pattern),
  });
  const g = {
    scroll, arrows, splashes, covers, notes, held, log, status,
    advanceTo(ms) { while (scroll.time < ms) { scroll.advance(STEP); notes.update(); arrows.update(STEP); splashes.update(STEP); covers.update(STEP); } },
    down(dir) { held.add(dir); arrows.press(dir); return notes.tryHit(dir); },
    up(dir) { held.delete(dir); arrows.release(dir); notes.release(dir); },
  };
  return g;
}

test('tap note: hit in window -> confirm + directional splash + note removed', () => {
  const g = makeGame([{ t: 0, dir: 'up', len: 0 }]);
  g.advanceTo(-5);
  assert.equal(g.notes.count, 1);
  const n = g.down('up');
  assert.ok(n);
  assert.equal(g.arrows.receptors.up.sprite.name, 'confirm');
  assert.deepEqual(g.log, ['splash:up']);
  g.advanceTo(20);
  assert.equal(g.notes.count, 0);
  assert.equal(g.covers.active, false); // taps never get a hold cover
});
test('tap note: wrong lane does not hit; outside the window is a ghost tap', () => {
  const g = makeGame([{ t: 0, dir: 'left', len: 0 }]);
  g.advanceTo(-10);
  assert.equal(g.down('right'), null);
  g.up('right');
  assert.equal(g.notes.count, 1);
  assert.equal(g.log.length, 0);
  assert.equal(g.arrows.receptors.right.sprite.name, 'static');
});
test('tap note: too early = no hit, too late = miss then removed once off screen', () => {
  const g = makeGame([{ t: 0, dir: 'down', len: 0 }]);
  g.advanceTo(-(HIT_WINDOW_MS + 40));
  assert.equal(g.down('down'), null);
  g.up('down');
  g.advanceTo(HIT_WINDOW_MS + 40);
  assert.ok(g.status.some((s) => s.includes('MISS')));
  g.advanceTo(3000);
  assert.equal(g.notes.count, 0);
  assert.equal(g.log.length, 0);
});
test('HOLD success: head -> splash -> cover START -> HOLD -> tail done -> cover END; receptor idles', () => {
  const g = makeGame([{ t: 0, dir: 'left', len: 1000 }]);
  g.advanceTo(0);
  const n = g.down('left');
  assert.equal(n.state, 'holding');
  // order of effects at the head: splash BEFORE cover start, both at the beginning
  assert.deepEqual(g.log, ['splash:left', 'cover.begin:left']);
  g.advanceTo(300);
  assert.equal(g.covers.stage('left'), 'hold');
  assert.equal(g.notes.count, 1, 'must not auto-complete just because the head was pressed');
  g.advanceTo(900);
  assert.equal(g.covers.stage('left'), 'hold');
  assert.equal(n.state, 'holding');
  assert.ok(!g.log.includes('cover.end:left'));
  g.advanceTo(1020);
  assert.deepEqual(g.log, ['splash:left', 'cover.begin:left', 'cover.end:left']);
  assert.equal(g.log.filter((l) => l.startsWith('splash')).length, 1, 'no second splash at the end');
  assert.ok(g.status.some((s) => s.includes('HOLD COMPLETE')));
  assert.equal(g.covers.stage('left'), 'end');
  g.advanceTo(2500);
  assert.equal(g.covers.stage('left'), 'idle');
  assert.equal(g.notes.count, 0);
  g.up('left');
  g.advanceTo(3000);
  assert.equal(g.arrows.receptors.left.sprite.name, 'static');
});
test('HOLD early release: cover interrupted at once, no END, no success status, receptor idle', () => {
  const g = makeGame([{ t: 0, dir: 'right', len: 2000 }]);
  g.advanceTo(0);
  const n = g.down('right');
  g.advanceTo(500);
  g.up('right');
  assert.equal(n.state, 'dropped');
  assert.equal(g.covers.stage('right'), 'idle');
  assert.ok(g.log.includes('cover.interrupt:right'));
  assert.ok(!g.log.includes('cover.end:right'));
  assert.ok(g.status.some((s) => s.includes('HOLD DROPPED')));
  assert.ok(!g.status.some((s) => s.includes('HOLD COMPLETE')));
  assert.equal(g.arrows.receptors.right.sprite.name, 'static');
  g.advanceTo(1200);
  assert.equal(g.notes.count, 1, 'the greyed tail keeps scrolling after the drop');
  g.advanceTo(2600);
  assert.ok(!g.log.includes('cover.end:right'), 'a dropped hold never completes later');
  g.advanceTo(6000);
  assert.equal(g.notes.count, 0);
});
test(`HOLD released within ${HOLD_END_TOLERANCE_MS}ms of the end still completes`, () => {
  const g = makeGame([{ t: 0, dir: 'down', len: 1000 }]);
  g.advanceTo(0);
  g.down('down');
  g.advanceTo(1000 - HOLD_END_TOLERANCE_MS + 20);
  g.up('down');
  assert.ok(g.log.includes('cover.end:down'));
});
test('HOLD head never pressed = missed, no cover, no effects', () => {
  const g = makeGame([{ t: 0, dir: 'up', len: 800 }]);
  g.advanceTo(HIT_WINDOW_MS + 50);
  assert.ok(g.status.some((s) => s.includes('HOLD MISSED')));
  g.advanceTo(HIT_WINDOW_MS + 100);
  g.down('up'); // too late
  assert.equal(g.covers.active, false);
  assert.equal(g.log.includes('splash:up'), false);
});
test('simultaneous holds in separate lanes are independent (release one, the other continues)', () => {
  const g = makeGame([{ t: 0, dir: 'left', len: 1500 }, { t: 0, dir: 'right', len: 1500 }]);
  g.advanceTo(0);
  g.down('left'); g.down('right');
  assert.equal(g.log.filter((l) => l.startsWith('cover.begin')).length, 2);
  g.advanceTo(600);
  g.up('left');
  assert.equal(g.covers.stage('left'), 'idle');
  assert.equal(g.covers.stage('right'), 'hold');
  g.advanceTo(1550);
  assert.ok(g.log.includes('cover.end:right'));
  assert.ok(!g.log.includes('cover.end:left'));
});
test('safety net: a lost keyup is detected by polling (no stuck hold)', () => {
  const g = makeGame([{ t: 0, dir: 'up', len: 2000 }]);
  g.advanceTo(0);
  g.down('up');
  g.held.delete('up'); // input vanished without a release event
  g.advanceTo(100);
  assert.ok(g.log.includes('cover.interrupt:up'));
});
test('hold sustain is clipped at the receptor once hit (head glued to it)', () => {
  const g = makeGame([{ t: 0, dir: 'left', len: 1000 }]);
  g.advanceTo(-40);
  const n = g.down('left');
  g.advanceTo(300);
  const t = n.trailState(g.scroll);
  assert.equal(t.clipBottom, g.scroll.receptorY);
  assert.ok(t.yHead <= g.scroll.receptorY);
  assert.ok(Math.abs((t.yHead - t.yEnd) - (g.scroll.receptorY - g.scroll.yAt(1000))) < 1e-6);
});
test('notes are pooled and recycled (no growth across a whole demo run)', () => {
  const g = makeGame(DEMO_PATTERN);
  g.advanceTo(DEMO_PATTERN.at(-1).t + 6000);
  assert.equal(g.notes.count, 0);
  const created = g.notes.tapPool.created + g.notes.holdPool.created;
  assert.ok(created <= 12, `created ${created}`);
  g.notes.reset();
  g.advanceTo(g.scroll.time + 100);
});
test('ObjectPool reuses released objects', () => {
  const p = new ObjectPool(() => ({}));
  const a = p.acquire(); p.release(a);
  assert.equal(p.acquire(), a);
  assert.equal(p.created, 1);
});

console.log('hitbox / input');
const makeHitbox = () => {
  const surface = Object.assign(new EventTarget(), { setPointerCapture() {} });
  const log = [];
  const hb = new HitboxController(surface, {
    onDown: (d) => log.push(`down:${d}`),
    onUp: (d) => log.push(`up:${d}`),
  });
  const centers = { left: 100, down: 212, up: 324, right: 436 };
  hb.setLayout({ ox: 0, oy: 100, s: 1, centers, recY: 0, viewW: 600, viewH: 800 });
  return { hb, surface, log };
};
const key = (type, code, extra = {}) =>
  Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ...extra });
const ptr = (type, id, x, y, extra = {}) =>
  Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, buttons: 1, ...extra,
  });

test('all 8 keys map to the right lanes', () => {
  assert.deepEqual(
    ['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS', 'ArrowUp', 'KeyW', 'ArrowRight', 'KeyD'].map((k) => KEY_TO_DIR[k]),
    ['left', 'left', 'down', 'down', 'up', 'up', 'right', 'right'],
  );
});
test('keydown fires once; key repeat ignored; preventDefault stops page scroll', () => {
  const { hb, log } = makeHitbox();
  const e1 = key('keydown', 'ArrowDown');
  window.dispatchEvent(e1);
  window.dispatchEvent(key('keydown', 'ArrowDown', { repeat: true }));
  window.dispatchEvent(key('keydown', 'ArrowDown', { repeat: true }));
  assert.deepEqual(log, ['down:down']);
  assert.equal(e1.defaultPrevented, true);
  window.dispatchEvent(key('keyup', 'ArrowDown'));
  assert.deepEqual(log, ['down:down', 'up:down']);
  hb.dispose();
});
test('arrow + WASD on the same lane: no double trigger, released only when both are up', () => {
  const { hb, log } = makeHitbox();
  window.dispatchEvent(key('keydown', 'ArrowLeft'));
  window.dispatchEvent(key('keydown', 'KeyA'));
  window.dispatchEvent(key('keyup', 'ArrowLeft'));
  assert.deepEqual(log, ['down:left']);
  window.dispatchEvent(key('keyup', 'KeyA'));
  assert.deepEqual(log, ['down:left', 'up:left']);
  hb.dispose();
});
test('window blur releases every held input (nothing stuck)', () => {
  const { hb, log } = makeHitbox();
  window.dispatchEvent(key('keydown', 'KeyW'));
  window.dispatchEvent(key('keydown', 'KeyD'));
  window.dispatchEvent(new Event('blur'));
  assert.deepEqual(log.slice(2).sort(), ['up:right', 'up:up']);
  window.dispatchEvent(key('keyup', 'KeyW')); // late keyup must not double-release
  assert.equal(log.length, 4);
  hb.dispose();
});
test('hidden tab releases everything', () => {
  const { hb, log } = makeHitbox();
  window.dispatchEvent(key('keydown', 'ArrowUp'));
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  document.hidden = false;
  assert.deepEqual(log, ['down:up', 'up:up']);
  hb.dispose();
});
test('multi-touch: two fingers on two lanes at once, released independently', () => {
  const { hb, surface, log } = makeHitbox();
  surface.dispatchEvent(ptr('pointerdown', 1, 100, 300));
  surface.dispatchEvent(ptr('pointerdown', 2, 436, 300));
  assert.deepEqual(log, ['down:left', 'down:right']);
  surface.dispatchEvent(ptr('pointerup', 1, 100, 300));
  assert.deepEqual(log, ['down:left', 'down:right', 'up:left']);
  surface.dispatchEvent(ptr('pointercancel', 2, 436, 300));
  assert.deepEqual(log.slice(3), ['up:right']);
  hb.dispose();
});
test('four fingers on four lanes', () => {
  const { hb, surface, log } = makeHitbox();
  [100, 212, 324, 436].forEach((x, i) => surface.dispatchEvent(ptr('pointerdown', i + 1, x, 400)));
  assert.deepEqual(log, ['down:left', 'down:down', 'down:up', 'down:right']);
  hb.releaseAll();
  assert.equal(log.length, 8);
  hb.dispose();
});
test('sliding a finger between lanes releases the old and presses the new one', () => {
  const { hb, surface, log } = makeHitbox();
  surface.dispatchEvent(ptr('pointerdown', 7, 100, 300));
  surface.dispatchEvent(ptr('pointermove', 7, 212, 300));
  assert.deepEqual(log, ['down:left', 'up:left', 'down:down']);
  surface.dispatchEvent(ptr('pointermove', 7, 212, -200)); // above the box (top = -120): released
  assert.deepEqual(log.slice(3), ['up:down']);
  surface.dispatchEvent(ptr('pointerup', 7, 212, -200));
  assert.equal(log.length, 4);
  hb.dispose();
});
test('mouse move with no button held cannot leave a lane stuck', () => {
  const { hb, surface, log } = makeHitbox();
  surface.dispatchEvent(ptr('pointerdown', 1, 324, 300, { pointerType: 'mouse' }));
  surface.dispatchEvent(ptr('pointermove', 1, 324, 300, { pointerType: 'mouse', buttons: 0 }));
  assert.deepEqual(log, ['down:up', 'up:up']);
  hb.dispose();
});
test('touch outside every hitbox does nothing; hitbox extends far below the receptor', () => {
  const { hb, surface, log } = makeHitbox();
  surface.dispatchEvent(ptr('pointerdown', 1, 100, -300)); // above the box top (-120)
  assert.deepEqual(log, []);
  surface.dispatchEvent(ptr('pointerdown', 2, 1000, 400)); // far right of the strumline
  assert.deepEqual(log, []);
  surface.dispatchEvent(ptr('pointerdown', 3, 212, 790)); // near the bottom of the screen
  assert.deepEqual(log, ['down:down']);
  hb.dispose();
});
test('dispose() removes all listeners', () => {
  const { hb, surface, log } = makeHitbox();
  hb.dispose();
  window.dispatchEvent(key('keydown', 'ArrowLeft'));
  surface.dispatchEvent(ptr('pointerdown', 1, 100, 300));
  assert.deepEqual(log, []);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);
