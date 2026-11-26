// Interrogation, played like a visual novel: the suspect stands in their room,
// the reply streams in and types out with voice blips, and their face, the
// screen and the sound react to every swing in their mood.
//
// Layout is the pygame version's 8px grid: 48px margins, 40px frame padding.

import { ask, leave as leaveRoom, opening, type Moods, type Reply } from "../api";
import type { Screen } from "../app";
import { easeOutBack, easeOutCubic, fx } from "../kit/fx";
import { GAME_W, H, clearTyped, startTyping, stopTyping, typed } from "../kit/input";
import { setMood } from "../kit/ambience";
import { play } from "../kit/sound";
import {
  AMBER, DUSK, EMBER, FRAME_A, FRAME_B, FROST, INK, MIST, MOSS, NIGHT, PARCHMENT, PLATE_A, PLATE_B,
  type RGB, blit, image, measure, nineSlice, rgb, text, vignette, wrap,
} from "../kit/style";
import { roomFor, type Room } from "../scene/room";
import { LABELS, Sprite, choose, shakeFor } from "../scene/sprite";
import * as session from "../session";
import { suspectBoard } from "./suspectBoard";

const G = 8, MARGIN = 48, FRAME = 16, PAD = 40;
const BOX = { x: MARGIN, y: H - MARGIN - 29 * G, w: GAME_W - 2 * MARGIN, h: 29 * G }; // 48,620 1304x232
const HEADER_CAP = 12, ROW_H = 5 * G, PIP_W = 28, PIP_H = 20, PIP_GAP = G;
const PANEL = { x: GAME_W - MARGIN - 45 * G, y: MARGIN, w: 45 * G, h: HEADER_CAP + 3 * G + 2 * ROW_H + 20 + 2 * PAD };
const LINE_H = 36, TEXT_SIZE = 24, INPUT_H = 3 * G, TYPE_SPEED = 1.6;
const ROWS: [keyof Moods, string, RGB][] = [["Anxious", "Nerves", FROST], ["Moody", "Temper", EMBER], ["Trust", "Trust", MOSS]];
const PLAYER_TEXT: RGB = [200, 215, 255];
const rowCy = (i: number) => PANEL.y + PAD + HEADER_CAP + 3 * G + 10 + ROW_H * i;

interface Line { speaker: string; text: string; shown: number }

export class InterrogationScreen implements Screen {
  private room: Room;
  private sprite: Sprite;
  private frame = 0;
  private line: Line | null = null;
  private waiting = false; // a reply is on its way
  private notesOpen = false;
  private notesScroll = 0;
  private shown: Moods;
  private flash: Partial<Record<keyof Moods, number>> = {};
  private occupation: string;
  private time: string;
  private wrapped: { text: string; lines: string[] } = { text: "", lines: [] };

  constructor(private name: string, private onLeave: () => void, private sidePanel: (ctx: CanvasRenderingContext2D) => void) {
    this.room = roomFor(name);
    this.sprite = new Sprite(name, 448);
    const s = session.game!.suspects.find((x) => x.name === name)!;
    this.occupation = s.occupation;
    this.time = session.game!.time_of_death.split("(")[0].trim();
    this.shown = { ...(s.moods ?? { Anxious: 3, Moody: 3, Trust: 3 }) };
    this.sprite.set(choose(this.shown));
    const said = session.transcript(name);
    if (said.length) {
      const [speaker, t] = said[said.length - 1];
      this.line = { speaker, text: t, shown: t.length };
    }
  }

  private get moods(): Moods {
    return session.game!.suspects.find((x) => x.name === this.name)!.moods!;
  }

  enter() {
    setMood("tense");
    suspectBoard.focus = this.name;
    play("open");
    startTyping(120);
    fx.showToasts = false;
    if (!session.transcript(this.name).length) this.fetchOpening();
  }

  leave() {
    suspectBoard.focus = null;
    stopTyping();
  }

  private fetchOpening() {
    this.sprite.thinking = true;
    opening(session.game!.id, this.name).then(({ text: t, moods }) => {
      session.setMoods(this.name, moods);
      session.transcript(this.name).push([this.name, t]);
      session.markQuestioned(this.name);
      this.say(this.name, t);
    }, () => this.say(this.name, "...")).finally(() => (this.sprite.thinking = false));
  }

