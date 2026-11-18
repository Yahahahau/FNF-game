// Sprite atlas loading + caching.
//
//  * Atlas formats: Sparrow/Starling XML (+PNG) and JSON hash atlases (TexturePacker style).
//  * The default pack is generated procedurally (original art, see PlaceholderAssets.js).
//  * A user pack can be loaded with `?pack=<folder url>`: the folder needs a `notestyle.json`
//    using the same schema as the placeholder style, plus the atlases it references.
//  * Anything missing or incomplete falls back, group by group, to the placeholder pack.
import { DIRECTIONS } from './constants.js';
import { buildPlaceholderPack, defaultMakeCanvas } from './PlaceholderAssets.js';

// ---------------------------------------------------------------------------------------------
// parsers (pure, also used by the Node tests)

/**
 * Minimal Sparrow/Starling XML parser. Returns frames in file order:
 * { name, x, y, w, h, frameX, frameY, frameW, frameH, rotated }.
 */
export function parseSparrow(xmlText) {
  const text = xmlText.replace(/^﻿/, '');
  const frames = [];
  const tagRe = /<SubTexture\b([^>]*?)\/?>/g;
  const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = tagRe.exec(text))) {
    const a = {};
    let am;
    attrRe.lastIndex = 0;
    while ((am = attrRe.exec(m[1]))) a[am[1]] = am[2];
    const w = +a.width;
    const h = +a.height;
    frames.push({
      name: a.name,
      x: +a.x,
      y: +a.y,
      w,
      h,
      frameX: +(a.frameX ?? 0),
      frameY: +(a.frameY ?? 0),
      frameW: +(a.frameWidth ?? w),
      frameH: +(a.frameHeight ?? h),
      rotated: a.rotated === 'true',
    });
  }
  return frames;
}

/** JSON hash/array atlas ({frames:{name:{frame:{x,y,w,h},rotated,spriteSourceSize,sourceSize}}}). */
export function parseJsonAtlas(json) {
  const raw = Array.isArray(json.frames)
    ? json.frames.map((f) => [f.filename ?? f.name, f])
    : Object.entries(json.frames ?? {});
  return raw.map(([name, f]) => {
    const fr = f.frame;
    const rotated = !!f.rotated;
    const w = rotated ? fr.h : fr.w; // un-rotated trimmed size
    const h = rotated ? fr.w : fr.h;
    const sss = f.spriteSourceSize ?? { x: 0, y: 0 };
    const src = f.sourceSize ?? { w, h };
    return {
      name: name.replace(/\.\w+$/, ''),
      x: fr.x,
      y: fr.y,
      w,
      h,
      frameX: -sss.x,
      frameY: -sss.y,
      frameW: src.w,
      frameH: src.h,
      rotated,
    };
  });
}

/**
 * Flixel `animation.addByPrefix`: every frame whose name starts with `prefix`,
 * ordered by name (numeric suffixes are zero padded).
 */
