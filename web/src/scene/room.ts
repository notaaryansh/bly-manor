// Procedural pixel-art rooms of Bly Manor, the interrogation backdrops.
// Each room is painted once at 350x225 (~300 KB) and scaled 4x as it's drawn,
// so it sits on the same chunky grid as the sprites. Only the two most recent
// rooms are kept. Candles, fire and rain animate on top from tiny sprites.

import { makeCanvas, rgb, shade, type RGB } from "../kit/style";

const LOW_W = 350, LOW_H = 225, K = 4, FLOOR = 168;

const ROOMS: Record<string, [string, string, RGB]> = {
  Nick: ["The Study", "window", [70, 52, 44]],
  Sarah: ["The Conservatory", "conservatory", [44, 66, 60]],
  James: ["The Kitchen", "kitchen", [78, 58, 40]],
  Emma: ["The Library", "library", [52, 40, 70]],
  David: ["The Drawing Room", "fireplace", [72, 36, 48]],
  Lisa: ["The Music Room", "piano", [46, 48, 78]],
};

interface Box { x: number; y: number; w: number; h: number }

/** Small seeded random so a room always paints the same way. */
function seeded(name: string) {
  let s = 0;
  for (const ch of name) s = (Math.imul(s, 31) + ch.charCodeAt(0)) | 0;
  return (lo: number, hi: number) => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) | 0;
    return lo + (((s >>> 0) % 10000) / 10000) * (hi - lo);
  };
}

