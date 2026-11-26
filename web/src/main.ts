import { show, start, tick } from "./app";
import { BACKGROUND_IMAGES } from "./kit/background";
import { initInput } from "./kit/input";
import { BUTTONS, FRAME_A, FRAME_B, FRAME_D, PLATE_A, PLATE_B, PORTRAITS, loadFonts, loadImages } from "./kit/style";
import { BoardScreen } from "./screens/board";
import { RESULT_RIGHT, RESULT_WRONG } from "./screens/modal";
import { InterrogationScreen } from "./screens/interrogation";
import { suspectBoard } from "./screens/suspectBoard";
import { TitleScreen } from "./screens/title";
import * as session from "./session";

const side = (ctx: CanvasRenderingContext2D) => suspectBoard.draw(ctx);

let boardScreen: BoardScreen | null = null;
function board(): BoardScreen {
  boardScreen ??= new BoardScreen((name) => show(new InterrogationScreen(name, () => show(board()), side)), side);
  return boardScreen;
}

async function boot() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  initInput(canvas, document.getElementById("ask") as HTMLInputElement);
  await Promise.all([
    loadFonts(),
    loadImages([FRAME_A, FRAME_B, FRAME_D, PLATE_A, PLATE_B, BUTTONS, RESULT_RIGHT, RESULT_WRONG,
      ...BACKGROUND_IMAGES, ...Object.values(PORTRAITS)]),
  ]);
  session.onDeal((g) => suspectBoard.load(g));
  tick(() => suspectBoard.update());
  if (import.meta.env.DEV) (window as unknown as { __blySuspects: typeof suspectBoard }).__blySuspects = suspectBoard;
  start(canvas);
  show(new TitleScreen(() => show(board()), side));
}

void boot();
