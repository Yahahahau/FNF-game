// Original placeholder sprites, generated procedurally (no copyrighted files anywhere).
//
// The pack mirrors the *structure* of an official V-Slice note style so the rest of the engine
// only ever talks to "prefixes" and "animations":
//   strumline : static / press / confirm / confirmHold  per direction
//   splash    : 2 variants x 4 frames per direction
//   cover     : start / hold (loop) / end                per direction (one atlas per colour)
//   notes     : one head sprite per direction
//   sustains  : tileable body + terminal end cap         per direction
// Every sheet is packed and exported as a real Sparrow XML so it goes through the very same
// parser as user-provided packs. Replace it with your own pack via `?pack=<url>` (see README).
import { DIRECTIONS } from './constants.js';

export const COLORS = { left: '#C24B99', down: '#1BB9EA', up: '#22D437', right: '#F9393F' };
const COLOR_NAME = { left: 'Purple', down: 'Blue', up: 'Green', right: 'Red' };
const NAME = { left: 'Left', down: 'Down', up: 'Up', right: 'Right' };
const ANGLE = { left: 0, down: -Math.PI / 2, up: Math.PI / 2, right: Math.PI };
const OUTLINE = '#14141c';
const GRAY = '#aab4bd';

/** Resolution multipliers: frames are drawn at RES x so they stay crisp on hi-dpi screens. */
export const RES = { strumline: 2, notes: 2, sustains: 2, splash: 1.5, cover: 1 };

