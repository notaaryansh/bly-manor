// Stormy title screen: rain, lightning, and the manor's name.

import type { Screen } from "../app";
import { drawBackground, updateBackground } from "../kit/background";
import { easeOutBack, fx } from "../kit/fx";
import { GAME_W, H, W } from "../kit/input";
import { play } from "../kit/sound";
import { AMBER, INK, MIST, PARCHMENT, rgb, text } from "../kit/style";

const DROPS = 160;

export class TitleScreen implements Screen {
  private frame = 0;
  private nextBolt = 150;
  // rain as flat typed arrays: x, y, speed per drop
  private rx = new Float32Array(DROPS);
  private ry = new Float32Array(DROPS);
  private rs = new Uint8Array(DROPS);

  constructor(private onStart: () => void) {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < DROPS; i++) {
      this.rx[i] = rand() * (GAME_W + 200);
      this.ry[i] = rand() * H;
      this.rs[i] = [10, 14, 18][(rand() * 3) | 0];
    }
  }

  update() {
    this.frame++;
    updateBackground(GAME_W);
    if (this.frame === this.nextBolt) {
      fx.flash([200, 210, 255], 170);
      fx.shake(0.35);
      play("thud");
      this.nextBolt = this.frame + 260 + ((Math.random() * 220) | 0);
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

  draw(ctx: CanvasRenderingContext2D) {
    const f = this.frame;
    drawBackground(ctx, GAME_W, H);
    ctx.fillStyle = rgb(INK, 170 / 255);
    ctx.fillRect(0, 0, GAME_W, H);

    // rain: one path, one stroke
    ctx.strokeStyle = rgb([90, 100, 150]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < DROPS; i++) {
      const s = this.rs[i];
      const y = ((this.ry[i] + f * s) % (H + 40)) - 20;
      const x = ((((this.rx[i] - f * s * 0.3) % (GAME_W + 200)) + GAME_W + 200) % (GAME_W + 200)) - 100;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + s);
    }
    ctx.stroke();

    const cx = GAME_W / 2;
    const ty = Math.round(H / 2 - 120 - (1 - easeOutBack(f / 50)) * 200);
    text(ctx, "MURDER AT", cx, ty - 70, 48, MIST, { title: true, align: "center" });
    text(ctx, "BLY MANOR", cx, ty + 10, 120, PARCHMENT, { title: true, align: "center" });
    text(ctx, "Six guests. One body. Every suspect has something to hide.", cx, ty + 110, 20, MIST, { align: "center" });
    if (f > 50 && ((f / 30) | 0) % 2 === 0)
      text(ctx, "PRESS SPACE", cx, H - 190, 28, AMBER, { title: true, align: "center" });

    fx.overlay(ctx, GAME_W, H);
    // the rumor board's column, filled in later screens
    ctx.fillStyle = rgb([40, 26, 22]);
    ctx.fillRect(GAME_W, 0, W - GAME_W, H);
  }
}
