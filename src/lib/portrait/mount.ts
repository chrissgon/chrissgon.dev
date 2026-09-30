// The portrait renderer (ADR-0008): draws the poster, then the video clips, as brand dots on one transparent
// 2D <canvas>. Ported from the round-2 prototypes (portrait-video/portrait.js for the video, a-final's
// portrait-still.js for the slot, halo, tokens and setGrid). No dependencies.
//
// Mount contract: the canvas's parent is the layout slot; CSS sizes the canvas to the slot plus a halo margin
// on every side, with pointer-events: none. The poster is drawn at once (no request); the clips, when given
// and allowed (no reduced motion, no Save-Data), load after the page's `load` event, once the browser is idle.
// The greeting plays once per session on arrival, then the loop; resting the pointer on the portrait greets
// again at most every 20 s. Off-screen or in a hidden tab the video pauses and drawing stops.

import { fills, parseColor, DEFAULT_RGB, STEPS, type RGB } from "./colors.ts";
import { clipType, plan, readEnvironment } from "./gating.ts";
import {
  blur, cellX, cellY, clamp01, easeInOut, easeOut, gridCell, haloRadius, haloStrength, homeX, homeY,
  introDelays, layout, pointerPush, scrollBack, type Layout,
} from "./grid.ts";
import { band, decodePoster, dotRadius, levelTable, lumaHistogram, luma, MAX_LEVEL } from "./levels.ts";
import type { Clip, PortraitController, PortraitOptions } from "./types.ts";

