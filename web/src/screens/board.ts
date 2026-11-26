// The case board: suspects, the case file, accusations and the verdict.
// Layout sits on the same 8px grid as the pygame version: 48px margins, a
// 240px case-file column, a 3x2 card grid with 32px gutters.

import { accuse, logs as fetchLogs, type Verdict } from "../api";
import type { Screen } from "../app";
import { drawBackground, updateBackground } from "../kit/background";
import { easeOutBack, fx } from "../kit/fx";
import { GAME_W, H, W, mouse } from "../kit/input";
import { setMood } from "../kit/ambience";
import { play } from "../kit/sound";
import {
  AMBER, BLOOD, INK, MIST, MOSS, PARCHMENT, rgb, text, vignette,
} from "../kit/style";
import * as session from "../session";
import { Modal, RESULT_RIGHT, RESULT_WRONG } from "./modal";
import { Tutorial, type Rect } from "./tutorial";
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
  private tour = new Tutorial();
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
        if (!session.game!.accused && !this.seenBriefing) this.startTour(false);
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
    return [this.facts, this.logs, this.results].find((m) => m.open) ?? null;
  }

  /** The case intro, then (first time, or on H) a spotlight tour of the board. */
  private startTour(force: boolean) {
    const g = session.game!;
    const pad = (r: Rect, p = 12): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
    const button = (label: string) => () => {
      const b = this.buttons.find((x) => x.label === label)!;
      return pad({ x: b.x, y: b.y, w: b.w, h: b.h }, 8);
    };
    const cards = () => {
      const xs = this.cards.map((c) => c.x), ys = this.cards.map((c) => c.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return pad({ x, y, w: Math.max(...xs) + CARD_W - x, h: Math.max(...ys) + CARD_H - y }, 16);
    };
    const time = g.time_of_death.split("(")[0].trim().toLowerCase();
    this.tour.begin(
      {
        title: "A MURDER AT BLY MANOR",
        body: `${g.victim} was found dead in ${g.crime_location.toLowerCase()}, ${time}. Six people were in the house that night. One of the five still breathing did it.\n\nYour job: question them, catch the lies, and name the killer.`,
      },
      [
        { title: "THE SUSPECTS", body: "Click anyone to question them in their room. Ask whatever you want, in your own words. They answer as themselves, and every one of them is hiding something.", target: cards },
        { title: "WHO TALKS TO WHO", body: "When you leave a room, they gossip. Watch the light run down the string from whoever's talking to whoever's listening. What they hear changes how they treat you.", target: () => ({ x: GAME_W + 8, y: 8, w: W - GAME_W - 16, h: H - 16 }) },
        { title: "FACTS", body: "What's known about the case: the victim, where and when, and the clues found so far.", target: button("FACTS") },
        { title: "LOGS", body: "Your notes on every interview, written up as you go.", target: button("LOGS") },
        { title: "ACCUSE", body: "When you're sure, accuse. You only get one shot, so make it count.", target: button("ACCUSE") },
        { title: "IN THE ROOM", body: "Watch their face and the Nerves, Temper and Trust meters. Push too hard and they crack, be decent and they open up. TAB shows your notes, ESC leaves the room, H brings this tour back." },
      ],
      force,
    );
  }

  enter() {
    setMood("calm");
    fx.showToasts = true;
    if (session.game) this.layout();
  }

  update() {
    this.frame++;
    updateBackground(GAME_W);
    this.tour.update();
    const free = !this.modal && !this.verdict && !this.tour.active;
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
    if (this.tour.active) return this.tour.key(e);
    if ((e.key === "h" || e.key === "H") && !this.loading && !this.modal && !this.verdict) return this.startTour(true);
    if (e.key !== "Escape") return;
    const m = this.modal;
    if (m) m.close();
    else if (this.accusing) this.accusing = false;
  }

  wheel(dy: number) {
    this.modal?.wheel(dy);
  }

  click(x: number, y: number) {
    if (this.tour.active) return this.tour.next();
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
      const last = this.buttons[this.buttons.length - 1];
      text(ctx, "H  how to play", MENU_X, last.y + last.h + 32, 14, MIST, { shadow: false });
      for (const c of this.cards) c.draw(ctx);
      if (this.accusing) this.drawBanner(ctx);
    }

    this.facts.draw(ctx);
    this.logs.draw(ctx);
    this.results.draw(ctx);
    if (this.verdict) this.drawVerdict(ctx);
    fx.overlay(ctx, GAME_W, H);
    this.sidePanel(ctx);
    this.tour.draw(ctx);
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
