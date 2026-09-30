// The portrait renderer (ADR-0008): draws the poster, then the video clips, as brand dots on one transparent
// 2D <canvas>. Ported from the round-2 prototypes (portrait-video/portrait.js for the video, a-final's
// portrait-still.js for the slot, halo, tokens and setGrid). No dependencies.
//
// Mount contract: the canvas's parent is the layout slot; CSS sizes the canvas to the slot plus a halo margin
// on every side, with pointer-events: none. The poster is drawn at once (no request); the clips, when given
// and allowed (no reduced motion, no Save-Data), load after the page's `load` event, once the browser is idle.
// The greeting plays once per session on arrival, then the loop; resting the pointer on the portrait greets
// again at most every 20 s. Off-screen or in a hidden tab the video pauses and drawing stops.
//
// Cost (in Lighthouse's software-rendered canvas, rasterising the dots is most of a frame): each dot is filled
// on its own path, which the canvas rasterises as an oval, faster than one path of many arcs (1.6x in a
// micro-benchmark). While nothing moves, a new picture (the poster, a video frame) is painted band by band,
// only where levels changed and within a budget of dots per animation frame (bands.ts), so no frame is a long
// task; a video frame is sampled only once the previous one is fully painted, so a slow device lowers the
// frame rate instead of blocking the page. The frame loop reads no layout: the canvas position is kept from
// the last build.

import { anyDirty, bandRange, BAND_PX, markChanged, planBands, takeBands, type Bands } from "./bands.ts";
import { fills, parseColor, DEFAULT_RGB, STEPS, type RGB } from "./colors.ts";
import { clipType, plan, readEnvironment } from "./gating.ts";
import {
  blur, cellX, cellY, clamp01, easeInOut, gridCell, haloRadius, haloStrength, homeX, homeY,
  introDelays, layout, scrollBack, type Layout,
} from "./grid.ts";
import { PUSH_PX, PUSH_R, SETTLE_PX, springStep } from "./push.ts";
import { band, decodePoster, dotRadius, levelTable, lumaHistogram, luma, MAX_LEVEL } from "./levels.ts";
import type { Clip, GridDotOwner, PortraitController, PortraitOptions } from "./types.ts";

const INTRO = 1200, EACH = 620, BACK = 600, FADE = 300, NP = 4 * (STEPS + 1), TAU = 2 * Math.PI;
const TOKENS = ["--pui-bg-emphasis", "--pui-border", "--pui-muted", "--pui-text"] as const;
const KEY = "portrait-greeted";

type Name = "loop" | "greet";