// ---------------------------------------------------------------------------------------------
// tiny colour helpers
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgb = (a) =>
  `#${a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => {
  const x = hex(a);
  const y = hex(b);
  return rgb(x.map((v, i) => v + (y[i] - v) * t));
};
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);
const alpha = (c, a) => `rgba(${hex(c).join(',')},${a})`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// drawing
function arrowPath(ctx) {
  const p = [[-64, 0], [-8, -58], [-8, -28], [60, -28], [60, 28], [-8, 28], [-8, 58]];
  ctx.beginPath();
  p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Draws a directional arrow centred on the current origin (design units, +-70). */
function drawArrow(ctx, dir, { fill, scale = 1, glow = 0, glowColor = '#fff' }) {
  ctx.save();
  ctx.rotate(ANGLE[dir]);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  arrowPath(ctx);
  if (glow) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = OUTLINE;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  arrowPath(ctx);
  const g = ctx.createLinearGradient(0, -58, 0, 58);
  g.addColorStop(0, lighten(fill, 0.3));
  g.addColorStop(0.55, fill);
  g.addColorStop(1, darken(fill, 0.14));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function strumFrames(dir) {
  const c = COLORS[dir];
  const N = NAME[dir];
  const out = [];
  const add = (prefix, i, draw) => out.push({ name: `${prefix}${String(i).padStart(4, '0')}`, w: 176, h: 176, draw: (ctx) => {
    ctx.translate(88, 88);
    draw(ctx);
  } });
  add(`static${N}`, 0, (ctx) => drawArrow(ctx, dir, { fill: GRAY, scale: 0.95 }));
  for (let f = 0; f < 4; f++) {
    const t = (f + 1) / 4;
    add(`press${N}`, f, (ctx) =>
      drawArrow(ctx, dir, { fill: mix(mix(GRAY, '#6b7780', t * 0.6), c, 0.3 * t), scale: 0.95 - 0.03 * t }));
  }
  const cs = [1.0, 1.06, 1.04, 1.02];
  const cg = [12, 12, 10, 8];
  const cl = [0.5, 0.25, 0.1, 0];
  for (let f = 0; f < 4; f++) {
    add(`confirm${N}`, f, (ctx) =>
      drawArrow(ctx, dir, { fill: lighten(c, cl[f]), scale: 0.95 * cs[f], glow: cg[f], glowColor: c }));
  }
  const hs = [1.03, 1.05, 1.03];
  for (let f = 0; f < 3; f++) {
    add(`confirmHold${N}`, f, (ctx) =>
      drawArrow(ctx, dir, { fill: lighten(c, 0.08), scale: 0.95 * hs[f], glow: 10, glowColor: c }));
  }
  return out;
}

function noteFrames(dir) {
  return [{ name: `note${NAME[dir]}0000`, w: 160, h: 160, draw: (ctx) => {
    ctx.translate(80, 80);
    drawArrow(ctx, dir, { fill: COLORS[dir], scale: 0.95 });
  } }];
}

function sustainFrames(dir) {
  const c = COLORS[dir];
  const N = NAME[dir];
  return [
    { name: `holdBody${N}0000`, w: 64, h: 64, draw: (ctx) => {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = c;
      ctx.fillRect(6, 0, 52, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillRect(22, 0, 20, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(6, 28, 52, 8);
    } },
    { name: `holdEnd${N}0000`, w: 64, h: 40, draw: (ctx) => {
      const path = (close) => {
        ctx.beginPath();
        ctx.moveTo(3, 40);
        ctx.lineTo(3, 32);
        ctx.arc(32, 32, 29, Math.PI, 0, false);
        ctx.lineTo(61, 40);
        if (close) ctx.closePath();
      };
      path(true);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillRect(22, 0, 20, 40);
      ctx.restore();
      path(false);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } },
  ];
}

function splashFrames(dir) {
  const c = COLORS[dir];
  const out = [];
  ['A', 'B'].forEach((v, vi) => {
    const prefix = `splash${COLOR_NAME[dir]}${v}`;
    for (let f = 0; f < 4; f++) {
      out.push({ name: `${prefix}${String(f).padStart(4, '0')}`, w: 240, h: 240, draw: (ctx) => {
        ctx.translate(120, 120);
        const rand = rng(DIRECTIONS.indexOf(dir) * 97 + vi * 13 + 7);
        ctx.lineCap = 'round';
        if (f === 0) {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(0.4, alpha(c, 0.7));
          g.addColorStop(1, alpha(c, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, 46, 0, Math.PI * 2);
          ctx.fill();
        }
        if (vi === 0) {
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + (rand() - 0.5) * 0.35;
            const r0 = 28 + f * 20 + rand() * 6;
            const r1 = r0 + 34 - f * 6;
            ctx.strokeStyle = alpha(i % 3 === 0 ? lighten(c, 0.35) : c, 1 - f * 0.22);
            ctx.lineWidth = 7 - f * 1.2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
            ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = alpha(c, 1 - f * 0.25);
          ctx.lineWidth = 10 - f * 2;
          ctx.beginPath();
          ctx.arc(0, 0, 36 + f * 22, 0, Math.PI * 2);
          ctx.stroke();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
            const r = 50 + f * 20 + rand() * 6;
            ctx.fillStyle = alpha(lighten(c, 0.2), 1 - f * 0.2);
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 7 - f * 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } });
    }
  });
  return out;
}

function coverFrames(dir) {
  const c = COLORS[dir];
  const C = COLOR_NAME[dir];
  const out = [];
  const add = (prefix, i, draw) => out.push({ name: `${prefix}${String(i).padStart(4, '0')}`, w: 220, h: 220, draw: (ctx) => {
    ctx.translate(110, 110);
    draw(ctx);
  } });
  const aura = (ctx, r, a) => {
    const g = ctx.createRadialGradient(0, 0, 8, 0, 0, r);
    g.addColorStop(0, alpha(lighten(c, 0.5), a));
    g.addColorStop(0.55, alpha(c, a * 0.75));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const ring = (ctx, r, w, a) => {
    ctx.strokeStyle = alpha(c, a);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  for (let f = 0; f < 5; f++) {
    add(`holdCoverStart${C}`, f, (ctx) => {
      aura(ctx, 50 + f * 8, 0.35 + f * 0.12);
      ring(ctx, 40 + f * 14, 8 - f * 1.2, 1 - f * 0.2);
    });
  }
  for (let f = 0; f < 4; f++) {
    add(`holdCover${C}`, f, (ctx) => {
      aura(ctx, 78 + 4 * Math.sin((f / 4) * Math.PI * 2), 0.8);
      for (let i = 0; i < 7; i++) {
        const t = (i / 7 + f / 4) % 1;
        const a = i * 0.9 + 0.3;
        const r = 40 + t * 46;
        ctx.fillStyle = alpha(lighten(c, 0.45), 1 - t);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r - t * 10, 1.5 + 5 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  for (let f = 0; f < 5; f++) {
    add(`holdCoverEnd${C}`, f, (ctx) => {
      aura(ctx, 70 - f * 6, 0.6 - f * 0.12);
      ring(ctx, 56 + f * 10, 10 - f * 1.8, 1 - f * 0.2);
      const rand = rng(f * 31 + DIRECTIONS.indexOf(dir));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rand() * 0.4;
        const r = 50 + f * 14 + rand() * 8;
        ctx.fillStyle = alpha(lighten(c, 0.3), 1 - f / 5);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, Math.max(1, 6 - f), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// packing + Sparrow XML export
function pack(frames, makeCanvas, res, width = 2048, pad = 2) {
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed = frames.map((f) => {
    const w = Math.ceil(f.w * res);
    const h = Math.ceil(f.h * res);
    if (x + w + pad > width) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    const p = { ...f, x, y, pw: w, ph: h };
    x += w + pad;
    rowH = Math.max(rowH, h);
    return p;
  });
  const height = y + rowH + pad;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  for (const f of placed) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.beginPath();
    ctx.rect(0, 0, f.pw, f.ph);
    ctx.clip();
    ctx.scale(res, res);
    f.draw(ctx);
    ctx.restore();
  }
  const xml =
    `<?xml version="1.0" encoding="utf-8"?>\n<TextureAtlas imagePath="placeholder.png">\n` +
    placed
      .map((f) => `  <SubTexture name="${f.name}" x="${f.x}" y="${f.y}" width="${f.pw}" height="${f.ph}"/>`)
      .join('\n') +
    '\n</TextureAtlas>\n';
  return { canvas, xml };
}

export function defaultMakeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const dirs = (fn) => DIRECTIONS.flatMap((d) => fn(d));

/** The style object follows the official `assets` layout (see README for the schema). */
export function buildPlaceholderStyle() {
  const perDir = (fn) => Object.fromEntries(DIRECTIONS.map((d) => [d, fn(d)]));
  const strumData = {};
  for (const d of DIRECTIONS) {
    const N = NAME[d];
    strumData[`${d}Static`] = { prefix: `static${N}`, frameRate: 24 };
    strumData[`${d}Press`] = { prefix: `press${N}`, frameRate: 24 };
    strumData[`${d}Confirm`] = { prefix: `confirm${N}`, frameRate: 24 };
    strumData[`${d}ConfirmHold`] = { prefix: `confirmHold${N}`, frameRate: 24 };
  }
  const splashData = { enabled: true, framerateDefault: 24, framerateVariance: 2 };
  for (const d of DIRECTIONS) {
    splashData[`${d}Splashes`] = [{ prefix: `splash${COLOR_NAME[d]}A` }, { prefix: `splash${COLOR_NAME[d]}B` }];
  }
  return {
    name: 'Original placeholder',
    assets: {
      note: {
        assetPath: 'placeholder:notes',
        scale: 0.7 / RES.notes,
        data: perDir((d) => ({ prefix: `note${NAME[d]}` })),
      },
      holdNote: {
        assetPath: 'placeholder:sustains',
        scale: 0.7 / RES.sustains,
        data: perDir((d) => ({ body: { prefix: `holdBody${NAME[d]}` }, end: { prefix: `holdEnd${NAME[d]}` } })),
      },
      noteStrumline: {
        assetPath: 'placeholder:strumline',
        scale: 0.7 / RES.strumline,
        offsets: [0, 0],
        data: strumData,
      },
      noteSplash: {
        assetPath: 'placeholder:splash',
        scale: 1 / RES.splash,
        alpha: 0.95,
        offsets: [0, 0],
        data: splashData,
      },
      holdNoteCover: {
        scale: 1 / RES.cover,
        offsets: [0, 0],
        data: {
          enabled: true,
          ...perDir((d) => ({
            assetPath: `placeholder:holdCover${COLOR_NAME[d]}`,
            start: { prefix: `holdCoverStart${COLOR_NAME[d]}`, frameRate: 24 },
            hold: { prefix: `holdCover${COLOR_NAME[d]}`, frameRate: 24 },
            end: { prefix: `holdCoverEnd${COLOR_NAME[d]}`, frameRate: 24 },
          })),
        },
      },
    },
  };
}

/** @returns {{style:object, sheets:Record<string,{canvas:any, xml:string}>}} */
export function buildPlaceholderPack(makeCanvas = defaultMakeCanvas) {
  const sheets = {
    'placeholder:strumline': pack(dirs(strumFrames), makeCanvas, RES.strumline),
    'placeholder:notes': pack(dirs(noteFrames), makeCanvas, RES.notes),
    'placeholder:sustains': pack(dirs(sustainFrames), makeCanvas, RES.sustains, 512),
    'placeholder:splash': pack(dirs(splashFrames), makeCanvas, RES.splash),
  };
  for (const d of DIRECTIONS) {
    sheets[`placeholder:holdCover${COLOR_NAME[d]}`] = pack(coverFrames(d), makeCanvas, RES.cover, 1024);
  }
  return { style: buildPlaceholderStyle(), sheets };
}