export function framesByPrefix(frames, prefix) {
  return frames
    .filter((f) => f.name.startsWith(prefix))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// ---------------------------------------------------------------------------------------------
// atlas

/** Rotated frames are stored turned 90° counter-clockwise; bake them upright once. */
function bakeRotated(img, f) {
  const c = defaultMakeCanvas(f.w, f.h);
  const ctx = c.getContext('2d');
  ctx.translate(f.w, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, f.x, f.y, f.h, f.w, 0, 0, f.h, f.w);
  return c;
}

export class Atlas {
  constructor(image, frames) {
    this.image = image;
    this.frames = frames.map((f) => {
      if (f.rotated) return { ...f, source: bakeRotated(image, f), sx: 0, sy: 0 };
      return { ...f, source: image, sx: f.x, sy: f.y };
    });
  }

  byPrefix(prefix) {
    return framesByPrefix(this.frames, prefix);
  }

  /** Copies one frame into its own canvas (needed for seamless CanvasPattern tiling). */
  frameCanvas(frame) {
    const c = defaultMakeCanvas(frame.w, frame.h);
    c.getContext('2d').drawImage(frame.source, frame.sx, frame.sy, frame.w, frame.h, 0, 0, frame.w, frame.h);
    return c;
  }
}

// ---------------------------------------------------------------------------------------------
// loading

const imageCache = new Map(); // url -> Promise<HTMLImageElement>

function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image ${url}`));
      img.src = url;
    }));
  }
  return imageCache.get(url);
}

/** "shared:noteStrumline" or "noteStrumline" -> `${base}/noteStrumline` (namespace is ignored). */
export function resolveAssetUrl(base, assetPath) {
  const name = assetPath.includes(':') ? assetPath.split(':')[1] : assetPath;
  return `${base.replace(/\/$/, '')}/${name}`;
}

async function loadExternalAtlas(base, assetPath) {
  const url = resolveAssetUrl(base, assetPath);
  const image = await loadImage(`${url}.png`);
  let res = await fetch(`${url}.xml`);
  if (res.ok) return new Atlas(image, parseSparrow(await res.text()));
  res = await fetch(`${url}.json`);
  if (res.ok) return new Atlas(image, parseJsonAtlas(await res.json()));
  throw new Error(`No .xml or .json atlas for ${assetPath}`);
}

function atlasFromSheet(sheet) {
  return new Atlas(sheet.canvas, parseSparrow(sheet.xml));
}

const has = (atlas, prefix) => !!atlas && !!prefix && atlas.byPrefix(prefix).length > 0;

/** Does `style` + its atlases contain every animation the engine needs? Returns missing prefixes. */
export function missingPrefixes(group, style, atlases) {
  const miss = [];
  const need = (atlas, prefix) => { if (!has(atlas, prefix)) miss.push(prefix ?? '(undefined)'); };
  try {
    if (group === 'noteStrumline') {
      for (const d of DIRECTIONS) {
        for (const k of ['Static', 'Press', 'Confirm', 'ConfirmHold']) need(atlases.strumline, style.data[`${d}${k}`]?.prefix);
      }
    } else if (group === 'noteSplash') {
      for (const d of DIRECTIONS) {
        const list = style.data[`${d}Splashes`];
        if (!list?.length) miss.push(`${d}Splashes`);
        else list.forEach((v) => need(atlases.splash, v.prefix));
      }
    } else if (group === 'note') {
      for (const d of DIRECTIONS) need(atlases.notes, style.data[d]?.prefix);
    } else if (group === 'holdNote') {
      for (const d of DIRECTIONS) {
        need(atlases.sustains, style.data[d]?.body?.prefix);
        need(atlases.sustains, style.data[d]?.end?.prefix);
      }
    } else if (group === 'holdNoteCover') {
      for (const d of DIRECTIONS) {
        const c = style.data[d];
        for (const k of ['start', 'hold', 'end']) need(atlases.covers?.[d], c?.[k]?.prefix);
      }
    }
  } catch (e) {
    miss.push(String(e));
  }
  return miss;
}

export class AssetLoader {
  constructor() {
    this.style = null; // merged `assets` block: note, holdNote, noteStrumline, noteSplash, holdNoteCover
    this.atlas = { strumline: null, splash: null, notes: null, sustains: null, covers: {} };
    this.source = 'placeholder';
    this.warnings = [];
  }

  /**
   * @param {{pack?: string|null, makeCanvas?: Function}} [opts]
   *   pack: base url of a user pack folder (optional). makeCanvas: injectable for tests.
   */
  async load({ pack = null, makeCanvas = defaultMakeCanvas } = {}) {
    const ph = buildPlaceholderPack(makeCanvas);
    const phStyle = ph.style.assets;
    const phAtlas = {
      strumline: atlasFromSheet(ph.sheets['placeholder:strumline']),
      splash: atlasFromSheet(ph.sheets['placeholder:splash']),
      notes: atlasFromSheet(ph.sheets['placeholder:notes']),
      sustains: atlasFromSheet(ph.sheets['placeholder:sustains']),
      covers: Object.fromEntries(
        DIRECTIONS.map((d) => [d, atlasFromSheet(ph.sheets[phStyle.holdNoteCover.data[d].assetPath])]),
      ),
    };

    // Start from the placeholder pack, then replace groups the user pack fully provides.
    this.style = { ...phStyle };
    this.atlas = { ...phAtlas, covers: { ...phAtlas.covers } };

    if (pack) await this.applyPack(pack);
    return this;
  }

  async applyPack(base) {
    let ext;
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/notestyle.json`);
      if (!res.ok) throw new Error(`notestyle.json -> HTTP ${res.status}`);
      ext = (await res.json()).assets;
      if (!ext) throw new Error('notestyle.json has no "assets" block');
    } catch (e) {
      this.warn(`User pack ignored: ${e.message}`);
      return;
    }

    const tryAtlas = async (path) => {
      try { return await loadExternalAtlas(base, path); } catch (e) { this.warn(e.message); return null; }
    };
    const apply = async (group, atlasKey, getAtlas, setAtlas) => {
      const style = ext[group];
      if (!style) return;
      const atlases = {};
      atlases[atlasKey] = await getAtlas(style);
      const miss = missingPrefixes(group, style, atlases);
      if (miss.length) {
        this.warn(`Pack group "${group}" incomplete (${miss.slice(0, 3).join(', ')}…) - using placeholder`);
        return;
      }
      this.style[group] = style;
      setAtlas(atlases[atlasKey]);
    };

    await apply('noteStrumline', 'strumline', (s) => tryAtlas(s.assetPath), (a) => (this.atlas.strumline = a));
    await apply('noteSplash', 'splash', (s) => tryAtlas(s.assetPath), (a) => (this.atlas.splash = a));
    await apply('note', 'notes', (s) => tryAtlas(s.assetPath), (a) => (this.atlas.notes = a));
    await apply('holdNote', 'sustains', (s) => tryAtlas(s.assetPath), (a) => (this.atlas.sustains = a));

    if (ext.holdNoteCover) {
      const covers = {};
      for (const d of DIRECTIONS) {
        const c = ext.holdNoteCover.data?.[d];
        covers[d] = c ? await tryAtlas(c.assetPath) : null;
      }
      const miss = missingPrefixes('holdNoteCover', ext.holdNoteCover, { covers });
      if (miss.length) this.warn('Pack group "holdNoteCover" incomplete - using placeholder');
      else {
        this.style.holdNoteCover = ext.holdNoteCover;
        this.atlas.covers = covers;
      }
    }
    this.source = base;
  }

  warn(msg) {
    this.warnings.push(msg);
    console.warn(`[assets] ${msg}`);
  }
}
