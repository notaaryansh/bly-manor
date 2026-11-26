// The first-case tour: a short popup on what happened and what to do, then a
// spotlight on each part of the board with a note on what it's for.
// The full tour runs once per browser; after that only the case intro shows.
// H on the board replays it.

import { easeOutBack } from "../kit/fx";
import { H, W } from "../kit/input";
import { play } from "../kit/sound";
import {
  AMBER, DUSK, FRAME_B, INK, MIST, NIGHT, PARCHMENT, measure, nineSlice, rgb, text, wrap,
} from "../kit/style";

export interface Rect { x: number; y: number; w: number; h: number }
interface Step { title: string; body: string; target?: () => Rect }

const SEEN_KEY = "bly-tour-seen";
const CARD_W = 440, PAD = 32, BODY = 18, LINE = 28, GAP = 24; // GAP: spotlight edge to note

export class Tutorial {
  active = false;
  private steps: Step[] = [];
  private i = 0;
  private age = 0;
  private lines: string[] = [];

  /** Start the case intro, and the full tour if this browser hasn't seen it (or force is set). */
  begin(intro: Step, tour: Step[], force = false) {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private mode: show it */
    }
    this.steps = force || !seen ? [intro, ...tour] : [intro];
    this.i = 0;
    this.go(0);
    this.active = true;
  }

  private go(i: number) {
    this.i = i;
    this.age = 0;
    this.lines = [];
  }

  next() {
    play("select");
    if (this.i + 1 < this.steps.length) this.go(this.i + 1);
    else this.finish();
  }
  back() {
    if (this.i > 0) {
      play("select");
      this.go(this.i - 1);
    }
  }
  finish() {
    this.active = false;
    if (this.steps.length > 1)
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* not remembered */
      }
  }

  key(e: KeyboardEvent) {
    if (e.key === "Escape") this.finish();
    else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") this.next();
    else if (e.key === "ArrowLeft" || e.key === "Backspace") this.back();
  }

  update() {
    this.age++;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    const step = this.steps[this.i];
    const target = step.target?.();
    const t = easeOutBack(this.age / 14);

    // dim everything except the spotlight
    ctx.fillStyle = rgb(INK, 0.74);
    if (!target) ctx.fillRect(0, 0, W, H);
    else {
      const { x, y, w, h } = target;
      ctx.fillRect(0, 0, W, y);
      ctx.fillRect(0, y + h, W, H - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, W - x - w, h);
      const pulse = 0.6 + 0.4 * Math.sin(this.age * 0.15);
      ctx.strokeStyle = rgb(AMBER, pulse);
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    }

    // the note
    const width = target ? CARD_W : 640;
    if (!this.lines.length) this.lines = wrap(ctx, step.body, BODY, width - 2 * PAD);
    const height = PAD + 32 + 16 + this.lines.length * LINE + 24 + 24 + PAD;
    let cx: number, cy: number, arrow: "left" | "right" | "up" | "down" | null = null;
    if (!target) {
      cx = (W - width) / 2;
      cy = (H - height) / 2;
    } else if (target.x + target.w + GAP + width <= W - 24) {
      cx = target.x + target.w + GAP;
      cy = target.y + target.h / 2 - height / 2;
      arrow = "left";
    } else if (target.x - GAP - width >= 24) {
      cx = target.x - GAP - width;
      cy = target.y + target.h / 2 - height / 2;
      arrow = "right";
    } else {
      cx = target.x + target.w / 2 - width / 2;
      cy = target.y + target.h + 32;
      arrow = "up";
      if (cy + height > H - 24) {
        cy = target.y - 32 - height;
        arrow = "down";
      }
    }
    cx = Math.round(Math.max(24, Math.min(W - 24 - width, cx)));
    cy = Math.round(Math.max(24, Math.min(H - 24 - height, cy)));

    ctx.save();
    ctx.globalAlpha = Math.min(1, this.age / 8);
    ctx.translate(cx + width / 2, cy + height / 2);
    ctx.scale(0.9 + 0.1 * t, 0.9 + 0.1 * t);
    ctx.translate(-(cx + width / 2), -(cy + height / 2));
    if (target && arrow) {
      ctx.fillStyle = rgb(AMBER);
      ctx.beginPath();
      const ay = Math.max(cy + 24, Math.min(cy + height - 24, target.y + target.h / 2));
      const ax = Math.max(cx + 24, Math.min(cx + width - 24, target.x + target.w / 2));
      if (arrow === "left") { ctx.moveTo(cx - 14, ay); ctx.lineTo(cx + 2, ay - 12); ctx.lineTo(cx + 2, ay + 12); }
      if (arrow === "right") { ctx.moveTo(cx + width + 14, ay); ctx.lineTo(cx + width - 2, ay - 12); ctx.lineTo(cx + width - 2, ay + 12); }
      if (arrow === "up") { ctx.moveTo(ax, cy - 14); ctx.lineTo(ax - 12, cy + 2); ctx.lineTo(ax + 12, cy + 2); }
      if (arrow === "down") { ctx.moveTo(ax, cy + height + 14); ctx.lineTo(ax - 12, cy + height - 2); ctx.lineTo(ax + 12, cy + height - 2); }
      ctx.fill();
    }
    nineSlice(ctx, cx, cy, width, height, FRAME_B, 24, 2, NIGHT, 0.97);
    text(ctx, step.title, cx + PAD, cy + PAD + 12, 22, AMBER, { title: true });
    let y = cy + PAD + 32 + 16 + LINE / 2;
    for (const ln of this.lines) {
      text(ctx, ln, cx + PAD, y, BODY, PARCHMENT);
      y += LINE;
    }
    const footY = cy + height - PAD - 8;
    const last = this.i + 1 === this.steps.length;
    text(ctx, last ? "ENTER  let's go" : "ENTER  next", cx + PAD, footY, 14, AMBER);
    const esc = last ? "" : "ESC  skip";
    if (esc) text(ctx, esc, cx + PAD + measure(ctx, "ENTER  next", 14) + 32, footY, 14, MIST, { shadow: false });
    if (this.steps.length > 1)
      text(ctx, `${this.i + 1} / ${this.steps.length}`, cx + width - PAD, footY, 14, DUSK, { align: "right", shadow: false });
    ctx.restore();
  }
}
