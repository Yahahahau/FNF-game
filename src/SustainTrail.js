// Draws the long sustain of a hold note for one direction: a tiling body + a terminal end cap.
//
//   (top, future)    ┌─────┐  <- end cap, round end (yEnd .. yEnd + capH)
//                    │ cap │
//                    ├─────┤  <- body starts exactly where the cap ends
//                    │body │  <- repeated tile, anchored to the cap so it never "swims"
//                    │body │
//   (head, receptor) └─────┘  <- body ends at the head centre (hidden under the head sprite)
//
// The body is a CanvasPattern, so tiles join seamlessly at any scale and the tail is never
// stretched: only more tiles are added as the duration grows.

/** Pure geometry (unit-testable). All values in world units, y grows downward (downscroll). */
export function trailGeometry({ yHead, yEnd, capH }) {
  const bodyTop = yEnd + capH;
  return {
    capTop: yEnd,
    capBottom: yEnd + capH,
    bodyTop,
    bodyBottom: yHead,
    hasBody: yHead > bodyTop,
    length: yHead - yEnd,
  };
}

export class SustainTrail {
  /**
   * @param {{bodyCanvas:any, endCanvas:any}} skin tile + cap, already baked to standalone canvases
   * @param {number} scale world units per texel
   */
  constructor(skin, scale) {
    this.body = skin.bodyCanvas;
    this.cap = skin.endCanvas;
    this.scale = scale;
    this.width = this.body.width * scale;
    this.capH = this.cap.height * scale;
    this.pattern = null;
    this.patternCtx = null;
  }

  getPattern(ctx) {
    if (!this.pattern || this.patternCtx !== ctx) {
      this.pattern = ctx.createPattern(this.body, 'repeat');
      this.patternCtx = ctx;
    }
    return this.pattern;
  }

  /**
   * @param ctx 2D context (world transform already applied)
   * @param {{yHead:number,yEnd:number,clipBottom:number,alpha:number}} t from HoldNote.trailState
   * @param {number} cx lane centre x
   * @param {number} viewTop top of the visible playfield (skips what is above the screen)
   */
  draw(ctx, t, cx, viewTop) {
    const g = trailGeometry({ yHead: t.yHead, yEnd: t.yEnd, capH: this.capH });
    if (g.capTop > t.clipBottom) return; // fully consumed
    if (t.yHead < viewTop - 4) return; // entirely above the screen
    const xl = cx - this.width / 2;
    const k = this.scale;

    ctx.save();
    ctx.globalAlpha = t.alpha;
    if (t.clipBottom !== Infinity) {
      ctx.beginPath();
      ctx.rect(xl - 8, viewTop - 8, this.width + 16, t.clipBottom - viewTop + 8);
      ctx.clip();
    }

    if (g.hasBody) {
      const from = Math.max(g.bodyTop - 1, viewTop - 4); // 1px overlap with the cap: no seam
      ctx.translate(xl, g.bodyTop);
      ctx.scale(k, k);
      ctx.fillStyle = this.getPattern(ctx);
      // runs 6 units past the head centre so it is always hidden beneath the head sprite
      ctx.fillRect(0, (from - g.bodyTop) / k, this.body.width, (g.bodyBottom + 6 - from) / k);
    }
    ctx.restore();

    // cap drawn in a second pass so the body pattern transform never leaks into it
    ctx.save();
    ctx.globalAlpha = t.alpha;
    if (t.clipBottom !== Infinity) {
      ctx.beginPath();
      ctx.rect(xl - 8, viewTop - 8, this.width + 16, t.clipBottom - viewTop + 8);
      ctx.clip();
    }
    ctx.drawImage(this.cap, xl, g.capTop, this.width, this.capH);
    ctx.restore();
  }
}
