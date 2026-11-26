import { newGame, type GameState } from "./api";
import { show, start, type Screen } from "./app";
import { BACKGROUND_IMAGES, drawBackground, updateBackground } from "./kit/background";
import { fx } from "./kit/fx";
import { GAME_W, H, initInput } from "./kit/input";
import {
  AMBER, BUTTONS, FRAME_A, FRAME_B, FRAME_D, INK, MIST, PARCHMENT, PLATE_A, PLATE_B, PORTRAITS,
  loadFonts, loadImages, rgb, text,
} from "./kit/style";
import { TitleScreen } from "./screens/title";

// ?test=1 plays the fixed practice case; ?calm=1 turns off chaos gossip
const params = new URLSearchParams(location.search);
const TEST = params.get("test") === "1";
const CHAOS = params.get("calm") !== "1";

/** Placeholder until the case board lands: shows the case the server dealt. */
class CaseScreen implements Screen {
  private game: GameState | null = null;
  private error = "";
  private frame = 0;
  constructor() {
    newGame(TEST, CHAOS).then((g) => (this.game = g), (e) => (this.error = String(e)));
  }
  update() {
    this.frame++;
    updateBackground(GAME_W);
  }
  draw(ctx: CanvasRenderingContext2D) {
    drawBackground(ctx, GAME_W, H);
    ctx.fillStyle = rgb(INK, 0.6);
    ctx.fillRect(0, 0, GAME_W, H);
    if (this.error) text(ctx, `The manor's doors won't open: ${this.error}`, GAME_W / 2, H / 2, 20, AMBER, { align: "center" });
    else if (!this.game) text(ctx, "Dealing the case" + ".".repeat(1 + ((this.frame / 20) | 0) % 3), GAME_W / 2, H / 2, 24, MIST, { align: "center" });
    else {
      const g = this.game;
      text(ctx, `${g.victim.toUpperCase()} IS DEAD`, GAME_W / 2, 360, 48, PARCHMENT, { title: true, align: "center" });
      const names = g.suspects.filter((s) => !s.is_victim).map((s) => s.name).join(" · ");
      text(ctx, names, GAME_W / 2, 430, 22, MIST, { align: "center" });
    }
    fx.overlay(ctx, GAME_W, H);
    ctx.fillStyle = rgb([40, 26, 22]);
    ctx.fillRect(GAME_W, 0, 1800 - GAME_W, H);
  }
}

async function boot() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  initInput(canvas, document.getElementById("ask") as HTMLInputElement);
  await Promise.all([
    loadFonts(),
    loadImages([FRAME_A, FRAME_B, FRAME_D, PLATE_A, PLATE_B, BUTTONS, ...BACKGROUND_IMAGES, ...Object.values(PORTRAITS)]),
  ]);
  start(canvas);
  show(new TitleScreen(() => show(new CaseScreen())));
}

void boot();
