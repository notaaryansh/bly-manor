// Parallax night forest (the licensed Oak Woods pack). Without the pack it's a
// plain night sky. Layers are drawn straight from their small sources each frame.

import { blit, image, rgb } from "./style";

const LAYERS = [1, 2, 3].map((n) => `assets/oak_woods_v1.0/background/background_layer_${n}.png`);
export const BACKGROUND_IMAGES = LAYERS;

let off2 = 0;
let off3 = 0;

export function updateBackground(w: number) {
  off2 = (off2 + 0.3) % w;
  off3 = (off3 + 0.5) % w;
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!blit(ctx, image(LAYERS[0]), 0, 0, w, h)) {
    ctx.fillStyle = rgb([20, 24, 38]);
    ctx.fillRect(0, 0, w, h);
  }
  for (const [path, off] of [[LAYERS[1], off2], [LAYERS[2], off3]] as const) {
    const img = image(path);
    if (!img) continue;
    blit(ctx, img, -off, 0, w, h);
    if (off > 0) blit(ctx, img, w - off, 0, w, h);
  }
}