  private say(speaker: string, t: string) {
    this.line = { speaker, text: t, shown: 0 };
  }
  private lineDone() {
    return !this.line || this.line.shown >= this.line.text.length;
  }

  // ------------------------------------------------------------ input
  key(e: KeyboardEvent) {
    if (e.key === "Tab") {
      this.notesOpen = !this.notesOpen;
      this.notesScroll = 0;
      play("select");
    } else if (e.key === "Enter") {
      if (!this.lineDone()) this.line!.shown = this.line!.text.length;
      else if (typed().trim() && !this.waiting && !this.sprite.thinking) this.ask(typed().trim());
    } else if (e.key === "Escape") {
      if (this.notesOpen) this.notesOpen = false;
      else this.exit();
    }
  }
  click() {
    if (this.line && !this.lineDone()) this.line.shown = this.line.text.length;
    startTyping(120); // keep the keyboard up on touch screens
  }
  wheel(dy: number) {
    if (this.notesOpen) this.notesScroll = Math.max(0, this.notesScroll + dy);
  }

  private exit() {
    play("select");
    if (!this.waiting) leaveRoom(session.game!.id, this.name).catch(() => undefined);
    this.onLeave();
  }

  private ask(question: string) {
    clearTyped();
    this.waiting = true;
    this.sprite.thinking = true;
    session.transcript(this.name).push(["You", question]);
    this.say("You", question);
    this.line!.shown = question.length;
    play("select");
    let started = false;
    ask(session.game!.id, this.name, question, (piece) => {
      if (!started) {
        started = true;
        this.sprite.thinking = false;
        this.say(this.name, "");
      }
      this.line!.text += piece;
    }).then((reply) => this.react(reply), () => {
      this.sprite.thinking = false;
      this.say(this.name, "...I don't want to talk right now.");
    }).finally(() => (this.waiting = false));
  }

  /** The reply is complete: its mood swing hits the face, the screen and the panel. */
  private react(reply: Reply) {
    if (this.line && this.line.speaker === this.name) this.line.text = reply.text;
    session.transcript(this.name).push([this.name, reply.text]);
    session.setMoods(this.name, reply.moods);
    session.markQuestioned(this.name);
    const d = reply.deltas;
    const emotion = choose(reply.moods, d, reply.text);
    this.sprite.set(emotion);
    let amount = shakeFor(d);
    if (emotion === "shocked") {
      amount = Math.max(amount, 0.55);
      fx.zoomPunch(0.03);
      play("sting");
    }
    if (amount > 0) {
      fx.shake(amount);
      if (amount >= 0.3) {
        play("thud");
        fx.flash(emotion === "irritated" ? EMBER : emotion === "nervous" ? FROST : PARCHMENT, 60 + 80 * amount);
      }
    }
    ROWS.forEach(([trait], i) => {
      const v = d[trait];
      if (!v) return;
      const good = v > 0 === (trait === "Trust");
      this.flash[trait] = 50;
      fx.floatText(`${v > 0 ? "+" : ""}${Math.round(v)}`, PANEL.x + PAD + 96, rowCy(i) - 10, good ? MOSS : EMBER, 18);
    });
  }

  // ------------------------------------------------------------ update
  update() {
    this.frame++;
    this.sprite.update();
    for (const k of Object.keys(this.flash) as (keyof Moods)[]) if (--this.flash[k]! <= 0) delete this.flash[k];
    const l = this.line;
    if (l && l.shown < l.text.length) {
      const before = l.shown | 0;
      l.shown = Math.min(l.text.length, l.shown + TYPE_SPEED);
      const after = l.shown | 0;
      if ((after >> 1) !== (before >> 1) && l.text[after - 1]?.trim()) play("blip", l.speaker);
    }
    const target = this.moods;
    for (const [trait] of ROWS) this.shown[trait] += (target[trait] - this.shown[trait]) * 0.12;
  }

  // ------------------------------------------------------------ draw
  draw(ctx: CanvasRenderingContext2D) {
    const enter = easeOutCubic(this.frame / 24);
    this.room.draw(ctx, this.frame);
    vignette(ctx, GAME_W, H);
    const playerTalking = this.line?.speaker === "You";
    this.sprite.draw(ctx, 59 * G, BOX.y + 3 * G, this.frame, playerTalking ? 0.45 : 0, enter);
    this.drawLocation(ctx);
    this.drawDemeanor(ctx, enter);
    this.drawTextbox(ctx, enter);
    if (this.notesOpen) this.drawNotes(ctx);
    if (this.frame < 16) {
      ctx.fillStyle = rgb(INK, 1 - this.frame / 16);
      ctx.fillRect(0, 0, GAME_W, H);
    }
    fx.overlay(ctx, GAME_W, H);
    this.sidePanel(ctx);
  }

