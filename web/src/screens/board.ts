// The case board: suspects, the case file, accusations and the verdict.
// Layout sits on the same 8px grid as the pygame version: 48px margins, a
// 240px case-file column, a 3x2 card grid with 32px gutters.

import { accuse, logs as fetchLogs, type Verdict } from "../api";
import type { Screen } from "../app";
import { drawBackground, updateBackground } from "../kit/background";
import { easeOutBack, fx } from "../kit/fx";
import { GAME_W, H, mouse } from "../kit/input";
import { play } from "../kit/sound";
import {
  AMBER, BLOOD, INK, MIST, MOSS, PARCHMENT, rgb, text, vignette,
} from "../kit/style";
import * as session from "../session";
import { Modal, RESULT_RIGHT, RESULT_WRONG } from "./modal";
import { CARD_H, CARD_W, Card, MenuButton } from "./widgets";

const MARGIN = 48, GRID_TOP = 144, MENU_X = MARGIN, MENU_W = 240, GUTTER = 32, PER_ROW = 3;
export const CARDS_LEFT = (() => {
  const regionX = MENU_X + MENU_W + MARGIN;
  const regionW = GAME_W - MARGIN - regionX;
  return regionX + (regionW - (PER_ROW * CARD_W + (PER_ROW - 1) * GUTTER)) / 2;
})();

interface Verdictish { text: string; name: string; color: typeof MOSS; t: number }

export class BoardScreen implements Screen {
  private cards: Card[] = [];
  private buttons: MenuButton[];
  private briefing = new Modal("");
  private facts = new Modal("FACTS");
  private logs = new Modal("LOGS");
  private results = new Modal("");
  private accusing = false;
  private verdict: Verdictish | null = null;
  private pending: Verdict | null = null;
  private loading = true;
  private error = "";
  private frame = 0;

  /** onQuestion opens the interrogation for a suspect. */
  constructor(private onQuestion: (name: string) => void, private sidePanel: (ctx: CanvasRenderingContext2D) => void) {
    const top = GRID_TOP + 40;
    this.buttons = ["FACTS", "LOGS", "ACCUSE"].map((l, i) => new MenuButton(l, MENU_X, top + i * 100));
    const ready = session.game ? Promise.resolve(session.game) : session.deal();
    ready.then(
      () => {
        this.layout();
        this.loading = false;
        if (!session.game!.accused && !this.seenBriefing) this.briefing.show(session.game!.briefing);
        this.seenBriefing = true;
      },
      (e) => (this.error = String(e)),
    );
  }
  private seenBriefing = !!session.game;

  private layout() {
    const people = session.living();
    const stepX = CARD_W + GUTTER, stepY = CARD_H + GUTTER;
    this.cards = people.map((s, i) => {
      const row = (i / PER_ROW) | 0;
      const inRow = Math.min(PER_ROW, people.length - row * PER_ROW);
      const offset = ((PER_ROW - inRow) * stepX) / 2; // a short last row is centred
      return new Card(s, CARDS_LEFT + offset + (i % PER_ROW) * stepX, GRID_TOP + row * stepY);
    });
  }

  private get modal() {
    return [this.briefing, this.facts, this.logs, this.results].find((m) => m.open) ?? null;
  }

  enter() {
    fx.showToasts = true;
    if (session.game) this.layout();
  }

  update() {
    this.frame++;
    updateBackground(GAME_W);
    const free = !this.modal && !this.verdict;
    for (const c of this.cards) {
      if (free) c.hover(mouse.x, mouse.y);
      else c.hovered = false;
      c.visited = !!c.suspect.questioned;
      c.accuseMode = this.accusing;
      c.update();
    }
    for (const b of this.buttons) {
      if (free) b.hover(mouse.x, mouse.y);
      else b.hovered = false;
      b.active = b.danger && this.accusing;
    }
    if (this.verdict && ++this.verdict.t > 110) {
      this.verdict = null;
      if (this.pending) this.results.show(this.pending.lines, this.pending.correct ? RESULT_RIGHT : RESULT_WRONG);
    }
  }

  key(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    const m = this.modal;
    if (m) m.close();
    else if (this.accusing) this.accusing = false;
  }

  wheel(dy: number) {
    this.modal?.wheel(dy);
  }

