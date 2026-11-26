// A framed window of scrolling lines: the briefing, facts, logs and results.

import { GAME_W, H } from "../kit/input";
import {
  AMBER, DUSK, EMBER, FRAME_A, INK, MIST, NIGHT, PARCHMENT, PLUM, type RGB,
  blit, image, nineSlice, rgb, text,
} from "../kit/style";

const X = 176, Y = 96, WIDTH = 1048, MAX_H = 704, LINE = 26, CLOSE = 32;
export const RESULT_RIGHT = "assets/progress/PNG/GUI-Kit-Pack-Free_37.png";
export const RESULT_WRONG = "assets/progress/PNG/GUI-Kit-Pack-Free_36.png";

function lineColor(line: string): RGB {
  const t = line.trim();
  if (t && (t === t.toUpperCase() && /[A-Z]/.test(t))) return AMBER;
  if (/^[•\-*]/.test(t)) return PARCHMENT;
  return MIST;
}

export class Modal {
  open = false;
  scroll = 0;
  lines: string[] = [];
  /** Optional big image above the lines (the result tick or cross). */
  badge: string | null = null;

  constructor(public title: string) {}

  show(lines: string[], badge: string | null = null) {
    this.lines = lines;
    this.badge = badge;
    this.scroll = 0;
    this.open = true;
  }
  close() {
    this.open = false;
  }

  private top() {
    return this.badge ? 248 : 112;
  }
  height() {
    return Math.min(MAX_H, this.top() + this.lines.length * LINE + 72);
  }
  private visible() {
    return Math.max(1, Math.floor((this.height() - this.top() - 72) / LINE));
  }
  closeRect() {
    return { x: X + WIDTH - CLOSE - 24, y: Y + 24, w: CLOSE, h: CLOSE };
  }
  inside(x: number, y: number) {
    return x >= X && x <= X + WIDTH && y >= Y && y <= Y + this.height();
  }
  wheel(dy: number) {
    this.scroll = Math.max(0, Math.min(Math.max(0, this.lines.length - this.visible()), this.scroll + dy));
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.open) return;
    ctx.fillStyle = rgb(INK, 0.8);
    ctx.fillRect(0, 0, GAME_W, H);
    const h = this.height();
    nineSlice(ctx, X, Y, WIDTH, h, FRAME_A, 40, 1, NIGHT, 0.96);

    if (this.title) text(ctx, this.title, X + 80, Y + 64, 26, AMBER, { title: true });
    if (this.badge) blit(ctx, image(this.badge), X + WIDTH / 2 - 96, Y + 40, 192, 192);

    const first = this.scroll, n = this.visible();
    let y = Y + this.top() + LINE / 2;
    for (let i = first; i < Math.min(this.lines.length, first + n); i++) {
      const line = this.lines[i];
      if (line.trim()) text(ctx, line, X + 80, y, 17, lineColor(line), { shadow: false });
      y += LINE;
    }
    if (this.lines.length > n) {
      // scroll track on the right edge
      const trackY = Y + this.top(), trackH = n * LINE;
      ctx.fillStyle = rgb(PLUM);
      ctx.fillRect(X + WIDTH - 56, trackY, 4, trackH);
      const thumbH = Math.max(24, (trackH * n) / this.lines.length);
      const thumbY = trackY + ((trackH - thumbH) * this.scroll) / Math.max(1, this.lines.length - n);
      ctx.fillStyle = rgb(DUSK);
      ctx.fillRect(X + WIDTH - 56, thumbY, 4, thumbH);
    }

    const c = this.closeRect();
    ctx.fillStyle = rgb(PLUM);
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = rgb(EMBER);
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    ctx.strokeStyle = rgb(PARCHMENT);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.x + 9, c.y + 9); ctx.lineTo(c.x + c.w - 9, c.y + c.h - 9);
    ctx.moveTo(c.x + c.w - 9, c.y + 9); ctx.lineTo(c.x + 9, c.y + c.h - 9);
    ctx.stroke();
    text(ctx, "ESC or click outside to close", X + WIDTH / 2, Y + h - 40, 13, DUSK, { align: "center", shadow: false });
  }
}
