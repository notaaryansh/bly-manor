// Mouse, keys and typing, mapped into the canvas's 1800x900 coordinates.
// Typing goes through a hidden <input> so phones/TVs get a real keyboard and
// paste, IME and backspace-repeat all work for free.

import { isMuted, toggleMute } from "./ambience";
import { fx } from "./fx";
import { unlock } from "./sound";

export const W = 1800;
export const H = 900;
export const GAME_W = 1400; // the suspects board takes the 400px on the right

export interface Handlers {
  key?(e: KeyboardEvent): void;
  click?(x: number, y: number): void;
  wheel?(dy: number): void;
}

export const mouse = { x: -1, y: -1 };
let field: HTMLInputElement;
let target: Handlers | null = null;

export function routeTo(h: Handlers | null) {
  target = h;
}

export function initInput(canvas: HTMLCanvasElement, input: HTMLInputElement) {
  field = input;
  const toGame = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  canvas.addEventListener("mousemove", (e) => {
    [mouse.x, mouse.y] = toGame(e);
  });
  canvas.addEventListener("mouseleave", () => {
    mouse.x = mouse.y = -1;
  });
  canvas.addEventListener("mousedown", (e) => {
    unlock();
    const [x, y] = toGame(e);
    [mouse.x, mouse.y] = [x, y];
    target?.click?.(x, y);
    if (document.activeElement === field) e.preventDefault(); // keep typing focus
  });
  canvas.addEventListener("wheel", (e) => {
    target?.wheel?.(Math.sign(e.deltaY));
    e.preventDefault();
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    unlock();
    if (e.key === "Tab") e.preventDefault();
    if ((e.key === "m" || e.key === "M") && !isTyping()) {
      toggleMute();
      fx.toast(isMuted() ? "Sound off. M to turn it back on." : "Sound on.");
      return;
    }
    target?.key?.(e);
  });
}

/** Start collecting typed text (the question box). */
export function startTyping(maxLength = 120) {
  field.maxLength = maxLength;
  field.value = "";
  field.focus({ preventScroll: true });
}
export function stopTyping() {
  field.blur();
  field.value = "";
}
export const typed = () => field.value;
export function clearTyped() {
  field.value = "";
}
export const isTyping = () => document.activeElement === field;
