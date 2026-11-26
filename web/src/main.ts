import { show, start } from "./app";
import { BACKGROUND_IMAGES } from "./kit/background";
import { fx } from "./kit/fx";
import { initInput } from "./kit/input";
import { BUTTONS, FRAME_A, FRAME_B, FRAME_D, PLATE_A, PLATE_B, PORTRAITS, loadFonts, loadImages } from "./kit/style";
import { BoardScreen, plainSidePanel } from "./screens/board";
import { RESULT_RIGHT, RESULT_WRONG } from "./screens/modal";
import { TitleScreen } from "./screens/title";

function board(): BoardScreen {
  return new BoardScreen(() => fx.toast("Interrogations open in the next update."), plainSidePanel);
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
