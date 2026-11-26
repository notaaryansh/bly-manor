// Suspect cards and case-file buttons for the board.

import type { Suspect } from "../api";
import { easeOutCubic } from "../kit/fx";
import { play } from "../kit/sound";
import {
  AMBER, BLOOD, BUTTONS, DUSK, EMBER, FRAME_B, INK, MIST, NIGHT, PARCHMENT, PLUM,
  drawPortrait, measure, nineSlice, rgb, sheetFrames, text,
} from "../kit/style";

export const CARD_W = 280, CARD_H = 338;
const ACCUSE_FILL = [52, 22, 30] as const;

export class Card {
  hovered = false;
  lift = 0;
  frame = 0;
  visited = false;
  accuseMode = false;

  constructor(public suspect: Suspect, public x: number, public y: number) {}

  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + CARD_W && py >= this.y && py <= this.y + CARD_H;
  }

  hover(px: number, py: number) {
    const was = this.hovered;
    this.hovered = this.contains(px, py);
    if (this.hovered && !was) play("select");
  }

  update() {
    this.frame++;
    this.lift += ((this.hovered ? 1 : 0) - this.lift) * 0.2;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const up = Math.round(12 * easeOutCubic(this.lift));
    const x = this.x, y = this.y - up;

    ctx.fillStyle = rgb(INK, (110 + 60 * this.lift) / 255);
    ctx.fillRect(x + 6 + ((up / 3) | 0), y + 8 + up, CARD_W, CARD_H);
    nineSlice(ctx, x, y, CARD_W, CARD_H, FRAME_B, 24, 2, this.accuseMode ? ACCUSE_FILL : NIGHT);

    // portrait window with a candle-warm backdrop
    const wx = x + 24, wy = y + 24, ww = CARD_W - 48, wh = 200;
    ctx.fillStyle = rgb(this.accuseMode ? [90, 30, 40] : PLUM);
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = rgb(AMBER, 34 / 255);
    ctx.beginPath();
    ctx.ellipse(wx + ww / 2, wy + wh / 2, ww / 2 - 15, wh / 2 - 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = Math.round(Math.sin(this.frame * 0.08) * 2 * this.lift);
    drawPortrait(ctx, this.suspect.name, wx + ww / 2 - 96, wy + wh - 192 + bob, 192);
    ctx.strokeStyle = rgb(DUSK);
    ctx.lineWidth = 2;
    ctx.strokeRect(wx + 1, wy + 1, ww - 2, wh - 2);

    text(ctx, this.suspect.name.toUpperCase(), x + CARD_W / 2, wy + wh + 28, 30, PARCHMENT, { title: true, align: "center" });
    text(ctx, `${this.suspect.occupation}  ·  ${this.suspect.age}`, x + CARD_W / 2, wy + wh + 58, 16, MIST, { align: "center" });

    if (this.hovered) {
      const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.2);
      const base = this.accuseMode ? EMBER : AMBER;
      const k = 0.7 + 0.3 * pulse;
      const c = [base[0] * k, base[1] * k, base[2] * k].map(Math.round) as unknown as typeof base;
      ctx.fillStyle = rgb(c);
      const L = 26, t = 4;
      for (const [cx, cy, sx, sy] of [[x + 6, y + 6, 1, 1], [x + CARD_W - 6, y + 6, -1, 1], [x + 6, y + CARD_H - 6, 1, -1], [x + CARD_W - 6, y + CARD_H - 6, -1, -1]]) {
        ctx.fillRect(Math.min(cx, cx + sx * L), cy - (sy < 0 ? t : 0), L, t);
        ctx.fillRect(cx - (sx < 0 ? t : 0), Math.min(cy, cy + sy * L), t, L);
      }
      text(ctx, this.accuseMode ? "ACCUSE?" : "QUESTION", x + CARD_W / 2, y + CARD_H - 32, 14, c, { align: "center" });
    }

    if (this.visited) {
      // rubber stamp across the bottom-right of the portrait window
      ctx.save();
      ctx.translate(wx + ww - 64, wy + wh - 26);
      ctx.rotate(-0.17);
      const w = measure(ctx, "QUESTIONED", 16, true) + 20;
      ctx.fillStyle = rgb(PARCHMENT, 0.88);
      ctx.fillRect(-w / 2, -14, w, 28);
      ctx.strokeStyle = rgb(BLOOD);
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2 + 1.5, -12.5, w - 3, 25);
      text(ctx, "QUESTIONED", 0, 0, 16, BLOOD, { title: true, align: "center", shadow: false });
      ctx.restore();
    }
  }
}

export class MenuButton {
  hovered = false;
  active = false;
  private slide = 0;

  constructor(public label: string, public x: number, public y: number, public w = 240, public h = 84) {}

  get danger() {
    return this.label === "ACCUSE";
  }
  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  hover(px: number, py: number) {
    const was = this.hovered;
    this.hovered = this.contains(px, py);
    if (this.hovered && !was) play("select");
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.slide += ((this.hovered || this.active ? 1 : 0) - this.slide) * 0.25;
    const x = this.x + Math.round(10 * this.slide);
    const frames = sheetFrames(BUTTONS, 4);
    const idx = this.danger ? (this.hovered || this.active ? 2 : 0) : this.hovered ? 1 : 3;
    if (frames.length) ctx.drawImage(frames[idx], x, this.y, this.w, this.h);
    else {
      ctx.fillStyle = rgb(PLUM);
      ctx.fillRect(x, this.y, this.w, this.h);
    }
    const lightBg = this.hovered && !this.danger;
    const color = lightBg ? INK : this.hovered || this.active ? PARCHMENT : MIST;
    text(ctx, this.label, x + this.w / 2, this.y + this.h / 2, 26, color, { title: true, align: "center", shadow: !lightBg });
  }
}
