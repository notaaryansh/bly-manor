// Shared look: palette, fonts, images, nine-slice frames and pixel text.
//
// Built for weak devices (think a fridge's browser): only SMALL source images
// are kept in memory and everything is scaled while drawing. No per-size or
// full-screen caches, and nothing here allocates during a normal frame.

export type RGB = readonly [number, number, number];

// Pulled from the Oak Woods night forest: plum shadows, amber firelight.
export const INK: RGB = [18, 14, 26];
export const NIGHT: RGB = [31, 24, 43];
export const PLUM: RGB = [58, 40, 72];
export const DUSK: RGB = [92, 70, 110];
export const MIST: RGB = [186, 172, 200];
export const PARCHMENT: RGB = [244, 232, 208];
export const AMBER: RGB = [247, 172, 66];
export const EMBER: RGB = [226, 92, 60];
export const BLOOD: RGB = [170, 36, 52];
export const FROST: RGB = [110, 168, 232];
export const MOSS: RGB = [120, 200, 120];
export const ROSE: RGB = [232, 120, 168];
export const RIVAL: RGB = [176, 120, 232];

export const RELATIONSHIP_COLORS: Record<string, RGB> = {
  "Close Friend": MOSS,
  Friend: MOSS,
  "Romantic Partner": ROSE,
  Romantic: ROSE,
  "Business Partner": FROST,
  Rival: RIVAL,
  Enemy: EMBER,
  Acquaintance: MIST,
  "Family Member": AMBER,
};

// colour strings are built once per colour, not every draw call
const cssCache = new Map<string, string>();
export function rgb(c: RGB, a = 1): string {
  const key = `${c[0]},${c[1]},${c[2]},${a}`;
  let s = cssCache.get(key);
  if (!s) {
    s = a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    cssCache.set(key, s);
  }
  return s;
}
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const shade = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];

export const PORTRAITS: Record<string, string> = {
  James: "assets/potrait/PNG/Transperent/Icon1.png",
  Emma: "assets/potrait/PNG/Transperent/Icon2.png",
  Nick: "assets/potrait/PNG/Transperent/Icon5.png",
  Lisa: "assets/potrait/PNG/Transperent/Icon7.png",
  Sarah: "assets/potrait/PNG/Transperent/Icon14.png",
  David: "assets/potrait/PNG/Transperent/Icon39.png",
};

export const FRAME_A = "assets/dialogue_box/20240707dragon9SlicesA.png";
export const FRAME_B = "assets/dialogue_box/20240707dragon9SlicesB.png";
export const FRAME_D = "assets/dialogue_box/20240707dragon9SlicesD.png";
export const PLATE_A = "assets/dialogue_box/20240707dragonHeaderA.png";
export const PLATE_B = "assets/dialogue_box/20240707dragonHeaderB.png";
export const BUTTONS = "assets/dialogue_box/20240709dragonButtonA-Sheet.png";

// ------------------------------------------------------------------ canvases
export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// ------------------------------------------------------------------ images
type Source = HTMLImageElement | HTMLCanvasElement;
const images = new Map<string, HTMLImageElement | null>();
const small = new Map<string, HTMLCanvasElement>(); // derived SMALL images only (recolours, sheet frames)

export function loadImages(paths: string[]): Promise<void> {
  return Promise.all(
    paths.map(
      (p) =>
        new Promise<void>((done) => {
          const img = new Image();
          img.onload = () => (images.set(p, img), done());
          img.onerror = () => (images.set(p, null), done()); // licensed packs may be missing
          img.src = "/" + p;
        }),
    ),
  ).then(() => undefined);
}

export const image = (path: string): HTMLImageElement | null => images.get(path) ?? null;

/** Draw a small image scaled with nearest-neighbour. Returns false when it isn't available. */
export function blit(ctx: CanvasRenderingContext2D, src: Source | null, x: number, y: number, w: number, h: number) {
  if (!src) return false;
  ctx.drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  return true;
}

