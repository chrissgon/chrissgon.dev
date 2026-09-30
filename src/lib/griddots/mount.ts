// The page's background dots step aside from the pointer, as the portrait's dots do (same push, same spring:
// src/lib/portrait/push.ts). Loaded lazily by src/scripts/site.ts, only with a mouse or pen, without reduced
// motion or Save-Data, once the page is idle after load. The CSS grid stays the picture everywhere else.
//
// How: one layer (the body's own box, behind every piece of content: body is a stacking context and the layer
// has z-index -1) holds a canvas the size of the viewport. At rest the canvas is empty and the CSS grid shows.
// While the pointer is near, the canvas covers each dot it moves with the page's background colour (the dot
// disappears from the grid) and draws it where the push puts it, in the grid's own colour. So a frame touches
// only the few dots within the push radius, plus those still springing back; a still pointer draws nothing,
// and the frame loop stops once every dot has settled. The layer scrolls with the page, so the dots stay on the
// CSS grid while scrolling, and it never takes a pointer event. Dots the portrait draws itself (its face and
// its halo) are left to it (GridDotOwner), and so are dots under an opaque box (a card, a field), which would
// otherwise slide out from under it.

import { BG_PUSH_PX, BG_PUSH_R, SETTLE_PX, pointerPush, springStep } from "../portrait/push.ts";
import type { GridDotOwner } from "../portrait/types.ts";
import {
  canvasBox, devicePlace, dotAt, dotKey, dotsAcross, forDotsNear, holds, withAlpha, type Box,
} from "./geometry.ts";

export interface GridDotsController {
  destroy(): void;
}

interface Dot {
  i: number;
  j: number;
  ox: number;
  oy: number;
}

const TRANSPARENT = /^(transparent|rgba\(.*,\s*0\)|color\(.*\/\s*0\))$/i;

