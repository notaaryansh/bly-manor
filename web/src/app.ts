// The game loop and the current screen.
//
// Logic runs at a fixed 60 steps a second (all animation timings count steps,
// like the pygame version). Drawing happens once per animation frame, and drops
// to every other frame when the device can't keep up, so weak hardware stays
// smooth instead of falling behind.

import { fx } from "./kit/fx";
import { H, W, routeTo, type Handlers } from "./kit/input";

export interface Screen extends Handlers {
  update(): void;
  draw(ctx: CanvasRenderingContext2D): void;
  enter?(): void;
  leave?(): void;
}

const STEP = 1000 / 60;
/** Dev-only numbers for checking the frame budget (window.__bly in the console). */
const stats = { drawMs: 0, halfRate: false, step, screen: null as Screen | null };
if (import.meta.env.DEV) (window as unknown as { __bly: typeof stats }).__bly = stats;

/** Dev/testing: advance n logic steps and draw once, even when the tab is in the background. */
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    fx.update();
    for (const t of tickers) t();
    screen?.update();
  }
  fx.begin(ctx, W, H);
  screen?.draw(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
let screen: Screen | null = null;
const tickers: (() => void)[] = [];
/** Run fn every logic step, whatever screen is showing (e.g. the suspects board). */
export const tick = (fn: () => void) => tickers.push(fn);
let ctx: CanvasRenderingContext2D;

export function show(next: Screen) {
  screen?.leave?.();
  screen = next;
  if (import.meta.env.DEV) stats.screen = next;
  routeTo(next);
  next.enter?.();
}

export function start(canvas: HTMLCanvasElement) {
  ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = false;
  let last = performance.now();
  let acc = 0;
  let slowFrames = 0;
  let skip = false;
  let odd = false;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    acc += Math.min(now - last, 250); // after a pause, don't try to catch up for ages
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      fx.update();
      for (const t of tickers) t();
      screen?.update();
      acc -= STEP;
      steps++;
    }
    if (steps === 4) acc = 0;

    odd = !odd;
    if (skip && odd) return;
    const t0 = performance.now();
    fx.begin(ctx, W, H);
    screen?.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // a sustained slow draw switches to 30 fps; a sustained fast one switches back
    const cost = performance.now() - t0;
    if (import.meta.env.DEV) stats.drawMs = stats.drawMs * 0.95 + cost * 0.05;
    slowFrames = Math.max(-120, Math.min(120, slowFrames + (cost > 12 ? 1 : -1)));
    if (slowFrames >= 60) skip = true;
    else if (slowFrames <= -60) skip = false;
    if (import.meta.env.DEV) stats.halfRate = skip;
  };
  requestAnimationFrame(frame);
}
