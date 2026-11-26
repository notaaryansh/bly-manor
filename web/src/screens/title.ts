// Title card: the whole screen is the storm. Rain, lightning bolts with a
// distant roll of thunder, and the manor's name.

import type { Screen } from "../app";
import { setMood } from "../kit/ambience";
import { drawBackground, updateBackground } from "../kit/background";
import { easeOutBack, fx } from "../kit/fx";
import { H, W } from "../kit/input";
import { play } from "../kit/sound";
import { AMBER, INK, MIST, PARCHMENT, rgb, text } from "../kit/style";

const DROPS = 200;
const BOLT_FRAMES = 12;

export class TitleScreen implements Screen {
  private frame = 0;
  private nextBolt = 150;
  private boltAge = BOLT_FRAMES;
  // a bolt is a flat list of x,y points: the trunk, then one branch
  private trunk = new Float32Array(0);
  private branch = new Float32Array(0);
  // rain as flat typed arrays: x, y, speed per drop
  private rx = new Float32Array(DROPS);
  private ry = new Float32Array(DROPS);
  private rs = new Uint8Array(DROPS);

  constructor(private onStart: () => void) {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < DROPS; i++) {
      this.rx[i] = rand() * (W + 200);
      this.ry[i] = rand() * H;
      this.rs[i] = [10, 14, 18][(rand() * 3) | 0];
    }
  }

  enter() {
    setMood("storm");
  }

  /** A jagged bolt from the top of the sky, away from the title in the middle. */
  private strike() {
    const left = Math.random() < 0.5;
    let x = left ? 120 + Math.random() * 360 : W - 480 + Math.random() * 360;
    let y = -10;
    const pts: number[] = [x, y];
    const end = 360 + Math.random() * 220;
    let fork = -1;
    while (y < end) {
      y += 18 + Math.random() * 26;
      x += (Math.random() - 0.5) * 60;
      pts.push(Math.round(x / 4) * 4, Math.round(y / 4) * 4); // snap to the pixel grid
      if (fork < 0 && y > end * 0.35 && Math.random() < 0.4) fork = pts.length - 2;
    }
    this.trunk = new Float32Array(pts);
    const b: number[] = [];
    if (fork >= 0) {
      let bx = pts[fork], by = pts[fork + 1];
      b.push(bx, by);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 4; i++) {
        bx += dir * (14 + Math.random() * 20);
        by += 14 + Math.random() * 18;
        b.push(Math.round(bx / 4) * 4, Math.round(by / 4) * 4);
      }
    }
    this.branch = new Float32Array(b);
    this.boltAge = 0;
  }

  update() {
    this.frame++;
    this.boltAge++;
    updateBackground(W);
    if (this.frame === this.nextBolt) {
      this.strike();
      fx.flash([200, 210, 255], 150);
      fx.shake(0.25);
      play("thunder", undefined, 0.45 + Math.random() * 0.5); // the roll arrives after the light
      this.nextBolt = this.frame + 300 + ((Math.random() * 300) | 0);
    }
  }

  key(e: KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") this.start();
  }
  click() {
    this.start();
  }
  private start() {
    if (this.frame < 20) return;
    play("select");
    this.onStart();
  }

  private drawBolt(ctx: CanvasRenderingContext2D) {
    // flickers: on, off, on again, then gone
    const a = this.boltAge;
    if (a >= BOLT_FRAMES || (a >= 3 && a < 5)) return;
    const fade = a < 3 ? 1 : 1 - (a - 5) / (BOLT_FRAMES - 5);
    for (const [pts, glow, core] of [[this.trunk, 14, 5], [this.branch, 8, 3]] as [Float32Array, number, number][]) {
      if (pts.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineJoin = "miter";
      ctx.strokeStyle = rgb([170, 180, 255], 0.35 * fade);
      ctx.lineWidth = glow;
      ctx.stroke();
      ctx.strokeStyle = rgb([245, 245, 255], fade);
      ctx.lineWidth = core;
      ctx.stroke();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const f = this.frame;
    drawBackground(ctx, W, H);
    ctx.fillStyle = rgb(INK, 170 / 255);
    ctx.fillRect(0, 0, W, H);
    this.drawBolt(ctx);

    // rain: one path, one stroke
    ctx.strokeStyle = rgb([90, 100, 150]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < DROPS; i++) {
      const s = this.rs[i];
      const y = ((this.ry[i] + f * s) % (H + 40)) - 20;
      const x = ((((this.rx[i] - f * s * 0.3) % (W + 200)) + W + 200) % (W + 200)) - 100;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + s);
    }
    ctx.stroke();

    const cx = W / 2;
    const ty = Math.round(H / 2 - 120 - (1 - easeOutBack(f / 50)) * 200);
    text(ctx, "MURDER AT", cx, ty - 70, 48, MIST, { title: true, align: "center" });
    text(ctx, "BLY MANOR", cx, ty + 10, 120, PARCHMENT, { title: true, align: "center" });
    text(ctx, "The most real murder mystery game you'll ever play.", cx, ty + 110, 20, MIST, { align: "center" });
    if (f > 50 && ((f / 30) | 0) % 2 === 0)
      text(ctx, "PRESS SPACE", cx, H - 190, 28, AMBER, { title: true, align: "center" });
    text(ctx, "headphones on  ·  M to mute", cx, H - 48, 14, MIST, { align: "center", shadow: false });

    fx.overlay(ctx, W, H);
  }
}