export function mountGridDots(): GridDotsController {
  const body = document.body, layer = document.createElement("div"), canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  layer.className = "grid-dots";
  layer.setAttribute("aria-hidden", "true");
  layer.append(canvas);
  if (!ctx) return { destroy() {} };
  body.prepend(layer);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const dots = new Map<number, Dot>(), blocked = new Set<number>(), opaque = new WeakMap<Element, boolean>();
  const sprites = new Map<number, HTMLCanvasElement>();
  const cleanups: Array<() => void> = [];
  const on = (t: EventTarget, e: string, f: EventListener, p?: AddEventListenerOptions) => {
    t.addEventListener(e, f, p);
    cleanups.push(() => t.removeEventListener(e, f, p));
  };

  // Layout, read in build() only: the layer's page position and size, the pixel ratio, the colours.
  let lx = 0, ly = 0, LW = 0, LH = 0, NX = 0, NY = 0, dpr = 1, bg = "", dot = "", edge = "";
  let owners: GridDotOwner[] = [];
  // The canvas's box in layer px, and the device-px box drawn in the last frame (cleared before the next).
  let cv: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }, drawn: Box | null = null, sized = false;
  let ptr: { x: number; y: number } | null = null, raf = 0, last = 0, dead = false, rt = 0;

  function build() {
    const r = layer.getBoundingClientRect();
    lx = r.left + scrollX;
    ly = r.top + scrollY;
    LW = r.width;
    LH = r.height;
    NX = dotsAcross(LW);
    NY = dotsAcross(LH);
    dpr = Math.min(3, devicePixelRatio || 1);
    const cs = getComputedStyle(body);
    bg = cs.backgroundColor;
    layer.style.color = "var(--pui-bg-emphasis)";
    dot = getComputedStyle(layer).color;
    layer.style.color = "";
    edge = withAlpha(dot, 0);
    sprites.clear();
    owners = [...document.querySelectorAll<Element & GridDotOwner>("[data-grid-owner]")];
    sized = false;
    blocked.clear();
    dots.clear();
    drawn = null;
  }

  /** The dot drawn as the CSS grid draws it (radial-gradient: solid to 0.7 px, clear at 1 px), centred at a phase. */
  function sprite(px: number, py: number): HTMLCanvasElement {
    const key = px * 8 * 9 + py * 8;
    let s = sprites.get(key);
    if (s) return s;
    const c = Math.ceil(dpr) + 2, n = 2 * c;
    s = document.createElement("canvas");
    s.width = s.height = n;
    const x = s.getContext("2d");
    if (x) {
      const g = x.createRadialGradient(c + px, c + py, 0, c + px, c + py, dpr);
      g.addColorStop(0, dot);
      g.addColorStop(0.7, dot);
      g.addColorStop(1, edge);
      x.fillStyle = g;
      x.fillRect(0, 0, n, n);
    }
    sprites.set(key, s);
    return s;
  }

  /** Places the canvas over the viewport (grid-aligned); returns true when it moved or was resized (and so is blank). */
  function cover(): boolean {
    const view = { x0: scrollX - lx, y0: scrollY - ly, x1: scrollX - lx + innerWidth, y1: scrollY - ly + innerHeight };
    // The part of the viewport over the layer must be on the canvas.
    if (sized && holds(cv, { x0: Math.max(0, view.x0), y0: Math.max(0, view.y0), x1: Math.min(LW, view.x1), y1: Math.min(LH, view.y1) })) return false;
    // One grid tile of margin on each side, so a little scrolling does not move the canvas.
    const box = canvasBox({ x0: view.x0 - 28, y0: view.y0 - 28, x1: view.x1 + 28, y1: view.y1 + 28 }, LW, LH);
    const w = Math.round((box.x1 - box.x0) * dpr), h = Math.round((box.y1 - box.y0) * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w / dpr}px`;
      canvas.style.height = `${h / dpr}px`;
    } else ctx!.clearRect(0, 0, w, h);
    canvas.style.transform = `translate(${box.x0}px, ${box.y0}px)`;
    cv = box;
    sized = true;
    drawn = null;
    return true;
  }

  /** Whether an element paints an opaque box over the grid (a background colour, an image, a video, a canvas). */
  function covers(e: Element): boolean {
    let v = opaque.get(e);
    if (v === undefined) {
      const cs = getComputedStyle(e);
      v = /^(IMG|VIDEO|IFRAME|svg|PICTURE)$/.test(e.tagName) || (e.tagName === "CANVAS" && e !== canvas) ||
        !TRANSPARENT.test(cs.backgroundColor.replace(/\s+/g, " ").trim()) || cs.backgroundImage !== "none";
      opaque.set(e, v);
    }
    return v;
  }

  /** Whether the background dot (i, j) is ours to move: shown (nothing opaque over it) and not the portrait's. */
  function movable(i: number, j: number): boolean {
    const x = dotAt(i), y = dotAt(j), px = x + lx, py = y + ly;
    for (const o of owners) if (o.ownsGridDot?.(px, py)) return false;
    const cx = px - scrollX, cy = py - scrollY;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return false;
    for (let e = document.elementFromPoint(cx, cy); e && e !== body && e !== document.documentElement; e = e.parentElement)
      if (covers(e)) return false;
    return true;
  }

  function frame(now: number) {
    raf = 0;
    if (dead) return;
    const k = springStep(last ? now - last : 16);
    last = now;
    const p = ptr ? { x: ptr.x + scrollX - lx, y: ptr.y + scrollY - ly } : null;
    if (p) {
      forDotsNear(p.x, p.y, BG_PUSH_R, NX, NY, (i, j) => {
        const key = dotKey(i, j);
        if (dots.has(key) || blocked.has(key)) return;
        if (movable(i, j)) dots.set(key, { i, j, ox: 0, oy: 0 });
        else blocked.add(key);
      });
    }
    let busy = false;
    for (const [key, d] of dots) {
      const [tx, ty] = p ? pointerPush(dotAt(d.i) - p.x, dotAt(d.j) - p.y, BG_PUSH_R, BG_PUSH_PX) : [0, 0];
      d.ox += (tx - d.ox) * k;
      d.oy += (ty - d.oy) * k;
      if (Math.abs(tx - d.ox) > SETTLE_PX || Math.abs(ty - d.oy) > SETTLE_PX) busy = true;
      else if (!tx && !ty) dots.delete(key); // back on the grid: the CSS dot shows again
      else { d.ox = tx; d.oy = ty; }
    }
    paint();
    if (!dots.size) blocked.clear();
    if (busy) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  /** Clears what the last frame drew, then covers each moved dot's grid place and draws it where it is now. */
  function paint() {
    if (!dots.size && !drawn) return; // nothing on the canvas and nothing to draw
    const moved = cover();
    const c = ctx!, rad = Math.ceil(dpr) + 1, half = Math.ceil(dpr) + 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (drawn && !moved) c.clearRect(drawn.x0, drawn.y0, drawn.x1 - drawn.x0, drawn.y1 - drawn.y0);
    drawn = null;
    if (!dots.size) return;
    const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x0: number, y0: number, x1: number, y1: number) => {
      if (x0 < box.x0) box.x0 = x0;
      if (y0 < box.y0) box.y0 = y0;
      if (x1 > box.x1) box.x1 = x1;
      if (y1 > box.y1) box.y1 = y1;
    };
    c.fillStyle = bg;
    for (const d of dots.values()) {
      const hx = devicePlace(dotAt(d.i), 0, cv.x0, dpr), hy = devicePlace(dotAt(d.j), 0, cv.y0, dpr);
      c.fillRect(hx.at - rad, hy.at - rad, 2 * rad + 1, 2 * rad + 1);
      grow(hx.at - rad, hy.at - rad, hx.at + rad + 1, hy.at + rad + 1);
    }
    for (const d of dots.values()) {
      const x = devicePlace(dotAt(d.i), d.ox, cv.x0, dpr), y = devicePlace(dotAt(d.j), d.oy, cv.y0, dpr);
      c.drawImage(sprite(x.phase, y.phase), x.at - half, y.at - half);
      grow(x.at - half, y.at - half, x.at + half, y.at + half);
    }
    drawn = box;
  }

  function kick() {
    if (!raf && !dead && !document.hidden) raf = requestAnimationFrame(frame);
  }

  /** Every dot back on the grid at once, the canvas empty, the loop stopped. */
  function rest() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    ptr = null;
    dots.clear();
    blocked.clear();
    paint();
  }

  const move = (ev: Event) => {
    const e = ev as PointerEvent;
    if (e.pointerType === "touch") return;
    ptr = { x: e.clientX, y: e.clientY };
    kick();
  };
  const leave = () => {
    ptr = null;
    kick();
  };
  // The layer's place and size and the pixel ratio at the last build: a resize that changes none of them (the
  // ResizeObserver's first call, a font swap that moves nothing) keeps the dots where they are.
  let built = "";
  const where = () => {
    const r = layer.getBoundingClientRect();
    return [r.left + scrollX, r.top + scrollY, r.width, r.height, devicePixelRatio, innerWidth, innerHeight].join();
  };
  const relayout = () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (dead || where() === built) return;
      rest();
      build();
      built = where();
    }, 120);
  };
  const stop = () => {
    if (reduce.matches) destroy();
  };
  const hidden = () => {
    if (document.hidden) rest();
  };

  function destroy() {
    dead = true;
    cancelAnimationFrame(raf);
    clearTimeout(rt);
    cleanups.forEach((f) => f());
    layer.remove();
  }

  build();
  built = where();
  on(window, "pointermove", move, { passive: true });
  on(window, "pointerdown", move, { passive: true });
  on(document.documentElement, "mouseleave", leave);
  on(window, "blur", leave);
  on(window, "scroll", () => { if (ptr || dots.size) kick(); }, { passive: true });
  on(window, "resize", relayout);
  on(document, "visibilitychange", hidden);
  on(reduce, "change", stop);
  const ro = new ResizeObserver(relayout);
  ro.observe(body);
  cleanups.push(() => ro.disconnect());
  return { destroy };
}
