// The suspects board: a detective's corkboard of the guests, pinned photos joined
// by coloured string. When one suspect tells another something, light runs
// down the string from speaker to listener.
//
// Memory: the cork is a 100x225 texture stretched at draw time, each photo is
// one small cached card, and the light is drawn straight onto the canvas.

import { onGossip, type GameState, type Gossip, type Moods } from "../api";
import { easeInOut, easeOutBack, fx } from "../kit/fx";
import { GAME_W, H, W } from "../kit/input";
import { play } from "../kit/sound";
import {
  AMBER, BLOOD, EMBER, FROST, INK, MIST, MOSS, PARCHMENT, RELATIONSHIP_COLORS, RIVAL, ROSE, type RGB,
  makeCanvas, portraitSource, rgb, text,
} from "../kit/style";

const X = GAME_W, PW = W - GAME_W; // the panel: x 1400..1800
const CARD_W = 88, CARD_H = 112, NOTE_FRAMES = 54, AFTERGLOW = 60, SAG = 26;
const PAPER: RGB = [236, 228, 210], PAPER_EDGE: RGB = [200, 190, 170];

interface Card {
  name: string;
  victim: boolean;
  hx: number;
  hy: number;
  tilt: number;
  drop: number; // <0 waiting, 0..1 falling in
  wiggle: number;
  bubble: number;
  rattle: number;
  img: HTMLCanvasElement | null;
}
interface Note { src: string; dst: string; text: string; start: number }

const bezier = (ax: number, ay: number, bx: number, by: number, t: number): [number, number] => {
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + SAG, a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t;
  return [a * ax + b * mx + c * bx, a * ay + b * my + c * by];
};

class SuspectBoard {
  private game: GameState | null = null;
  private cards = new Map<string, Card>();
  private victim: Card | null = null;
  private notes: Note[] = [];
  private traffic = new Map<string, number>();
  private afterglow: { src: string; dst: string; at: number }[] = [];
  private feed: { src: string; dst: string; text: string; at: number }[] = [];
  private frame = 0;
  private cork: HTMLCanvasElement | null = null;
  private stop: (() => void) | null = null;
  /** The suspect being questioned right now (their card lifts and glows). */
  focus: string | null = null;