  private drawLocation(ctx: CanvasRenderingContext2D) {
    const x = Math.round(MARGIN - (1 - easeOutBack(Math.max(0, this.frame - 6) / 22)) * 460);
    text(ctx, this.room.title.toUpperCase(), x, MARGIN + 13, 40, PARCHMENT, { title: true });
    if (this.time) text(ctx, `Night of the murder  ·  ${this.time}`, x, MARGIN + 52, 18, MIST);
  }

  private drawDemeanor(ctx: CanvasRenderingContext2D, enter: number) {
    const shift = Math.round((1 - enter) * 420);
    const px = PANEL.x + shift;
    nineSlice(ctx, px, PANEL.y, PANEL.w, PANEL.h, FRAME_B, 24, 2, NIGHT);
    const left = px + PAD, right = px + PANEL.w - PAD;
    text(ctx, "DEMEANOR", left, PANEL.y + PAD + HEADER_CAP / 2, 14, AMBER);
    const pipsLeft = right - (5 * PIP_W + 4 * PIP_GAP);
    ROWS.forEach(([trait, label, color], i) => {
      const cy = rowCy(i), cur = this.shown[trait];
      const flashing = !!this.flash[trait] && ((this.flash[trait]! / 5) | 0) % 2 === 0;
      text(ctx, label, left, cy, 20, flashing ? PARCHMENT : MIST);
      const hi = rgb(color.map((c) => Math.min(255, c + 60)) as unknown as RGB);
      for (let p = 0; p < 5; p++) {
        const x = pipsLeft + p * (PIP_W + PIP_GAP), y = cy - PIP_H / 2;
        const fill = Math.max(0, Math.min(1, cur - p));
        ctx.fillStyle = rgb(INK);
        ctx.fillRect(x, y, PIP_W, PIP_H);
        if (fill > 0) {
          ctx.fillStyle = rgb(color);
          ctx.fillRect(x, y, Math.round(PIP_W * fill), PIP_H);
          ctx.fillStyle = hi;
          ctx.fillRect(x, y, Math.round(PIP_W * fill), 4);
        }
        ctx.strokeStyle = rgb(flashing ? PARCHMENT : DUSK);
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, PIP_W - 2, PIP_H - 2);
      }
    });
    // expression chip: hugs its text, right-aligned to the panel, two grid rows below
    const [label, color] = LABELS[this.sprite.shown];
    const cw = 2 * G + 14 + G + measure(ctx, label, 18) + 2 * G, ch = 5 * G;
    const cx = px + PANEL.w - cw, cy = PANEL.y + PANEL.h + 2 * G;
    ctx.fillStyle = rgb(NIGHT);
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = rgb(color);
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
    ctx.fillStyle = rgb(color);
    ctx.beginPath(); ctx.arc(cx + 2 * G + 7, cy + ch / 2, 7, 0, Math.PI * 2); ctx.fill();
    text(ctx, label, cx + 2 * G + 14 + G, cy + ch / 2, 18, color);
  }

  private drawTextbox(ctx: CanvasRenderingContext2D, enter: number) {
    const bx = BOX.x, by = BOX.y + Math.round((1 - enter) * 300);
    nineSlice(ctx, bx, by, BOX.w, BOX.h, FRAME_B, 24, 2, NIGHT, 0.94);
    const left = bx + PAD, right = bx + BOX.w - PAD;
    const speaker = this.line?.speaker ?? this.name;
    const isPlayer = speaker === "You";

    // nameplate straddles the top border; its centre line sits on the gold line
    const plate = image(isPlayer ? PLATE_B : PLATE_A);
    if (plate) {
      const pw = plate.width * 2, ph = plate.height * 2, plx = bx + PAD, ply = by + FRAME / 2 - ph / 2;
      blit(ctx, plate, plx, ply, pw, ph);
      text(ctx, isPlayer ? "DETECTIVE" : speaker.toUpperCase(), plx + pw / 2, by + FRAME / 2, 22, PARCHMENT, { title: true, align: "center" });
      if (!isPlayer) {
        const tw = measure(ctx, this.occupation, 16) + 4 * G, th = 3 * G;
        const tx = plx + pw + G, ty = by + FRAME / 2 - th / 2;
        ctx.fillStyle = rgb(NIGHT);
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeStyle = rgb(DUSK);
        ctx.lineWidth = 2;
        ctx.strokeRect(tx + 1, ty + 1, tw - 2, th - 2);
        text(ctx, this.occupation, tx + tw / 2, by + FRAME / 2, 16, MIST, { align: "center", shadow: false });
      }
    }

    // dialogue: first line one grid row under the nameplate
    const ty = by + PAD + G;
    if (this.line && this.line.text) {
      const shown = this.line.text.slice(0, this.line.shown | 0);
      if (this.wrapped.text !== shown) this.wrapped = { text: shown, lines: wrap(ctx, shown, TEXT_SIZE, right - left).slice(0, 3) };
      const color = isPlayer ? PLAYER_TEXT : PARCHMENT;
      this.wrapped.lines.forEach((ln, i) => text(ctx, ln, left, ty + LINE_H / 2 + i * LINE_H, TEXT_SIZE, color));
    } else if (this.sprite.thinking) text(ctx, "...", left, ty + LINE_H / 2, TEXT_SIZE, MIST);

    // input row pinned to the bottom content edge, divider two grid rows above it
    const rowY = by + BOX.h - PAD - INPUT_H / 2;
    const divY = rowY - INPUT_H / 2 - 2 * G;
    ctx.fillStyle = rgb(DUSK);
    ctx.fillRect(left, divY - 1, right - left, 2);
    if (this.line && this.lineDone() && !this.sprite.thinking && !isPlayer && !this.waiting) {
      const bob = ((this.frame / 14) | 0) % 2 ? 3 : 0, ax = right - 18, ay = divY - 2 * G - 12 + bob;
      ctx.fillStyle = rgb(AMBER);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 18, ay); ctx.lineTo(ax + 9, ay + 12); ctx.fill();
    }
    const busy = this.waiting || this.sprite.thinking;
    text(ctx, ">", left, rowY, 22, AMBER);
    const ix = left + 3 * G, q = typed();
    if (q) text(ctx, q, ix, rowY, 22, PARCHMENT);
    else text(ctx, busy ? `${this.name} is thinking...` : `Ask ${this.name} anything...`, ix + 18, rowY, 22, DUSK, { shadow: false });
    if (!busy && ((this.frame / 20) | 0) % 2 === 0) {
      ctx.fillStyle = rgb(AMBER);
      ctx.fillRect(ix + (q ? measure(ctx, q, 22) : 0) + 2, rowY - 11, 10, 22);
    }
    text(ctx, "ENTER ask   ·   TAB notes   ·   ESC leave", right, rowY, 14, MIST, { align: "right", shadow: false });
  }

  private drawNotes(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = rgb(INK, 200 / 255);
    ctx.fillRect(0, 0, GAME_W, H);
    const px = 176, py = 72, pw = 1048, ph = 760;
    nineSlice(ctx, px, py, pw, ph, FRAME_A, 40, 1, NIGHT, 0.96);
    text(ctx, `NOTES  ·  ${this.name.toUpperCase()}`, px + 64, py + 64, 30, AMBER, { title: true });
    const rows: [string, string, boolean][] = [];
    for (const [who, msg] of session.transcript(this.name)) {
      wrap(ctx, msg, 20, pw - 280).forEach((ln, j) => rows.push([j === 0 ? who : "", ln, who === "You"]));
      rows.push(["", "", false]);
    }
    const visible = 17;
    const end = Math.max(0, rows.length - this.notesScroll);
    const start = Math.max(0, end - visible);
    this.notesScroll = rows.length - end;
    let y = py + 120;
    for (const [who, ln, mine] of rows.slice(start, end)) {
      if (who) text(ctx, who, px + 64, y, 20, mine ? FROST : AMBER);
      if (ln) text(ctx, ln, px + 208, y, 20, mine ? PLAYER_TEXT : PARCHMENT);
      y += 34;
    }
    if (!rows.length) text(ctx, "Nothing said yet.", px + 64, y, 20, MIST);
    text(ctx, "scroll to read back  ·  TAB to close", px + pw / 2, py + ph - 48, 16, DUSK, { align: "center", shadow: false });
  }
}