  click(x: number, y: number) {
    if (this.verdict || this.loading) return;
    const m = this.modal;
    if (m) {
      const c = m.closeRect();
      if (!m.inside(x, y) || (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)) m.close();
      return;
    }
    for (const b of this.buttons) {
      if (!b.contains(x, y)) continue;
      play("select");
      if (b.label === "FACTS") this.facts.show(session.game!.facts);
      else if (b.label === "LOGS") this.openLogs();
      else if (!session.game!.accused) this.accusing = !this.accusing;
      else if (this.pending) this.results.show(this.pending.lines, this.pending.correct ? RESULT_RIGHT : RESULT_WRONG);
      return;
    }
    const card = this.cards.find((c) => c.contains(x, y));
    if (!card) return;
    if (this.accusing) this.accuse(card.suspect.name);
    else if (!session.game!.accused) this.onQuestion(card.suspect.name);
  }

  private openLogs() {
    this.logs.show(["Reading your notes..."]);
    fetchLogs(session.game!.id).then((entries) => {
      const lines: string[] = [];
      for (const [name, notes] of Object.entries(entries)) {
        lines.push(`INTERVIEW WITH ${name.toUpperCase()}`);
        lines.push(...(notes.length ? notes.map((n) => `• ${n}`) : ["• (still writing this up...)"]));
        lines.push("");
      }
      this.logs.show(lines.length ? lines : ["No interviews conducted yet."]);
    }, () => this.logs.show(["Couldn't reach the case file."]));
  }

  private accuse(name: string) {
    this.accusing = false;
    play("gavel");
    fx.shake(0.9);
    fx.zoomPunch(0.06);
    accuse(session.game!.id, name).then((v) => {
      session.game!.accused = name;
      this.pending = v;
      fx.flash(v.correct ? PARCHMENT : BLOOD, 200);
      this.verdict = { text: v.correct ? "GUILTY" : "INNOCENT", name, color: v.correct ? MOSS : BLOOD, t: 0 };
    }, () => fx.toast("The judge didn't show up. Try again.", BLOOD));
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawBackground(ctx, GAME_W, H);
    vignette(ctx, GAME_W, H);

    if (this.loading) {
      const msg = this.error ? `The manor's doors won't open: ${this.error}` : "Dealing the case" + ".".repeat(1 + (((this.frame / 20) | 0) % 3));
      text(ctx, msg, GAME_W / 2, H / 2, 22, this.error ? AMBER : MIST, { align: "center" });
    } else {
      // header: left edge on the first card column, capitals on the top margin
      text(ctx, "MURDER AT BLY MANOR", CARDS_LEFT, MARGIN + 13, 44, PARCHMENT, { title: true });
      text(ctx, "Five suspects. One of them did it. Choose who to question.", CARDS_LEFT, MARGIN + 52, 18, MIST);
      text(ctx, "CASE FILE", MENU_X, GRID_TOP + 6, 14, AMBER);
      for (const b of this.buttons) b.draw(ctx);
      for (const c of this.cards) c.draw(ctx);
      if (this.accusing) this.drawBanner(ctx);
    }

    this.briefing.draw(ctx);
    this.facts.draw(ctx);
    this.logs.draw(ctx);
    this.results.draw(ctx);
    if (this.verdict) this.drawVerdict(ctx);
    fx.overlay(ctx, GAME_W, H);
    this.sidePanel(ctx);
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    // fills exactly the bottom margin, under the card grid
    ctx.fillStyle = rgb(BLOOD, 225 / 255);
    ctx.fillRect(0, H - MARGIN, GAME_W, MARGIN);
    const pulse = 0.75 + 0.25 * Math.sin(this.frame * 0.13);
    const c = PARCHMENT.map((v) => Math.round(v * pulse)) as unknown as typeof PARCHMENT;
    text(ctx, "WHO DID IT?   CLICK THE KILLER   ·   ESC TO BACK OUT", GAME_W / 2, H - MARGIN / 2, 20, c, { title: true, align: "center" });
  }

  private drawVerdict(ctx: CanvasRenderingContext2D) {
    const v = this.verdict!;
    const fade = v.t < 85 ? 1 : 1 - (v.t - 85) / 25;
    ctx.fillStyle = rgb(INK, (200 * fade) / 255);
    ctx.fillRect(0, 0, GAME_W, H);
    const slam = Math.max(1, 3 - v.t / 6);
    text(ctx, v.text, GAME_W / 2, H / 2 - 30, Math.round(110 * slam), v.color, { title: true, align: "center", alpha: fade });
    if (v.t > 18)
      text(ctx, `${v.name} ${v.text === "GUILTY" ? "did it." : "didn't do it."}`, GAME_W / 2, H / 2 + 60, 28, PARCHMENT,
        { align: "center", alpha: fade * easeOutBack((v.t - 18) / 10) });
  }
}