  /** Pin up a new case and start listening for gossip. */
  load(game: GameState) {
    this.stop?.();
    this.game = game;
    this.cards.clear();
    this.notes = [];
    this.traffic.clear();
    this.afterglow = [];
    this.feed = [];
    const living = game.suspects.filter((s) => !s.is_victim);
    const cx = X + PW / 2, cy = 380, rx = PW * 0.34, ry = 210;
    living.forEach((s, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / living.length;
      this.cards.set(s.name, this.card(s.name, false, Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), -1 - i * 9));
    });
    const v = game.suspects.find((s) => s.is_victim);
    this.victim = v ? this.card(v.name, true, cx, cy + 6, 1) : null;
    this.stop = onGossip(game.id, (g) => this.gossip(g));
  }

  private card(name: string, victim: boolean, hx: number, hy: number, drop: number): Card {
    let seed = 0;
    for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    return { name, victim, hx, hy, tilt: ((seed % 100) / 100 - 0.5) * 10, drop, wiggle: 0, bubble: 0, rattle: 0, img: null };
  }

  private rel(a: string, b: string) {
    const r = this.game?.relationships;
    return r?.[`${a}_${b}`] ?? r?.[`${b}_${a}`];
  }

  private moods(name: string): Moods | undefined {
    return this.game?.suspects.find((s) => s.name === name)?.moods;
  }

  private gossip(g: Gossip) {
    if (!this.cards.has(g.from) || !this.cards.has(g.to)) return;
    const last = this.notes.reduce((m, n) => Math.max(m, n.start), this.frame - 30);
    this.notes.push({ src: g.from, dst: g.to, text: g.text, start: Math.max(this.frame, last + 30) });
    const s = this.game!.suspects.find((x) => x.name === g.to);
    if (s) s.moods = g.moods;
    this.cards.get(g.to)!.rattle = 30;
    fx.toast(`${g.to} heard something from ${g.from}...`, ROSE);
  }

  update() {
    this.frame++;
    for (const c of this.cards.values()) {
      if (c.drop < -1) c.drop++;
      else if (c.drop === -1) c.drop = 0.0001;
      else if (c.drop > 0 && c.drop < 1) c.drop = Math.min(1, c.drop + 1 / 26);
      if (c.wiggle) c.wiggle--;
      if (c.bubble) c.bubble--;
      if (c.rattle) c.rattle--;
    }
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      if (this.frame - n.start < NOTE_FRAMES) continue;
      const dst = this.cards.get(n.dst)!;
      dst.wiggle = 40;
      dst.bubble = 90;
      const key = [n.src, n.dst].sort().join("|");
      this.traffic.set(key, (this.traffic.get(key) ?? 0) + 1);
      this.feed.unshift({ src: n.src, dst: n.dst, text: n.text.trim().replace(/\n/g, " "), at: this.frame });
      this.feed.length = Math.min(3, this.feed.length);
      this.afterglow.push({ src: n.src, dst: n.dst, at: this.frame });
      this.afterglow = this.afterglow.filter((g) => this.frame - g.at < AFTERGLOW);
      play("whisper");
      this.notes.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ drawing
  private corkTexture() {
    if (this.cork) return this.cork;
    const [c, ctx] = makeCanvas(PW / 4, H / 4);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.fillStyle = "rgb(150,104,66)";
    ctx.fillRect(0, 0, c.width, c.height);
    const specks = ["rgb(128,86,54)", "rgb(168,120,78)", "rgb(138,94,60)", "rgb(180,134,88)"];
    for (let i = 0; i < (c.width * c.height) / 3; i++) {
      ctx.fillStyle = specks[(rand() * 4) | 0];
      ctx.fillRect((rand() * c.width) | 0, (rand() * c.height) | 0, 1, 1);
    }
    return (this.cork = c);
  }

  private cardImage(card: Card) {
    if (card.img) return card.img;
    const [c, ctx] = makeCanvas(CARD_W, CARD_H);
    ctx.fillStyle = rgb(PAPER);
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.strokeStyle = rgb(PAPER_EDGE);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);
    ctx.fillStyle = "rgb(46,36,56)";
    ctx.fillRect(8, 8, 72, 72);
    if (card.victim) ctx.filter = "grayscale(1)";
    ctx.drawImage(portraitSource(card.name), 12, 12, 64, 64);
    ctx.filter = "none";
    text(ctx, card.name, CARD_W / 2, 94, 14, INK, { align: "center", shadow: false });
    if (card.victim) {
      ctx.strokeStyle = rgb(BLOOD);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(78, 78); ctx.moveTo(78, 10); ctx.lineTo(10, 78); ctx.stroke();
    }
    return (card.img = c);
  }

  private pin(c: Card): [number, number] {
    return [c.hx, c.hy - CARD_H / 2 + 8];
  }

  draw(ctx: CanvasRenderingContext2D) {
    // cork + frame
    ctx.drawImage(this.corkTexture(), X, 0, PW, H);
    ctx.strokeStyle = "rgb(74,46,34)";
    ctx.lineWidth = 14;
    ctx.strokeRect(X + 7, 7, PW - 14, H - 14);
    ctx.strokeStyle = "rgb(46,28,22)";
    ctx.lineWidth = 2;
    ctx.strokeRect(X + 14, 14, PW - 28, H - 28);
    ctx.fillStyle = rgb([20, 10, 20], 70 / 255);
    ctx.fillRect(X, 0, PW, H);

    // header strip
    const sx = X + PW / 2 - 125;
    ctx.fillStyle = rgb(PAPER);
    ctx.fillRect(sx, 28, 250, 46);
    ctx.strokeStyle = rgb(PAPER_EDGE);
    ctx.strokeRect(sx + 1, 29, 248, 44);
    text(ctx, "SUSPECTS", X + PW / 2, 51, 24, INK, { title: true, align: "center", shadow: false });
    ctx.fillStyle = rgb(BLOOD);
    for (const px of [sx + 12, sx + 238]) {
      ctx.beginPath(); ctx.arc(px, 36, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (!this.game) return;

    const live = [...this.cards.values()].filter((c) => c.drop > 0);
    // strings between guests: dim until gossip has used them, thicker with traffic
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j], rel = this.rel(a.name, b.name);
        if (!rel) continue;
        const traffic = this.traffic.get([a.name, b.name].sort().join("|")) ?? 0;
        let col = RELATIONSHIP_COLORS[rel] ?? MIST;
        if (!traffic) col = col.map((v) => Math.round(v * 0.55 + 27)) as unknown as RGB;
        this.string(ctx, this.pin(a), this.pin(b), col, Math.min(5, 2 + traffic));
      }

    // light flowing from speaker to listener, then a fading afterglow
    for (const n of this.notes)
      if (this.frame >= n.start) this.flow(ctx, n.src, n.dst, easeInOut((this.frame - n.start) / NOTE_FRAMES), 1);
    for (const g of this.afterglow)
      if (this.frame - g.at < AFTERGLOW) this.flow(ctx, g.src, g.dst, 1, 1 - (this.frame - g.at) / AFTERGLOW);

    if (this.victim) this.drawCard(ctx, this.victim);
    for (const c of live) if (c.name !== this.focus) this.drawCard(ctx, c);
    const f = this.focus ? this.cards.get(this.focus) : null;
    if (f && f.drop > 0) this.drawCard(ctx, f);

    this.legend(ctx);
    this.whispers(ctx);
  }

  private string(ctx: CanvasRenderingContext2D, [ax, ay]: number[], [bx, by]: number[], col: RGB, width: number) {
    for (const [dx, dy, c] of [[1, 2, "rgb(40,24,20)"], [0, 0, rgb(col)]] as [number, number, string][]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const [x, y] = bezier(ax, ay, bx, by, i / 24);
        if (i) ctx.lineTo(x + dx, y + dy);
        else ctx.moveTo(x + dx, y + dy);
      }
      ctx.stroke();
    }
  }

  private flow(ctx: CanvasRenderingContext2D, src: string, dst: string, head: number, fade: number) {
    const a = this.cards.get(src), b = this.cards.get(dst);
    if (!a || !b || a.drop <= 0 || b.drop <= 0) return;
    const color = RELATIONSHIP_COLORS[this.rel(src, dst) ?? ""] ?? PARCHMENT;
    const [ax, ay] = this.pin(a), [bx, by] = this.pin(b);
    const n = 48;
    let [px, py] = bezier(ax, ay, bx, by, 0);
    for (let i = 0; i < n; i++) {
      const s = i / n;
      if (s > head) break;
      const k = (0.35 + 0.65 * Math.max(0, 1 - (head - s) * 3)) * fade; // bright at the pulse, lit behind it
      const hot = color.map((c) => Math.min(255, Math.round(c + (255 - c) * k))) as unknown as RGB;
      const [x, y] = bezier(ax, ay, bx, by, (i + 1) / n);
      ctx.strokeStyle = rgb(hot, Math.round(70 * k) / 255);
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = rgb(hot, Math.min(1, k + 0.2));
      ctx.lineWidth = 4;
      ctx.stroke();
      [px, py] = [x, y];
    }
    if (head < 1 && fade > 0) {
      const [x, y] = bezier(ax, ay, bx, by, head);
      ctx.fillStyle = rgb(color, 90 / 255);
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,250,230,0.9)";
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: Card) {
    const d = c.victim ? 1 : easeOutBack(Math.min(1, c.drop));
    const lift = c.name === this.focus ? 8 : 0;
    const x = c.hx + Math.round(Math.sin(c.rattle * 1.3) * c.rattle * 0.25);
    const y = Math.round(c.hy - (1 - d) * 120) - lift;
    let tilt = c.tilt;
    if (c.wiggle) tilt += Math.sin(c.wiggle * 0.6) * c.wiggle * 0.35;
    const alpha = c.victim ? 1 : Math.min(1, c.drop * 3);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (lift) {
      ctx.fillStyle = rgb(AMBER, (70 + 40 * Math.sin(this.frame * 0.15)) / 255);
      ctx.fillRect(x - CARD_W / 2 - 15, y - CARD_H / 2 - 15, CARD_W + 30, CARD_H + 30);
    }
    ctx.translate(x, y);
    ctx.rotate((-tilt * Math.PI) / 180);
    ctx.fillStyle = rgb([20, 10, 10], (lift ? 130 : 90) / 255);
    ctx.fillRect(-CARD_W / 2 + 4 + lift / 2, -CARD_H / 2 + 6 + lift, CARD_W, CARD_H);
    ctx.drawImage(this.cardImage(c), -CARD_W / 2, -CARD_H / 2);
    ctx.restore();

    // pin
    const pinCol: RGB = c.victim ? BLOOD : lift ? [220, 60, 60] : [70, 110, 200];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgb(INK);
    ctx.beginPath(); ctx.arc(x + 2, y - CARD_H / 2 + 10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgb(pinCol);
    ctx.beginPath(); ctx.arc(x, y - CARD_H / 2 + 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 3, y - CARD_H / 2 + 5, 2, 2);

    if (c.victim) {
      ctx.fillStyle = rgb(BLOOD);
      ctx.fillRect(x - 35, y + CARD_H / 2 - 4, 70, 20);
      text(ctx, "VICTIM", x, y + CARD_H / 2 + 6, 12, PARCHMENT, { align: "center", shadow: false });
      ctx.globalAlpha = 1;
      return;
    }
    const m = this.moods(c.name);
    ([["Anxious", FROST], ["Moody", EMBER], ["Trust", MOSS]] as [keyof Moods, RGB][]).forEach(([trait, col], i) => {
      const bx = x - 39 + i * 27, by = y + CARD_H / 2 + 4;
      ctx.fillStyle = rgb(INK);
      ctx.fillRect(bx, by, 24, 6);
      ctx.fillStyle = rgb(col);
      ctx.fillRect(bx, by, Math.round((24 * Math.min(5, m?.[trait] ?? 0)) / 5), 6);
      if (c.rattle && ((c.rattle / 4) | 0) % 2) {
        ctx.strokeStyle = rgb(PARCHMENT);
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, 23, 5);
      }
    });
    if (c.bubble) {
      const pop = easeOutBack((90 - c.bubble) / 10), fade = Math.min(1, c.bubble / 20), size = Math.max(1, Math.round(30 * pop));
      const bx = x + CARD_W / 2 - 6 - size / 2, by = y - CARD_H / 2 + 6 - size;
      ctx.globalAlpha = alpha * fade;
      ctx.fillStyle = rgb(PARCHMENT);
      ctx.fillRect(bx, by, size, size);
      ctx.beginPath(); ctx.moveTo(bx + 4, by + size - 2); ctx.lineTo(bx + 12, by + size - 2); ctx.lineTo(bx + 2, by + size + 8); ctx.fill();
      if (pop > 0.6) text(ctx, "!", bx + size / 2, by + size / 2, 22, EMBER, { title: true, align: "center", shadow: false });
    }
    ctx.globalAlpha = 1;
  }

  private legend(ctx: CanvasRenderingContext2D) {
    const y0 = 657;
    text(ctx, "STRING", X + 36, y0, 14, PARCHMENT);
    const items: [string, RGB][] = [["Friend", MOSS], ["Lovers", ROSE], ["Business", FROST], ["Rival", RIVAL], ["Enemy", EMBER], ["Family", AMBER]];
    items.forEach(([lab, col], i) => {
      const x = X + 36 + (i % 3) * 116, y = y0 + 24 + ((i / 3) | 0) * 22;
      ctx.fillStyle = rgb(col);
      ctx.fillRect(x, y - 2, 22, 4);
      text(ctx, lab, x + 30, y, 14, PARCHMENT);
    });
  }

  private whispers(ctx: CanvasRenderingContext2D) {
    const px = X + 22, py = 726, pw = PW - 44, ph = 150;
    ctx.fillStyle = rgb(PAPER);
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = rgb(PAPER_EDGE);
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    ctx.fillStyle = "rgb(200,214,230)";
    for (let i = 1; i < 6; i++) ctx.fillRect(px + 8, py + 26 + i * 22, pw - 16, 1);
    ctx.fillStyle = rgb(BLOOD);
    ctx.beginPath(); ctx.arc(px + pw / 2, py + 6, 6, 0, Math.PI * 2); ctx.fill();
    text(ctx, "WHISPERS", px + 12, py + 18, 14, BLOOD, { shadow: false });
    const quiet: RGB = [90, 80, 90];
    if (!this.feed.length) {
      text(ctx, "Nothing yet. Leave a room after", px + 12, py + 46, 13, quiet, { shadow: false });
      text(ctx, "questioning and they'll talk.", px + 12, py + 68, 13, quiet, { shadow: false });
      return;
    }
    let y = py + 44;
    for (const f of this.feed) {
      const fresh = this.frame - f.at < 40 && ((this.frame / 5) | 0) % 2;
      text(ctx, `${f.src} → ${f.dst}`, px + 12, y, 14, fresh ? EMBER : INK, { shadow: false });
      if (f.text) {
        const short = f.text.length <= 40 ? f.text : f.text.slice(0, 38) + "...";
        text(ctx, `"${short}"`, px + 12, y + 17, 12, [70, 60, 80], { shadow: false });
      }
      y += 38;
    }
  }
}

export const suspectBoard = new SuspectBoard();
