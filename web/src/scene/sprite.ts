// Suspect expressions, driven by the Anxious / Moody / Trust levels the server
// tracks. The same 64px portrait becomes six readable states through pose,
// tint and hand-placed pixel emotes. Tinted copies stay 64px (16 KB each).

import type { Moods } from "../api";
import { easeOutBack } from "../kit/fx";
import {
  AMBER, EMBER, FROST, INK, MIST, MOSS, PARCHMENT, type RGB, makeCanvas, portraitSource, rgb, text,
} from "../kit/style";

export type Emotion = "neutral" | "nervous" | "irritated" | "guarded" | "open" | "shocked";

export const LABELS: Record<Emotion, [string, RGB]> = {
  neutral: ["Composed", MIST],
  nervous: ["Nervous", FROST],
  irritated: ["Irritated", EMBER],
  guarded: ["Guarded", [168, 150, 200]],
  open: ["Opening up", MOSS],
  shocked: ["Shaken", AMBER],
};

/** What just changed beats the resting mood. */
export function choose(levels: Partial<Moods>, deltas: Partial<Moods> = {}, line = ""): Emotion {
  const a = levels.Anxious ?? 3, m = levels.Moody ?? 3, t = levels.Trust ?? 3;
  const da = deltas.Anxious ?? 0, dm = deltas.Moody ?? 0, dt = deltas.Trust ?? 0;
  if (Math.max(Math.abs(da), Math.abs(dm), Math.abs(dt)) >= 2) return "shocked";
  if (dm > 0 || (dt < 0 && dm >= 0 && m >= 3)) return "irritated";
  if (da > 0) return "nervous";
  if (dt > 0 || da < 0) return "open";
  const low = line.toLowerCase();
  if ((line.match(/!/g)?.length ?? 0) >= 2 || low.includes("how dare")) return "irritated";
  if (line.includes("...") || low.includes("i-")) return "nervous";
  if (m >= 4) return "irritated";
  if (a >= 4) return "nervous";
  if (t <= 1) return "guarded";
  if (t >= 4) return "open";
  return "neutral";
}

/** How hard the screen shakes for a mood swing (0..1). */
export function shakeFor(d: Partial<Moods>) {
  const bad = Math.max(0, d.Anxious ?? 0) + Math.max(0, d.Moody ?? 0) + Math.max(0, -(d.Trust ?? 0));
  return Math.min(1, 0.18 * bad + (bad >= 2 ? 0.25 : 0));
}

const VEIN_SMALL = ["..X.X..", "..X.X..", "XX...XX", ".......", "XX...XX", "..X.X..", "..X.X.."];
const VEIN_BIG = ["...X.X...", "...X.X...", "...X.X...", "XXX...XXX", ".........", "XXX...XXX", "...X.X...", "...X.X...", "...X.X..."];

const TINTS: Partial<Record<Emotion, string>> = {
  nervous: "rgb(150,190,255)",
  irritated: "rgb(255,190,170)",
  guarded: "rgb(150,140,170)",
  open: "rgb(255,240,210)",
};

const tinted = new Map<string, HTMLCanvasElement>();
function tintedSource(name: string, emo: Emotion | "shadow"): CanvasImageSource {
  const src = portraitSource(name);
  const color = emo === "shadow" ? "rgb(0,0,0)" : TINTS[emo];
  if (!color) return src;
  const key = `${name}:${emo}`;
  let c = tinted.get(key);
  if (!c) {
    let ctx;
    [c, ctx] = makeCanvas(64, 64);
    ctx.drawImage(src, 0, 0, 64, 64);
    ctx.globalCompositeOperation = emo === "shadow" ? "source-in" : "multiply";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    if (emo !== "shadow") {
      ctx.globalCompositeOperation = "destination-in"; // keep the portrait's own transparency
      ctx.drawImage(src, 0, 0, 64, 64);
    }
    tinted.set(key, c);
  }
  return c;
}

export class Sprite {
  emotion: Emotion = "neutral";
  since = 0;
  shockTimer = 0;
  thinking = false;
  private px: number;

  constructor(public name: string, public size = 448) {
    this.px = size / 64;
  }

  set(emotion: Emotion) {
    if (emotion === "shocked") this.shockTimer = 80;
    if (emotion !== this.emotion) {
      this.emotion = emotion;
      this.since = 0;
    }
  }

  get shown(): Emotion {
    return this.shockTimer ? "shocked" : this.emotion;
  }

  update() {
    this.since++;
    if (this.shockTimer) this.shockTimer--;
  }