// glow sprites, built once and drawn additively with a flicker alpha
let candleGlow: HTMLCanvasElement | null = null;
let fireGlow: HTMLCanvasElement | null = null;
function glows() {
  if (candleGlow && fireGlow) return;
  let ctx;
  [candleGlow, ctx] = makeCanvas(100, 100);
  for (const r of [50, 38, 27, 17]) {
    ctx.fillStyle = "rgb(13,8,2)";
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath(); ctx.arc(50, 50, r, 0, Math.PI * 2); ctx.fill();
  }
  [fireGlow, ctx] = makeCanvas(80, 68);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const k = 1 - i / 5;
    ctx.fillStyle = "rgb(11,6,2)";
    ctx.beginPath(); ctx.ellipse(40, 34, 40 * k, 34 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
}

export class Room {
  readonly title: string;
  private kind: string;
  private wall: RGB;
  private base: HTMLCanvasElement;
  private windows: Box[] = [];
  private fire: Box | null = null;
  private oven: Box | null = null;
  private rand: (lo: number, hi: number) => number;
  private rain: Uint16Array;

  constructor(name: string) {
    [this.title, this.kind, this.wall] = ROOMS[name] ?? ["The Hall", "window", [60, 44, 66]];
    this.rand = seeded(name);
    this.base = this.paint();
    this.rain = new Uint16Array(80);
    for (let i = 0; i < this.rain.length; i++) this.rain[i] = this.rand(0, 1000) | 0;
    glows();
  }

  // ------------------------------------------------------------ static paint
  private paint() {
    const [c, s] = makeCanvas(LOW_W, LOW_H);
    const wall = this.wall;
    const fill = (col: RGB, x: number, y: number, w: number, h: number) => {
      s.fillStyle = rgb(col);
      s.fillRect(x, y, w, h);
    };
    fill(wall, 0, 0, LOW_W, LOW_H);
    for (let x = 0; x < LOW_W; x += 14) {
      fill(shade(wall, 0.86), x, 0, 5, FLOOR);
      for (let y = 6; y < FLOOR - 40; y += 16) fill(shade(wall, 1.3), x + 10, y + ((x / 14) % 2) * 8, 1, 1);
    }
    fill(shade(wall, 0.55), 0, 0, LOW_W, 6);
    fill(shade(wall, 1.35), 0, 6, LOW_W, 1);
    const wy = FLOOR - 38;
    fill([54, 34, 30], 0, wy, LOW_W, 38);
    fill([92, 60, 46], 0, wy, LOW_W, 2);
    s.lineWidth = 1;
    for (let x = 6; x < LOW_W; x += 40) {
      s.strokeStyle = "rgb(40,24,22)";
      s.strokeRect(x + 0.5, wy + 7.5, 31, 23);
      fill([74, 48, 40], x + 1, wy + 8, 30, 1);
    }
    fill([46, 30, 28], 0, FLOOR, LOW_W, LOW_H - FLOOR);
    for (let y = FLOOR + 4; y < LOW_H; y += 7) {
      fill([36, 22, 22], 0, y, LOW_W, 1);
      for (let x = this.rand(0, 30) | 0; x < LOW_W; x += 46) fill([36, 22, 22], x, y - 6, 1, 6);
    }
    // rug
    s.fillStyle = "rgb(92,30,40)";
    s.beginPath(); s.ellipse(175, FLOOR + 38, 115, 20, 0, 0, Math.PI * 2); s.fill();
    s.strokeStyle = "rgb(140,96,50)"; s.stroke();
    s.strokeStyle = "rgb(120,40,50)";
    s.beginPath(); s.ellipse(175, FLOOR + 38, 85, 13, 0, 0, Math.PI * 2); s.stroke();

    this.feature(s, fill);
    // paintings hang where the UI never covers them (the right wall is under the demeanor panel)
    const spot = ({ window: [40, 26], piano: [70, 26] } as Record<string, number[]>)[this.kind];
    if (spot) {
      fill([150, 110, 50], spot[0], spot[1], 40, 50);
      fill([40, 30, 36], spot[0] + 4, spot[1] + 4, 32, 42);
      s.fillStyle = "rgb(90,70,70)";
      s.beginPath(); s.arc(spot[0] + 20, spot[1] + 20, 8, 0, Math.PI * 2); s.fill();
      fill([60, 46, 56], spot[0] + 10, spot[1] + 30, 20, 16);
    }
    for (const x of [40, 312]) {
      fill([150, 110, 50], x - 4, wy - 2, 9, 3);
      fill([236, 226, 200], x - 1, wy - 12, 3, 10);
    }
    return c;
  }

  private window(s: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    for (let i = 0; i < h; i++) {
      s.fillStyle = `rgb(${16 + ((i / 6) | 0)},${20 + ((i / 5) | 0)},${44 + ((i / 3) | 0)})`;
      s.fillRect(x, y + i, w, 1);
    }
    s.fillStyle = "rgb(232,228,200)";
    s.beginPath(); s.arc(x + w - 14, y + 14, 7, 0, Math.PI * 2); s.fill();
    s.fillStyle = "rgb(18,20,46)";
    s.beginPath(); s.arc(x + w - 11, y + 12, 6, 0, Math.PI * 2); s.fill();
    s.fillStyle = "rgb(200,200,230)";
    for (let i = 0; i < 6; i++) s.fillRect(x + (this.rand(2, w - 2) | 0), y + (this.rand(2, h / 2) | 0), 1, 1);
    s.fillStyle = "rgb(12,12,24)";
    for (let i = 0; i < 3; i++) {
      const tx = x + 6 + i * ((w / 3) | 0);
      s.beginPath(); s.moveTo(tx, y + h); s.lineTo(tx + 10, y + h - 30 - i * 6); s.lineTo(tx + 20, y + h); s.fill();
    }
    s.strokeStyle = "rgb(70,46,38)";
    s.lineWidth = 3;
    s.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    s.lineWidth = 2;
    s.beginPath(); s.moveTo(x + w / 2, y); s.lineTo(x + w / 2, y + h); s.moveTo(x, y + h / 2); s.lineTo(x + w, y + h / 2); s.stroke();
    s.lineWidth = 1;
    s.fillStyle = "rgb(110,30,44)";
    s.fillRect(x - 10, y - 6, 9, h + 14);
    s.fillRect(x + w + 1, y - 6, 9, h + 14);
    s.fillStyle = "rgb(140,50,60)";
    s.fillRect(x - 7, y - 6, 1, h + 14);
    this.windows.push({ x, y, w, h });
  }

  private feature(s: CanvasRenderingContext2D, fill: (c: RGB, x: number, y: number, w: number, h: number) => void) {
    const fy = FLOOR;
    switch (this.kind) {
      case "window":
        this.window(s, 140, 30, 70, 80);
        fill([80, 50, 36], 110, fy - 26, 130, 10);
        fill([60, 36, 28], 116, fy - 16, 10, 24);
        fill([60, 36, 28], 224, fy - 16, 10, 24);
        fill([220, 210, 180], 150, fy - 29, 20, 3);
        break;
      case "conservatory":
        for (let i = 0; i < 4; i++) this.window(s, 30 + i * 76, 22, 60, 96);
        s.strokeStyle = "rgb(60,120,70)";
        s.lineWidth = 2;
        for (const x of [24, 110, 200, 300]) {
          fill([110, 60, 40], x, fy - 18, 16, 18);
          s.beginPath();
          for (let j = 0; j < 7; j++) {
            const a = -2.6 + j * 0.45;
            s.moveTo(x + 8, fy - 18);
            s.lineTo(x + 8 + 18 * Math.cos(a), fy - 18 + 22 * Math.sin(a));
          }
          s.stroke();
        }
        s.lineWidth = 1;
        break;
      case "kitchen":
        this.window(s, 40, 30, 60, 60);
        fill([40, 40, 46], 190, fy - 58, 120, 58);
        fill([24, 24, 30], 206, fy - 40, 40, 30);
        fill([70, 70, 80], 180, fy - 62, 140, 6);
        [150, 175, 280, 305].forEach((x, i) => {
          fill([90, 90, 90], x, 0, 1, 30 + (i % 2) * 8);
          fill([170, 100, 60], x - 7, 30 + (i % 2) * 8, 14, 10);
        });
        this.oven = { x: 206, y: fy - 40, w: 40, h: 30 };
        break;
      case "library":
        for (const bx of [20, 250]) {
          fill([60, 36, 28], bx, 18, 80, fy - 18);
          const spines: RGB[] = [[120, 40, 50], [50, 80, 110], [60, 100, 60], [150, 120, 60], [90, 60, 110]];
          for (let sy = 24; sy < fy - 20; sy += 22) {
            let x = bx + 4;
            while (x < bx + 74) {
              const w = this.rand(3, 7) | 0, h = this.rand(14, 19) | 0;
              fill(spines[this.rand(0, spines.length) | 0], x, sy + 19 - h, w, h);
              x += w + 1;
            }
            fill([80, 50, 36], bx, sy + 19, 80, 3);
          }
        }
        this.window(s, 140, 30, 70, 80);
        break;
      case "fireplace":
        fill([110, 100, 104], 120, fy - 78, 110, 78);
        fill([140, 130, 134], 112, fy - 84, 126, 8);
        fill([24, 14, 16], 142, fy - 56, 66, 56);
        this.fire = { x: 142, y: fy - 56, w: 66, h: 56 };
        this.window(s, 30, 30, 50, 70);
        break;
      case "piano":
        this.window(s, 150, 26, 80, 90);
        s.fillStyle = "rgb(20,16,22)";
        s.beginPath(); s.moveTo(40, fy); s.lineTo(40, fy - 44); s.lineTo(110, fy - 44); s.lineTo(140, fy - 30); s.lineTo(140, fy); s.fill();
        fill([230, 226, 216], 44, fy - 40, 60, 5);
        for (let x = 46; x < 104; x += 5) fill([20, 16, 22], x, fy - 40, 2, 3);
        break;
    }
  }

  // ------------------------------------------------------------ animated
  draw(ctx: CanvasRenderingContext2D, frame: number) {
    ctx.drawImage(this.base, 0, 0, LOW_W * K, LOW_H * K);

    // rain on every window: one path, one stroke
    ctx.strokeStyle = "rgb(120,140,190)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const perWindow = Math.min(40, (this.rain.length / 2 / Math.max(1, this.windows.length)) | 0);
    this.windows.forEach((w, wi) => {
      const cx = w.x * K, cy = w.y * K, cw = w.w * K, ch = w.h * K;
      for (let i = 0; i < perWindow; i++) {
        const ox = this.rain[(wi * perWindow + i) * 2 % this.rain.length], oy = this.rain[((wi * perWindow + i) * 2 + 1) % this.rain.length];
        const x = cx + ((ox + frame * 2) % cw), y = cy + ((oy + frame * 9) % ch);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, Math.min(cy + ch - 1, y + 12));
      }
    });
    ctx.stroke();

    ctx.globalCompositeOperation = "lighter";
    if (this.fire) this.flames(ctx, this.fire, frame, 1);
    if (this.oven) this.flames(ctx, this.oven, frame, 0.6);
    for (const cx of [40, 312]) {
      const flick = Math.sin((frame + cx) * 0.4) * Math.sin((frame + cx) * 0.17);
      ctx.globalAlpha = Math.min(1, 0.85 + 0.15 * flick);
      ctx.drawImage(candleGlow!, cx * K + 2 - 100, 116 * K - 90, 200, 200);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const cx of [40, 312]) {
      const flick = Math.sin((frame + cx) * 0.4) * Math.sin((frame + cx) * 0.17);
      const x = cx * K + 2, y = 116 * K, h = 16 + ((4 * flick) | 0);
      ctx.fillStyle = "rgb(255,200,90)";
      ctx.fillRect(x - 4, y - h + 16, 8, h);
      ctx.fillStyle = "rgb(255,250,220)";
      ctx.fillRect(x - 4, y + 4, 4, 8);
    }
  }

  private flames(ctx: CanvasRenderingContext2D, b: Box, frame: number, power: number) {
    const x = b.x * K, y = b.y * K, w = b.w * K, h = b.h * K;
    const flick = 0.85 + 0.15 * Math.sin(frame * 0.3) * Math.sin(frame * 0.13);
    ctx.globalAlpha = Math.min(1, flick * power);
    const gw = w * 2.4, gh = h * 2.4;
    ctx.drawImage(fireGlow!, x + w / 2 - gw / 2, y + h / 2 - gh / 2, gw, gh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < ((14 * power) | 0); i++) {
      const fx = x + 8 + ((i * 37 + frame * 3) % (w - 16));
      const fh = ((20 + 30 * Math.abs(Math.sin(frame * 0.2 + i))) * power) | 0;
      ctx.fillStyle = i % 3 === 0 ? "rgb(255,220,120)" : "rgb(247,120,40)";
      ctx.fillRect(((fx / 4) | 0) * 4, y + h - fh, 8, fh);
    }
    ctx.globalCompositeOperation = "lighter";
  }
}

const rooms = new Map<string, Room>();
/** At most two painted rooms in memory. */
export function roomFor(name: string): Room {
  let r = rooms.get(name);
  if (r) {
    rooms.delete(name);
    rooms.set(name, r);
    return r;
  }
  r = new Room(name);
  rooms.set(name, r);
  if (rooms.size > 2) rooms.delete(rooms.keys().next().value!);
  return r;
}
