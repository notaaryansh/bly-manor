// Game feel: screen shake, flashes, zoom punch, floating numbers and toasts.
// Shake and zoom are one canvas transform per frame (no extra screen-sized
// canvas), and the arrays here are tiny and capped.

import { AMBER, FRAME_D, INK, NIGHT, PARCHMENT, type RGB, nineSlice, rgb, text, wrap } from "./style";

export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInOut = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
export function easeOutBack(t: number, s = 1.70158) {
  t = clamp01(t) - 1;
  return t * t * ((s + 1) * t + s) + 1;
}
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

interface Floater { msg: string; x: number; y: number; color: RGB; size: number; age: number; life: number }
interface Toast { msg: string; color: RGB; age: number; life: number; lines: string[] | null }

const MAX_FLOATERS = 8;
const MAX_TOASTS = 3;

export class FX {
  trauma = 0;
  maxShake = 22;
  flashColor: RGB = PARCHMENT;
  flashAlpha = 0;
  punch = 0;
  frame = 0;
  showToasts = true;
  private floaters: Floater[] = [];
  private toasts: Toast[] = [];
  private ox = 0;
  private oy = 0;

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  flash(color: RGB, alpha = 150) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }
  zoomPunch(amount = 0.04) {
    this.punch = Math.max(this.punch, amount);
  }
  floatText(msg: string, x: number, y: number, color: RGB = PARCHMENT, size = 26) {
    if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({ msg, x, y, color, size, age: 0, life: 70 });
  }
  toast(msg: string, color: RGB = AMBER) {
    this.toasts.push({ msg, color, age: 0, life: 300, lines: null });
    if (this.toasts.length > MAX_TOASTS) this.toasts.shift();
  }

  update() {
    this.frame++;
    this.trauma = Math.max(0, this.trauma - 0.025);
    this.flashAlpha = Math.max(0, this.flashAlpha * 0.86 - 1);
    this.punch *= 0.85;
    for (let i = this.floaters.length - 1; i >= 0; i--)
      if (++this.floaters[i].age >= this.floaters[i].life) this.floaters.splice(i, 1);
    for (let i = this.toasts.length - 1; i >= 0; i--)
      if (++this.toasts[i].age >= this.toasts[i].life) this.toasts.splice(i, 1);
    if (this.trauma > 0) {
      const s = this.maxShake * this.trauma ** 2, t = this.frame * 0.9;
      this.ox = Math.round(s * Math.sin(t * 2.1 + Math.random()));
      this.oy = Math.round(s * Math.cos(t * 2.7 + Math.random()));
    } else {
      this.ox = this.oy = 0;
    }
  }

  /** Start a frame: clear, then shake and zoom everything drawn after this. */
  begin(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.trauma > 0 || this.punch > 0.002) {
      ctx.fillStyle = rgb(INK);
      ctx.fillRect(0, 0, w, h);
    }
    const z = 1 + (this.punch > 0.002 ? this.punch : 0);
    ctx.setTransform(z, 0, 0, z, (w - w * z) / 2 + this.ox, (h - h * z) / 2 + this.oy);
  }

  /** Flash, floating numbers and toasts, last over the game area. */
  overlay(ctx: CanvasRenderingContext2D, areaW: number, areaH: number) {
    if (this.flashAlpha > 1) {
      ctx.fillStyle = rgb(this.flashColor, Math.round(this.flashAlpha) / 255);
      ctx.fillRect(0, 0, areaW, areaH);
    }
    for (const f of this.floaters) {
      const t = f.age / f.life;
      const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const pop = 1 + 0.25 * Math.max(0, 1 - f.age / 8);
      text(ctx, f.msg, f.x, f.y - 28 * easeOutCubic(t), Math.round(f.size * pop), f.color, { align: "center", alpha });
    }
    if (!this.showToasts || !this.toasts.length) return;
    // toasts live in the case-file column: left margin, its width, stacked up from the bottom margin
    const margin = 48, width = 240, gap = 8;
    let bottom = areaH - margin;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, areaW, areaH);
    ctx.clip();
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      if (!t.lines) t.lines = wrap(ctx, t.msg, 16, width - 56).slice(0, 2);
      const h = 20 + 22 * t.lines.length;
      const slide = easeOutBack(t.age / 18);
      const out = 1 - easeInOut((t.age - t.life + 30) / 30);
      const x = margin - Math.round((1 - slide * out) * (width + margin));
      const y = bottom - h;
      nineSlice(ctx, x, y, width, h, FRAME_D, 12, 2, NIGHT);
      ctx.fillStyle = rgb(t.color);
      ctx.beginPath();
      ctx.arc(x + 24, y + h / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      if ((t.age / 10 | 0) % 2 === 0 && t.age < 90) {
        ctx.strokeStyle = rgb(PARCHMENT);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      for (let k = 0; k < t.lines.length; k++) text(ctx, t.lines[k], x + 42, y + 21 + k * 22, 16, PARCHMENT);
      bottom -= h + gap;
    }
    ctx.restore();
  }
}

export const fx = new FX();