  /** bottom centre = where the sprite stands; dim darkens it while the detective talks; enter slides it in. */
  draw(ctx: CanvasRenderingContext2D, bx: number, by: number, frame: number, dim = 0, enter = 1) {
    const emo = this.shown, px = this.px;
    const x = bx + Math.round((1 - enter) * 260);
    let sx = 1, sy = 1, dx = 0, dy = 0;
    switch (emo) {
      case "neutral": dy = Math.round(Math.sin(frame * 0.05) * px * 0.5); break;
      case "nervous":
        dx = Math.round(Math.sin(frame * 1.7) * px * 0.4);
        dy = Math.round(Math.sin(frame * 0.09) * px * 0.4);
        break;
      case "irritated": {
        const lean = easeOutBack(this.since / 14);
        sx = sy = 1 + 0.05 * lean;
        dy = Math.round(px * 0.5 * Math.sin(frame * 0.12));
        break;
      }
      case "guarded": dy = Math.round(px * 2 * Math.min(1, this.since / 20)); break;
      case "open": dy = Math.round(Math.sin(frame * 0.07) * px * 0.8 - px); break;
      case "shocked": {
        const t = 1 - this.shockTimer / 80;
        dy = -Math.round(Math.sin(Math.min(1, t * 2.4) * Math.PI) * px * 3);
        const squash = Math.max(0, 1 - t * 4);
        sx = 1 + 0.08 * squash;
        sy = 1 - 0.06 * squash;
        break;
      }
    }
    const w = Math.round(this.size * sx), h = Math.round(this.size * sy);
    const r = { x: x + dx - w / 2, y: by + dy - h, w, h };

    if (emo === "shocked") this.burst(ctx, r.x + w / 2, r.y + h / 2);

    ctx.fillStyle = rgb(INK, 120 / 255);
    ctx.beginPath();
    ctx.ellipse(x, by - 4, this.size * 0.35, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(tintedSource(this.name, emo), Math.round(r.x), Math.round(r.y), w, h);
    if (enter > 0.6) this.emote(ctx, r, emo, frame);
    if (this.thinking) this.thought(ctx, r, frame);
    if (dim > 0) {
      ctx.globalAlpha = (150 * dim) / 255;
      ctx.drawImage(tintedSource(this.name, "shadow"), Math.round(r.x), Math.round(r.y), w, h);
      ctx.globalAlpha = 1;
    }
  }

  private emote(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, emo: Emotion, frame: number) {
    const s = r.w / 64;
    const e = (gx: number, gy: number, w: number, h: number, c: RGB, k = 2) => {
      ctx.fillStyle = rgb(c);
      ctx.fillRect(Math.round(r.x + gx * s), Math.round(r.y + gy * s), Math.max(1, Math.round(w * k * s)), Math.max(1, Math.round(h * k * s)));
    };
    if (emo === "nervous") {
      const gy = 6 + ((frame % 80) / 80) * 14, gx = 50;
      e(gx + 2, gy, 1, 1, [220, 240, 255]);
      e(gx + 1, gy + 2, 2, 1, [170, 215, 255]);
      e(gx, gy + 4, 4, 2, [120, 185, 250]);
      e(gx + 1, gy + 8, 2, 1, [80, 140, 220]);
      e(gx + 1, gy + 4, 1, 1, [255, 255, 255]);
      if (((frame / 6) | 0) % 2)
        for (let i = 0; i < 3; i++) {
          e(6 - i, 12 + i * 4, 2, 1, FROST);
          e(58 + i, 12 + i * 4, 2, 1, FROST);
        }
    } else if (emo === "irritated") {
      // classic four-corner anger mark, outlined, pulsing in size
      const mark = ((frame / 9) | 0) % 2 ? VEIN_BIG : VEIN_SMALL;
      const cell = Math.max(2, Math.round(s * (r.w < 300 ? 1.5 : 1)));
      const n = mark.length;
      const ox = Math.round(r.x + 55 * s - (n * cell) / 2), oy = Math.round(r.y + 5 * s - (n * cell) / 2);
      for (const [grow, col] of [[Math.floor(cell / 3), INK], [0, [240, 70, 60] as RGB]] as [number, RGB][]) {
        ctx.fillStyle = rgb(col);
        for (let ry = 0; ry < n; ry++)
          for (let rx = 0; rx < n; rx++)
            if (mark[ry][rx] === "X") ctx.fillRect(ox + rx * cell - grow, oy + ry * cell - grow, cell + 2 * grow, cell + 2 * grow);
      }
    } else if (emo === "guarded") {
      for (let i = 0; i < 6; i++) e(14 + i * 6, 0, 1, 3 + (i % 2) * 2, [120, 105, 190]);
      if (((frame / 25) | 0) % 2 === 0) for (let i = 0; i < 3; i++) e(52 + i * 4, 2, 1, 1, MIST);
    } else if (emo === "open") {
      [[6, 8], [54, 16], [52, 2], [10, 26]].forEach(([gx, gy], i) => {
        if ((((frame / 10) | 0) + i) % 3) {
          const c = i % 2 ? AMBER : PARCHMENT;
          e(gx, gy - 2, 1, 5, c, 1);
          e(gx - 2, gy, 5, 1, c, 1);
          e(gx, gy, 1, 1, [255, 255, 255], 1);
        }
      });
    } else if (emo === "shocked") {
      const pop = easeOutBack((80 - this.shockTimer) / 10);
      text(ctx, "!!", r.x + r.w - 20, r.y + 20, Math.round(80 * pop) + 4, AMBER, { title: true, align: "center" });
    }
  }

  private burst(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const t = 1 - this.shockTimer / 80, r0 = 150 + 90 * t;
    ctx.lineWidth = 4;
    for (const odd of [0, 1]) {
      ctx.strokeStyle = rgb(odd ? AMBER : PARCHMENT);
      ctx.beginPath();
      for (let i = odd; i < 16; i += 2) {
        const a = (i * Math.PI) / 8 + 0.1, r1 = r0 + 60 + (i % 2) * 50;
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      ctx.stroke();
    }
  }

  private thought(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number }, frame: number) {
    const cx = r.x + r.w - 10, cy = r.y + 20;
    ctx.fillStyle = rgb(PARCHMENT);
    ctx.beginPath(); ctx.arc(cx - 30, cy + 50, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 14, cy + 30, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 30, cy - 7, 48, 25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgb(INK); ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = rgb(INK);
    for (let i = 0; i < 3; i++) {
      const up = ((frame / 9) | 0) % 3 === i ? 4 : 0;
      ctx.fillRect(cx + 30 - 48 + 26 + i * 16, cy - 7 - 3 - up, 8, 8);
    }
  }
}
