import { show, start } from "./app";
import { BACKGROUND_IMAGES } from "./kit/background";
import { initInput } from "./kit/input";
import { BUTTONS, FRAME_A, FRAME_B, FRAME_D, PLATE_A, PLATE_B, PORTRAITS, loadFonts, loadImages } from "./kit/style";
import { BoardScreen, plainSidePanel } from "./screens/board";
import { RESULT_RIGHT, RESULT_WRONG } from "./screens/modal";
import { InterrogationScreen } from "./screens/interrogation";
import { TitleScreen } from "./screens/title";

let boardScreen: BoardScreen | null = null;
function board(): BoardScreen {
  boardScreen ??= new BoardScreen((name) => show(new InterrogationScreen(name, () => show(board()), plainSidePanel)), plainSidePanel);
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
  start(canvas);
  show(new TitleScreen(() => show(board())));
}

void boot();