/** Frames of a horizontal sprite sheet, each cropped to its visible pixels (tiny, kept once). */
export function sheetFrames(path: string, count: number): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const src = image(path);
  if (!src) return out;
  for (let i = 0; i < count; i++) {
    const key = `sheet:${path}:${i}`;
    let c = small.get(key);
    if (!c) {
      const fw = src.width / count;
      const [tmp, tctx] = makeCanvas(fw, src.height);
      tctx.drawImage(src, i * fw, 0, fw, src.height, 0, 0, fw, src.height);
      const b = opaqueBounds(tctx, fw, src.height);
      let ctx;
      [c, ctx] = makeCanvas(b.w, b.h);
      ctx.drawImage(tmp, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      small.set(key, c);
    }
    out.push(c);
  }
  return out;
}

function opaqueBounds(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ------------------------------------------------------------------ fonts
export async function loadFonts() {
  const faces = [
    new FontFace("RasterForge", "url(/assets/raster-forge-font/RasterForgeRegular-JpBgm.ttf)"),
    new FontFace("GeistPixel", "url(/assets/fonts/GeistPixel-Square.ttf)"),
  ];
  await Promise.all(faces.map(async (f) => {
    try {
      document.fonts.add(await f.load());
    } catch {
      /* falls back to monospace */
    }
  }));
}

const fontCache = new Map<number, string>();
export function font(size: number, title = false): string {
  const key = title ? -size : size;
  let f = fontCache.get(key);
  if (!f) {
    f = `${size}px ${title ? '"RasterForge"' : '"GeistPixel"'}, monospace`;
    fontCache.set(key, f);
  }
  return f;
}

// ------------------------------------------------------------------ text
export type Align = "left" | "center" | "right";
export interface TextOpts {
  title?: boolean;
  shadow?: boolean;
  align?: Align;
  alpha?: number;
}

const capCache = new Map<string, number>();
function capHeight(ctx: CanvasRenderingContext2D, f: string) {
  let h = capCache.get(f);
  if (h === undefined) {
    const prev = ctx.font;
    ctx.font = f;
    h = ctx.measureText("H").actualBoundingBoxAscent;
    ctx.font = prev;
    capCache.set(f, h);
  }
  return h;
}

/** Half the cap height: offset from a text's centre line to its capitals' top. */
export const halfCap = (ctx: CanvasRenderingContext2D, size: number, title = false) => capHeight(ctx, font(size, title)) / 2;

/**
 * Text whose CAP HEIGHT is centred on cy, so rows of mixed fonts and sizes
 * share one visual centre line. x is the left, centre or right edge.
 * Returns the drawn width.
 */
export function text(ctx: CanvasRenderingContext2D, msg: string, x: number, cy: number, size: number, color: RGB, o?: TextOpts) {
  const f = font(size, o?.title);
  const baseline = Math.round(cy + capHeight(ctx, f) / 2);
  const alpha = o?.alpha ?? 1;
  ctx.font = f;
  ctx.textAlign = o?.align ?? "left";
  ctx.textBaseline = "alphabetic";
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (o?.shadow ?? true) {
    ctx.fillStyle = rgb(INK);
    ctx.fillText(msg, Math.round(x) + 2, baseline + 2);
  }
  ctx.fillStyle = rgb(color);
  ctx.fillText(msg, Math.round(x), baseline);
  if (alpha < 1) ctx.globalAlpha = 1;
  return ctx.measureText(msg).width;
}

export function measure(ctx: CanvasRenderingContext2D, msg: string, size: number, title = false) {
  ctx.font = font(size, title);
  return ctx.measureText(msg).width;
}

export function wrap(ctx: CanvasRenderingContext2D, msg: string, size: number, maxWidth: number, title = false) {
  ctx.font = font(size, title);
  const lines: string[] = [];
  for (const para of msg.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

// ------------------------------------------------------------------ frames
// Interior colours of the Dragon Regalia frames, swapped for our own fill.
const FRAME_INTERIOR: RGB[] = [[69, 94, 177], [67, 147, 214], [244, 161, 58], [93, 153, 196], [136, 184, 196]];

/** The frame's small source image with its interior recoloured (a few KB, kept once per fill). */
function recolored(path: string, fill: RGB, alpha: number): HTMLCanvasElement | null {
  const key = `recolor:${path}:${fill}:${alpha}`;
  let c = small.get(key);
  if (c) return c;
  const src = image(path);
  if (!src) return null;
  let ctx;
  [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    for (const k of FRAME_INTERIOR) {
      if (Math.abs(d[i] - k[0]) < 10 && Math.abs(d[i + 1] - k[1]) < 10 && Math.abs(d[i + 2] - k[2]) < 10) {
        d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = Math.round(alpha * 255);
        break;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  small.set(key, c);
  return c;
}

/**
 * A framed panel drawn straight from the small source in 9 pieces, so any size
 * costs no extra memory. border = corner size in source pixels.
 */
export function nineSlice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  path: string, border: number, scale = 2, fill: RGB = NIGHT, alpha = 0.92) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const src = recolored(path, fill, alpha);
  if (!src) {
    ctx.fillStyle = rgb(fill);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rgb(AMBER);
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    return;
  }
  const sw = src.width, sh = src.height, b = border, db = b * scale;
  const cx = [0, b, sw - b], cw = [b, sw - 2 * b, b], dx = [0, db, w - db], dw = [db, w - 2 * db, db];
  const cy = [0, b, sh - b], ch = [b, sh - 2 * b, b], dy = [0, db, h - db], dh = [db, h - 2 * db, db];
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 3; k++)
      if (dw[k] > 0 && dh[r] > 0) ctx.drawImage(src, cx[k], cy[r], cw[k], ch[r], x + dx[k], y + dy[r], dw[k], dh[r]);
}

// ------------------------------------------------------------------ portraits
let silhouetteSrc: HTMLCanvasElement | null = null;
function silhouette64(): HTMLCanvasElement {
  if (silhouetteSrc) return silhouetteSrc;
  const [s, sx] = makeCanvas(64, 64);
  const body = "rgb(44,32,58)";
  sx.fillStyle = body;
  sx.beginPath(); sx.ellipse(32, 60, 24, 20, 0, 0, Math.PI * 2); sx.fill();
  sx.fillRect(26, 30, 12, 14);
  sx.beginPath(); sx.ellipse(32, 23, 13, 15, 0, 0, Math.PI * 2); sx.fill();
  sx.strokeStyle = "rgb(120,92,140)";
  sx.stroke();
  sx.font = font(14, true);
  sx.fillStyle = rgb(DUSK);
  sx.textAlign = "center";
  sx.textBaseline = "middle";
  sx.fillText("?", 32, 24);
  return (silhouetteSrc = s);
}

/** The 64px portrait source (or a silhouette when the art pack isn't installed). */
export const portraitSource = (name: string): Source => image(PORTRAITS[name] ?? "") ?? silhouette64();

export function drawPortrait(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number) {
  blit(ctx, portraitSource(name), x, y, size, size);
}

// ------------------------------------------------------------------ vignette
let vignetteSrc: HTMLCanvasElement | null = null;
/** Dark edges, drawn from a 64x40 source stretched smoothly: ~10 KB instead of a full-screen copy. */
export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!vignetteSrc) {
    const [c, vctx] = makeCanvas(64, 40);
    const img = vctx.createImageData(64, 40);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 64; x++) {
        const d = Math.min(1, Math.hypot((x - 31.5) / 32, (y - 19.5) / 20));
        img.data.set([INK[0], INK[1], INK[2], Math.round(170 * d ** 2.2)], (y * 64 + x) * 4);
      }
    vctx.putImageData(img, 0, 0);
    vignetteSrc = c;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(vignetteSrc, 0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
}