export function mountPortrait(canvas: HTMLCanvasElement, o: PortraitOptions): PortraitController {
  const G = o.gridPx ?? 28, SUB = o.subdiv ?? 5, S = G / SUB, FACE = o.face ?? { x: 0.5, y: 0.3 };
  const GAP = 1000 / (o.fps ?? 15) - 3, EVERY = o.greetEvery ?? 20000;
  const env = readEnvironment(window);
  if (o.reducedMotion != null) env.reducedMotion = o.reducedMotion;
  if (o.saveData != null) env.saveData = o.saveData;
  const PLAN = plan(env, { loop: o.loop ?? null, greet: o.greet ?? null }), RM = !PLAN.motion;
  const slot = canvas.parentElement ?? canvas, ctx = canvas.getContext("2d");
  const COLS = o.poster.cols, ROWS = o.poster.rows, NC = COLS * ROWS;
  const poster = decodePoster(o.poster), cur = new Uint8Array(NC), blended = new Uint8Array(NC);
  const RAD = Float32Array.from({ length: MAX_LEVEL + 1 }, (_, v) => dotRadius(v, S));
  const BAND = Uint8Array.from({ length: MAX_LEVEL + 1 }, (_, v) => band(v));
  const offscreen = document.createElement("canvas");
  offscreen.width = COLS;
  offscreen.height = ROWS;
  const octx = offscreen.getContext("2d", { willReadFrequently: true });
  // A band is painted here without a clip (a clip changes how the canvas anti-aliases the dots it cuts), then
  // its rows are copied to the canvas, so a band repaint gives the same pixels as a whole-canvas paint.
  const strip = document.createElement("canvas"), sctx = strip.getContext("2d");
  const cleanups: Array<() => void> = [], vids: Partial<Record<Name, HTMLVideoElement>> = {};
  const on = (t: EventTarget, e: string, f: EventListener, p?: AddEventListenerOptions) => {
    t.addEventListener(e, f, p);
    cleanups.push(() => t.removeEventListener(e, f, p));
  };

  // Layout and particles (rebuilt on resize). Portrait particles first (np of them), then halo particles.
  let Lay: Layout | null = null, W = 0, H = 0, slotTop = 0, slotH = 0, n = 0, np = 0;
  let cell = new Int32Array(0), hx = new Float32Array(0), hy = new Float32Array(0), fx = new Float32Array(0), fy = new Float32Array(0);
  let rf = new Float32Array(0), hb = new Uint8Array(0), mid = new Int32Array(0), delay: Float32Array = new Float32Array(0);
  let ox = new Float32Array(0), oy = new Float32Array(0), box = [0, 0, 0, 0], FILLS: string[] = [];
  // Canvas position in the page (read in build, so the frame loop reads no layout) and backing-store scale.
  let cvLeft = 0, cvTop = 0, dpr = 1;
  // Dots of the frame being painted (x, y, radius, fill index), and their order by fill.
  let DX = new Float32Array(0), DY = new Float32Array(0), DR = new Float32Array(0), DJ = new Uint8Array(0), ORD = new Int32Array(0);
  const CNT = new Int32Array(NP + 1);
  // Banded painting while nothing moves: the bands, each cell's band range, the dirty flags, the levels on
  // the canvas, and where the next sweep starts. `still` is true when the canvas shows the picture at rest.
  let bands: Bands = planBands([], 0, 0), bandLo = new Int16Array(NC).fill(-1), bandHi = new Int16Array(NC).fill(-1);
  let bdirty = new Uint8Array(1), cursor = 0, still = false, moving = false, blank = true, pad = 0;
  // Each band's columns in device px (where its dots can paint), so a repaint clears and copies no more.
  let bx0 = new Int32Array(1), bx1 = new Int32Array(1);
  const drawnLv = new Uint8Array(NC);
  // The grid dots this canvas draws and moves itself, for the background dots (ownsGridDot): the halo dots
  // (one flag per grid dot of the canvas) and, in canvas px, the part of the canvas no ancestor clips away.
  let haloAt = new Uint8Array(0), shownBox = [0, 0, 0, 0];
  // State.
  let shown: Uint8Array = poster, prev: Uint8Array = poster, lut: Uint8Array | null = null;
  let raf = 0, last = 0, dirty = true, dead = false, vis = true, rt = 0, dwell = 0;
  let introStart = -1, introDone = RM || o.intro === false, ptr: { x: number; y: number } | null = null;
  let ready = false, started = false, active: HTMLVideoElement | null = null, sampledAt = 0, lastT = -1;
  let fadeT = -1, fadeMs = 0, fadeArm = 0, greetAt = -1e9, gridFrom = 0, gridTo = 0, gridT = 0;

  if (!ctx || !octx || !sctx) return { setGrid() {}, refresh() {}, destroy() {} };

  function palette() {
    const rgb = TOKENS.map((_, i) => {
      canvas.style.color = `var(${o.tokens?.[i] ?? TOKENS[i]})`;
      return parseColor(getComputedStyle(canvas).color) ?? DEFAULT_RGB[i]!;
    }) as unknown as [RGB, RGB, RGB, RGB];
    canvas.style.color = "";
    FILLS = fills(rgb[0], [rgb[1], rgb[2], rgb[3]]);
  }

  function build() {
    const cr = canvas.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    W = cr.width;
    H = cr.height;
    slotTop = sr.top + scrollY;
    slotH = sr.height;
    const L = (Lay = layout({
      canvas: { left: cr.left + scrollX, top: cr.top + scrollY, width: W, height: H },
      slot: { left: sr.left + scrollX, top: slotTop, width: sr.width, height: sr.height },
      cols: COLS, rows: ROWS, gridPx: G, subdiv: SUB, face: FACE,
    }));
    cvLeft = cr.left + scrollX;
    cvTop = cr.top + scrollY;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Portrait cells inside the slot. Any of them may light up in a video frame, so all are kept.
    // Typed arrays sized for the most particles there can be, trimmed at the end (no per-particle allocation).
    const cap = NC + L.NX * L.NY, halo = L.NX * L.NY;
    const A = {
      cell: new Int32Array(NC), hx: new Float32Array(cap), hy: new Float32Array(cap), fx: new Float32Array(cap), fy: new Float32Array(cap),
      rf: new Float32Array(halo), hb: new Uint8Array(halo), mid: new Int32Array(halo),
    };
    let q = 0;
    const mass = new Float32Array(L.NX * L.NY), midOf = new Int32Array(L.NX * L.NY).fill(-1);
    const s = L.slot;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const x = cellX(L, c), y = cellY(L, r);
        if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
        const i = r * COLS + c, h0 = homeX(L, c), h1 = homeY(L, r), k = gridCell(L, h0, h1);
        if (k >= 0) {
          mass[k]! += poster[i]! / MAX_LEVEL / (SUB * SUB);
          if (c % SUB === SUB >> 1 && r % SUB === SUB >> 1) midOf[k] = i;
        }
        A.cell[q] = i; A.hx[q] = h0; A.hy[q] = h1; A.fx[q] = x; A.fy[q++] = y;
      }
    np = q;
    // The halo: grid dots near the portrait grow and lighten with its blurred mass.
    const b = blur(mass, L.NX, L.NY);
    haloAt = new Uint8Array(L.NX * L.NY);
    for (let j = 0; j < L.NY; j++)
      for (let i = 0; i < L.NX; i++) {
        const k = j * L.NX + i, h = haloStrength(b[k]!);
        if (!h) continue;
        haloAt[k] = 1;
        const x = L.gx0 + i * L.G, y = L.gy0 + j * L.G;
        const e = q - np;
        A.hx[q] = A.fx[q] = x; A.hy[q] = A.fy[q++] = y;
        A.rf[e] = haloRadius(h); A.hb[e] = h > 0.4 ? 1 : 0; A.mid[e] = midOf[k]!;
      }
    n = q;
    cell = A.cell.slice(0, np);
    hx = A.hx.slice(0, n); hy = A.hy.slice(0, n); fx = A.fx.slice(0, n); fy = A.fy.slice(0, n);
    rf = A.rf.slice(0, n - np); hb = A.hb.slice(0, n - np); mid = A.mid.slice(0, n - np);
    ox = new Float32Array(n); oy = new Float32Array(n);
    if (!introDone) delay = introDelays(fx, fy, L.X + FACE.x * COLS * S, L.Y + FACE.y * ROWS * S, INTRO - EACH - 60);
    box = [Math.max(L.X, s.x0), Math.max(L.Y, s.y0), Math.min(L.X + COLS * S, s.x1), Math.min(L.Y + ROWS * S, s.y1)];
    // An ancestor that clips (the band clips the halo sideways) hides the halo dots outside it: the page's own
    // grid dots show there, and the background dots move them.
    shownBox = [0, 0, W, H];
    for (let e = canvas.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (cs.overflowX !== "visible") { shownBox[0] = Math.max(shownBox[0]!, r.left - cr.left); shownBox[2] = Math.min(shownBox[2]!, r.right - cr.left); }
      if (cs.overflowY !== "visible") { shownBox[1] = Math.max(shownBox[1]!, r.top - cr.top); shownBox[3] = Math.min(shownBox[3]!, r.bottom - cr.top); }
    }
    DX = new Float32Array(n); DY = new Float32Array(n); DR = new Float32Array(n); DJ = new Uint8Array(n); ORD = new Int32Array(n);
    // A dot paints up to its radius plus the anti-aliased edge (and the band's rounding to device pixels).
    let maxR = RAD[MAX_LEVEL]!;
    for (let h = 0; h < n - np; h++) maxR = Math.max(maxR, rf[h]!);
    const margin = maxR + 2 / dpr;
    bands = planBands(fy, H, margin);
    pad = Math.ceil(margin * dpr) + 1;
    strip.width = canvas.width;
    strip.height = Math.ceil(BAND_PX * dpr) + 1 + 2 * pad;
    bdirty = new Uint8Array(bands.count).fill(1);
    bx0 = new Int32Array(bands.count);
    bx1 = new Int32Array(bands.count);
    for (let k = 0; k < bands.count; k++) {
      let a = Infinity, z = -Infinity;
      for (let j = bands.start[k]!; j < bands.end[k]!; j++) {
        const x = fx[bands.order[j]!]!;
        if (x < a) a = x;
        if (x > z) z = x;
      }
      bx0[k] = Math.max(0, Math.floor((a - margin) * dpr));
      bx1[k] = Math.min(canvas.width, Math.ceil((z + margin) * dpr));
    }
    bandLo.fill(-1);
    bandHi.fill(-1);
    for (let i = 0; i < n; i++) {
      const c = i < np ? cell[i]! : mid[i - np]!;
      if (c < 0) continue;
      const [lo, hi] = bandRange(fy[i]!, margin, bands.count);
      bandLo[c] = lo;
      bandHi[c] = hi;
    }
    cursor = 0;
    still = moving = false;
    blank = true; // setting the canvas size cleared it
  }

  /** Fills dots 0..m-1 of DX/DY/DR/DJ on `c`, grouped by fill (counting sort), each dot on its own path. */
  function paint(c: CanvasRenderingContext2D, m: number) {
    CNT.fill(0);
    for (let k = 0; k < m; k++) CNT[DJ[k]! + 1]!++;
    for (let j = 0; j < NP; j++) CNT[j + 1]! += CNT[j]!;
    for (let k = 0; k < m; k++) ORD[CNT[DJ[k]!]!++] = k;
    // CNT[j] is now the end of fill j's run; its start is the end of the run before it.
    for (let j = 0, a = 0; j < NP; j++) {
      const z = CNT[j]!;
      if (z > a) {
        c.fillStyle = FILLS[j]!;
        for (let k = a; k < z; k++) {
          const d = ORD[k]!;
          c.beginPath();
          c.arc(DX[d]!, DY[d]!, DR[d]!, 0, TAU);
          c.fill();
        }
      }
      a = z;
    }
  }

  /** Repaints band b at rest (every dot in place, full size): its device-pixel rows, through the strip. */
  function paintBand(b: number) {
    const y0 = Math.min(canvas.height, Math.round(b * BAND_PX * dpr));
    const y1 = Math.min(canvas.height, Math.round((b + 1) * BAND_PX * dpr)), x0 = bx0[b]!, cw = bx1[b]! - x0;
    if (y1 <= y0 || cw <= 0) return;
    let m = 0;
    for (let k = bands.start[b]!, end = bands.end[b]!; k < end; k++) {
      const i = bands.order[k]!;
      if (i < np) {
        const v = shown[cell[i]!]!;
        if (!v) continue;
        DR[m] = RAD[v]!;
        DJ[m] = BAND[v]! * (STEPS + 1) + STEPS;
      } else {
        const h = i - np, c = mid[h]!;
        if (c >= 0 && shown[c]) continue; // the portrait already has a dot here
        DR[m] = rf[h]!;
        DJ[m] = hb[h] ? STEPS + 1 + STEPS : 0;
      }
      DX[m] = fx[i]!;
      DY[m] = fy[i]!;
      m++;
    }
    // The strip's row `pad` is the canvas row y0: an integer shift, so every dot keeps its sub-pixel position.
    sctx!.setTransform(1, 0, 0, 1, 0, 0);
    sctx!.clearRect(x0, 0, cw, strip.height);
    sctx!.setTransform(dpr, 0, 0, dpr, 0, pad - y0);
    paint(sctx!, m);
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(x0, y0, cw, y1 - y0);
    ctx!.drawImage(strip, x0, pad, cw, y1 - y0, x0, y0, cw, y1 - y0);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function gridAmount(now: number): number {
    if (gridFrom === gridTo) return gridTo;
    const p = RM ? 1 : clamp01((now - gridT) / BACK);
    if (p >= 1) return (gridFrom = gridTo);
    return gridFrom + (gridTo - gridFrom) * easeInOut(p);
  }

  /**
   * One animation frame. At rest (intro over, portrait in place, no pointer near, no dot displaced) it paints
   * the dirty bands within the budget; otherwise, or with `full`, the whole canvas. Returns true while more
   * frames are needed.
   */
  function draw(now: number, dt: number, full = false): boolean {
    const top = cvTop - scrollY, left = cvLeft - scrollX;
    if (!Lay || top + H < 0 || top > innerHeight) return false;
    const t = introStart < 0 ? 0 : now - introStart;
    if (!introDone && introStart >= 0 && t > INTRO) { introDone = true; start(); }
    const back = RM ? 0 : scrollBack(scrollY, slotTop, slotH), g = gridAmount(now), away = Math.max(back, g);
    let p = RM || !ptr ? null : { x: ptr.x - left, y: ptr.y - top };
    // A pointer farther than the push radius from the canvas moves no dot.
    if (p && (p.x < -PUSH_R || p.y < -PUSH_R || p.x > W + PUSH_R || p.y > H + PUSH_R)) p = null;
    const k = springStep(dt);
    let busy = !introDone || g !== gridTo || (back > 0 && back < 1);
    if (fadeT >= 0) {
      const f = clamp01((now - fadeT) / fadeMs);
      for (let i = 0; i < NC; i++) blended[i] = prev[i]! + (cur[i]! - prev[i]!) * f + 0.5;
      shown = blended;
      busy = true;
      if (f >= 1) { fadeT = -1; shown = cur; }
    }
    const rest = introDone && away === 0 && !p && !moving;
    // Bands paint over the picture at rest, or over a canvas the last build cleared. After motion, one whole
    // paint puts every dot back in place first.
    if (rest && !full && (still || blank)) {
      if (!still) bdirty.fill(1);
      still = true;
      markChanged(drawnLv, shown, bandLo, bandHi, bdirty);
      const pick = takeBands(bdirty, bands, cursor);
      cursor = pick.cursor;
      for (const b of pick.take) paintBand(b);
      return busy || anyDirty(bdirty);
    }
    if (rest) { // nothing moves any more: drop what is left of the displacements
      ox.fill(0);
      oy.fill(0);
    }
    let m = 0, displaced = false;
    // The hot loop: about 10k particles per frame, so no allocation and no calls it can avoid. A dark
    // portrait cell at rest is skipped before any maths; easing and the pointer push are inlined
    // (grid.ts has the same maths as pure, tested functions: easeOut, pointerPush).
    const intro = !introDone && introStart >= 0, before = !introDone && introStart < 0, cap = 1 - away;
    const px = p ? p.x : 0, py = p ? p.y : 0, R2 = PUSH_R * PUSH_R;
    for (let i = 0; i < n; i++) {
      const port = i < np, v = port ? shown[cell[i]!]! : 0;
      let dx0 = ox[i]!, dy0 = oy[i]!;
      if (port) {
        if (!v && !p && !dx0 && !dy0) continue;
      } else {
        const m = mid[i - np]!;
        if (m >= 0 && shown[m]) continue; // the portrait already has a dot here
      }
      let e = 1;
      if (intro) {
        let q = (t - delay[i]!) / EACH;
        q = q < 0 ? 0 : q > 1 ? 1 : q;
        const u = 1 - q;
        e = 1 - u * u * u;
      } else if (before) e = 0;
      if (e > cap) e = cap;
      const bx = hx[i]! + (fx[i]! - hx[i]!) * e, by = hy[i]! + (fy[i]! - hy[i]!) * e;
      if (p || dx0 || dy0) {
        let tx = 0, ty = 0;
        if (p) {
          const dx = bx - px, dy = by - py, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 0.01, w = 1 - d / PUSH_R, f = (w * w * PUSH_PX) / d;
            tx = dx * f;
            ty = dy * f;
          }
        }
        dx0 += (tx - dx0) * k;
        dy0 += (ty - dy0) * k;
        if (Math.abs(tx - dx0) > SETTLE_PX || Math.abs(ty - dy0) > SETTLE_PX) busy = true;
        else if (!p) dx0 = dy0 = 0;
        ox[i] = dx0;
        oy[i] = dy0;
        if (dx0 || dy0) displaced = true;
      }
      let rad: number, b: number;
      if (port) {
        if (!v) continue;
        rad = 0.7 + (RAD[v]! - 0.7) * e;
        b = BAND[v]!;
      } else {
        if (e <= 0 && !dx0 && !dy0) continue; // at rest a halo dot is the page's own grid dot
        const h = i - np;
        rad = 0.7 + (rf[h]! - 0.7) * e;
        b = hb[h]!;
      }
      DJ[m] = b ? b * (STEPS + 1) + ((e * STEPS + 0.5) | 0) : 0;
      DX[m] = bx + dx0;
      DY[m] = by + dy0;
      DR[m++] = rad;
    }
    ctx!.clearRect(0, 0, W, H);
    paint(ctx!, m);
    // The canvas now shows `shown`; it is the picture at rest only when this frame was.
    moving = displaced;
    still = rest;
    blank = false;
    drawnLv.set(shown);
    bdirty.fill(0);
    return busy;
  }

  function sample(v: HTMLVideoElement) {
    const vw = v.videoWidth, vh = v.videoHeight, a = COLS / ROWS;
    if (!vw || !vh) return;
    let sw = vw, sh = vh; // cover-crop the frame to the poster's aspect
    if (vw / vh > a) sw = vh * a; else sh = vw / a;
    octx!.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, COLS, ROWS);
    const d = octx!.getImageData(0, 0, COLS, ROWS).data;
    if (!lut) lut = levelTable(lumaHistogram(d), o);
    if (fadeArm) { prev = shown.slice(); fadeT = performance.now(); fadeMs = fadeArm; fadeArm = 0; }
    for (let i = 0, j = 0; i < NC; i++, j += 4) cur[i] = lut[luma(d[j]!, d[j + 1]!, d[j + 2]!)]!;
    if (fadeT < 0) shown = cur;
  }

  function tick(now: number) {
    raf = 0;
    const v = active, playing = !!v && !v.paused && !v.ended;
    let fresh = false;
    // A new frame is sampled only once the last one is fully painted (no band left).
    if (v && playing && v.readyState >= 2 && now - sampledAt >= GAP && v.currentTime !== lastT && !anyDirty(bdirty)) {
      lastT = v.currentTime;
      sampledAt = now;
      sample(v);
      fresh = true;
    }
    if (fresh || dirty || fadeT >= 0) {
      dirty = draw(now, last ? Math.min(64, now - last) : 16);
      last = now;
    }
    if (dirty || fadeT >= 0 || (playing && vis && !document.hidden)) raf = requestAnimationFrame(tick);
    else last = 0;
  }

  function kick() {
    dirty = true;
    if (!raf && !dead) raf = requestAnimationFrame(tick);
  }

  function video(src: Clip): HTMLVideoElement {
    const v = document.createElement("video");
    v.muted = v.defaultMuted = v.playsInline = true;
    v.preload = "none";
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-hidden", "true");
    v.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
    for (const u of src) {
      const s = document.createElement("source"), type = clipType(u);
      s.src = u;
      if (type) s.type = type;
      v.append(s);
    }
    slot.append(v);
    return v;
  }

  function sync() {
    if (!active || active.ended) return;
    if (vis && !document.hidden) active.play().catch(() => {});
    else active.pause();
    kick();
  }

  function play(name: Name, fade: number) {
    const v = vids[name];
    if (!v || dead) return;
    if (active && active !== v) active.pause();
    for (const x of Object.values(vids)) x.preload = "auto";
    active = v;
    lastT = -1;
    fadeArm = fade;
    v.currentTime = 0;
    sync();
  }

  function start() { // after the intro and once the clips may load: greet once per session, then loop
    if (!ready || !introDone || started) return;
    started = true;
    let first = false;
    try { first = !sessionStorage.getItem(KEY); sessionStorage.setItem(KEY, "1"); } catch { /* storage blocked */ }
    if (first && vids.greet) { greetAt = performance.now(); play("greet", FADE); }
    else play("loop", FADE);
  }

  function greet() {
    const now = performance.now();
    if (!started || !vids.greet || active === vids.greet || now - greetAt < EVERY) return;
    greetAt = now;
    play("greet", FADE);
  }

  /** Whether this canvas draws and moves the grid dot at page (x, y): inside the portrait, or a shown halo dot. */
  function ownsGridDot(x: number, y: number): boolean {
    if (!Lay || dead) return false;
    const cx = x - cvLeft, cy = y - cvTop;
    if (cx >= box[0]! && cx <= box[2]! && cy >= box[1]! && cy <= box[3]!) return true;
    if (cx < shownBox[0]! || cx > shownBox[2]! || cy < shownBox[1]! || cy > shownBox[3]!) return false;
    const k = gridCell(Lay, cx, cy);
    return k >= 0 && haloAt[k] === 1;
  }
  const owner: GridDotOwner = canvas;
  owner.ownsGridDot = ownsGridDot;
  canvas.setAttribute("data-grid-owner", "");

  const io = new IntersectionObserver((es) => {
    const e = es[es.length - 1];
    if (!e) return;
    vis = e.isIntersecting;
    if (e.intersectionRatio >= 0.2 && introStart < 0 && !introDone) { introStart = performance.now(); kick(); }
    sync();
  }, { threshold: [0, 0.2] });

  if (PLAN.video) {
    const clips = PLAN.video;
    const go = () => {
      if (dead) return;
      vids.loop = video(clips.loop);
      vids.loop.loop = true;
      if (clips.greet) {
        const g = (vids.greet = video(clips.greet));
        g.onended = () => play("loop", 0); // the greeting ends on the loop's first frame: no fade
      }
      ready = true;
      start();
    };
    const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 1200));
    if (document.readyState === "complete") idle();
    else on(window, "load", idle, { once: true });
    on(document, "visibilitychange", sync);
  }

  if (!RM) {
    const leave = () => { ptr = null; clearTimeout(dwell); dwell = 0; kick(); };
    const move = (ev: Event) => {
      const e = ev as PointerEvent;
      ptr = { x: e.clientX, y: e.clientY };
      kick();
      const x = e.clientX - (cvLeft - scrollX), y = e.clientY - (cvTop - scrollY);
      const inside = x >= box[0]! && x <= box[2]! && y >= box[1]! && y <= box[3]!;
      if (!inside) { clearTimeout(dwell); dwell = 0; }
      else if (e.type === "pointerdown" && e.pointerType !== "mouse") greet();
      else if (!dwell) dwell = window.setTimeout(greet, 600);
    };
    on(window, "pointermove", move, { passive: true });
    on(window, "pointerdown", move, { passive: true });
    on(window, "pointerup", (e) => { if ((e as PointerEvent).pointerType !== "mouse") leave(); }, { passive: true });
    on(window, "pointercancel", leave, { passive: true });
    on(document.documentElement, "mouseleave", leave);
    on(window, "scroll", kick, { passive: true });
  }

  const refresh = () => {
    if (dead) return;
    palette();
    build();
    built = where();
    last = 0;
    if (draw(performance.now(), 16)) kick(); // the first bands now; more frames while bands remain or dots move
  };
  // Layout signature of the last build, in page coordinates: a resize or font swap that moves nothing
  // (the ResizeObserver's first call, usually) costs no rebuild and no redraw.
  let built = "";
  const where = () => {
    const c = canvas.getBoundingClientRect(), s = slot.getBoundingClientRect();
    return [c.left + scrollX, c.top + scrollY, c.width, c.height, s.left + scrollX, s.top + scrollY, s.width, s.height, devicePixelRatio].join();
  };
  const relayout = () => {
    const now = where();
    if (now !== built) refresh();
  };
  const later = () => { clearTimeout(rt); rt = window.setTimeout(relayout, 120); };
  const ro = new ResizeObserver(later);
  ro.observe(slot);
  on(window, "resize", later);
  document.fonts?.ready.then(later, () => {});

  refresh();
  io.observe(canvas);

  return {
    setGrid(onGrid: boolean, instant = false) {
      const now = performance.now(), from = gridAmount(now);
      gridTo = onGrid ? 1 : 0;
      gridFrom = instant || RM ? gridTo : from;
      gridT = now;
      if (instant || RM) { last = 0; draw(now, 16, true); }
      kick();
    },
    refresh,
    destroy() {
      dead = true;
      delete owner.ownsGridDot;
      canvas.removeAttribute("data-grid-owner");
      cancelAnimationFrame(raf);
      clearTimeout(dwell);
      clearTimeout(rt);
      io.disconnect();
      ro.disconnect();
      cleanups.forEach((f) => f());
      for (const v of Object.values(vids)) {
        v.pause();
        v.textContent = "";
        v.load();
        v.remove();
      }
    },
  };
}