const INTRO = 1200, EACH = 620, BACK = 600, FADE = 300, NP = 4 * (STEPS + 1);
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
  const RAD = Array.from({ length: MAX_LEVEL + 1 }, (_, v) => dotRadius(v, S));
  const offscreen = document.createElement("canvas");
  offscreen.width = COLS;
  offscreen.height = ROWS;
  const octx = offscreen.getContext("2d", { willReadFrequently: true });
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
  // State.
  let shown: Uint8Array = poster, prev: Uint8Array = poster, lut: Uint8Array | null = null;
  let raf = 0, last = 0, dirty = true, dead = false, vis = true, rt = 0, dwell = 0;
  let introStart = -1, introDone = RM || o.intro === false, ptr: { x: number; y: number } | null = null;
  let ready = false, started = false, active: HTMLVideoElement | null = null, sampledAt = 0, lastT = -1;
  let fadeT = -1, fadeMs = 0, fadeArm = 0, greetAt = -1e9, gridFrom = 0, gridTo = 0, gridT = 0;

  if (!ctx || !octx) return { setGrid() {}, refresh() {}, destroy() {} };

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
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Portrait cells inside the slot. Any of them may light up in a video frame, so all are kept.
    const A = { cell: [] as number[], hx: [] as number[], hy: [] as number[], fx: [] as number[], fy: [] as number[], rf: [] as number[], hb: [] as number[], mid: [] as number[] };
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
        A.cell.push(i); A.hx.push(h0); A.hy.push(h1); A.fx.push(x); A.fy.push(y);
      }
    np = A.cell.length;
    // The halo: grid dots near the portrait grow and lighten with its blurred mass.
    const b = blur(mass, L.NX, L.NY);
    for (let j = 0; j < L.NY; j++)
      for (let i = 0; i < L.NX; i++) {
        const k = j * L.NX + i, h = haloStrength(b[k]!);
        if (!h) continue;
        const x = L.gx0 + i * L.G, y = L.gy0 + j * L.G;
        A.hx.push(x); A.hy.push(y); A.fx.push(x); A.fy.push(y);
        A.rf.push(haloRadius(h)); A.hb.push(h > 0.4 ? 1 : 0); A.mid.push(midOf[k]!);
      }
    n = A.hx.length;
    cell = Int32Array.from(A.cell);
    hx = Float32Array.from(A.hx); hy = Float32Array.from(A.hy); fx = Float32Array.from(A.fx); fy = Float32Array.from(A.fy);
    rf = Float32Array.from(A.rf); hb = Uint8Array.from(A.hb); mid = Int32Array.from(A.mid);
    ox = new Float32Array(n); oy = new Float32Array(n);
    delay = introDelays(fx, fy, L.X + FACE.x * COLS * S, L.Y + FACE.y * ROWS * S, INTRO - EACH - 60);
    box = [Math.max(L.X, s.x0), Math.max(L.Y, s.y0), Math.min(L.X + COLS * S, s.x1), Math.min(L.Y + ROWS * S, s.y1)];
  }

  function gridAmount(now: number): number {
    if (gridFrom === gridTo) return gridTo;
    const p = RM ? 1 : clamp01((now - gridT) / BACK);
    if (p >= 1) return (gridFrom = gridTo);
    return gridFrom + (gridTo - gridFrom) * easeInOut(p);
  }

  function draw(now: number, dt: number): boolean {
    const rect = canvas.getBoundingClientRect();
    if (!Lay || rect.bottom < 0 || rect.top > innerHeight) return false;
    const t = introStart < 0 ? 0 : now - introStart;
    if (!introDone && introStart >= 0 && t > INTRO) { introDone = true; start(); }
    const back = RM ? 0 : scrollBack(scrollY, slotTop, slotH), g = gridAmount(now), away = Math.max(back, g);
    const p = RM || !ptr ? null : { x: ptr.x - rect.left, y: ptr.y - rect.top };
    const k = 1 - Math.exp(-dt / 105);
    let busy = !introDone || g !== gridTo || (back > 0 && back < 1);
    if (fadeT >= 0) {
      const f = clamp01((now - fadeT) / fadeMs);
      for (let i = 0; i < NC; i++) blended[i] = prev[i]! + (cur[i]! - prev[i]!) * f + 0.5;
      shown = blended;
      busy = true;
      if (f >= 1) { fadeT = -1; shown = cur; }
    }
    const paths: Array<Path2D | null> = new Array(NP).fill(null);
    for (let i = 0; i < n; i++) {
      let e = introDone ? 1 : introStart < 0 ? 0 : easeOut(clamp01((t - delay[i]!) / EACH));
      e = Math.min(e, 1 - away);
      const bx = hx[i]! + (fx[i]! - hx[i]!) * e, by = hy[i]! + (fy[i]! - hy[i]!) * e;
      if (p || ox[i] || oy[i]) {
        const [tx, ty] = p ? pointerPush(bx - p.x, by - p.y) : [0, 0];
        ox[i]! += (tx - ox[i]!) * k;
        oy[i]! += (ty - oy[i]!) * k;
        if (Math.abs(tx - ox[i]!) > 0.05 || Math.abs(ty - oy[i]!) > 0.05) busy = true;
        else if (!p) ox[i] = oy[i] = 0;
      }
      let rad: number, b: number;
      if (i < np) {
        const v = shown[cell[i]!]!;
        if (!v) continue;
        rad = 0.7 + (RAD[v]! - 0.7) * e;
        b = band(v);
      } else {
        const h = i - np, m = mid[h]!;
        if (m >= 0 && shown[m]) continue; // the portrait already has a dot here
        if (e <= 0 && !ox[i] && !oy[i]) continue; // at rest a halo dot is the page's own grid dot
        rad = 0.7 + (rf[h]! - 0.7) * e;
        b = hb[h]!;
      }
      const j = b * (STEPS + 1) + (b ? Math.round(e * STEPS) : 0), x = bx + ox[i]!, y = by + oy[i]!;
      const path = paths[j] ?? (paths[j] = new Path2D());
      path.moveTo(x + rad, y);
      path.arc(x, y, rad, 0, 6.2832);
    }
    ctx!.clearRect(0, 0, W, H);
    for (let j = 0; j < NP; j++) {
      const path = paths[j];
      if (path) { ctx!.fillStyle = FILLS[j]!; ctx!.fill(path); }
    }
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
    if (v && playing && v.readyState >= 2 && now - sampledAt >= GAP && v.currentTime !== lastT) {
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

  const io = new IntersectionObserver((es) => {
    const e = es[es.length - 1];
    if (!e) return;
    vis = e.isIntersecting;
    if (e.intersectionRatio >= 0.2 && introStart < 0 && !introDone) introStart = performance.now();
    sync();
    kick();
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
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
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
    last = 0;
    draw(performance.now(), 16);
    kick();
  };
  const later = () => { clearTimeout(rt); rt = window.setTimeout(refresh, 120); };
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
      if (instant || RM) { last = 0; draw(now, 16); }
      kick();
    },
    refresh,
    destroy() {
      dead = true;
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
