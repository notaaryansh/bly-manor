// Tiny synthesized sound effects (no audio files). Each sound is rendered once
// into a short mono buffer; voice pitches reuse one buffer via playbackRate.
// Browsers only allow audio after a user gesture, so unlock() runs on the first key or click.

import { startAmbience } from "./ambience";

let ac: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

const VOICE_PITCH: Record<string, number> = {
  Nick: 220, Sarah: 392, James: 196, Emma: 330, David: 247, Lisa: 440, You: 294,
};

type Wave = "square" | "tri" | "sine";

function tone(name: string, freq: number, ms: number, vol: number, wave: Wave, slide = 0, noise = 0) {
  if (!ac || buffers.has(name)) return;
  const n = Math.floor((ac.sampleRate * ms) / 1000);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (freq * (1 + slide * t)) / ac.sampleRate;
    let s = wave === "square" ? ((phase % 1) < 0.5 ? 1 : -1) : wave === "tri" ? 4 * Math.abs((phase % 1) - 0.5) - 1 : Math.sin(2 * Math.PI * phase);
    if (noise) s = s * (1 - noise) + (Math.random() * 2 - 1) * noise;
    d[i] = vol * s * Math.min(1, i / 60) * (1 - t) ** 1.6;
  }
  buffers.set(name, buf);
}

export function unlock() {
  if (ac) {
    if (ac.state === "suspended") void ac.resume();
    return;
  }
  try {
    ac = new AudioContext();
  } catch {
    return; // no audio on this device: every play() is a no-op
  }
  tone("blip", 300, 28, 0.1, "square");
  tone("thud", 70, 260, 0.45, "sine", -0.5, 0.25);
  tone("sting", 660, 140, 0.18, "square", 0.6);
  tone("whisper", 900, 90, 0.07, "sine", -0.3, 0.6);
  tone("select", 520, 60, 0.12, "tri", 0.4);
  tone("open", 260, 180, 0.14, "tri", 0.8);
  tone("gavel", 55, 400, 0.6, "sine", -0.6, 0.35);
  thunder();
  startAmbience(ac);
}

/** A small, distant roll of thunder: low brown noise with a few swells, 2.5s at 11 kHz (~110 KB). */
function thunder() {
  if (!ac) return;
  const rate = 11025, n = (rate * 2.5) | 0;
  const buf = ac.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    last = (last + 0.04 * (Math.random() * 2 - 1)) * 0.995;
    const env = Math.min(1, t / 0.06) * (1 - t) ** 2.2 * (0.65 + 0.35 * Math.abs(Math.sin(t * 9)));
    d[i] = last * 6 * env;
  }
  buffers.set("thunder", buf);
}

export function play(name: string, speaker?: string, delay = 0) {
  const buf = buffers.get(name);
  if (!ac || !buf) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  if (name === "blip") {
    const base = VOICE_PITCH[speaker ?? ""] ?? 300;
    src.playbackRate.value = (base / 300) * [1, 1.06, 0.94][(Math.random() * 3) | 0];
  }
  if (name === "thunder") {
    const g = ac.createGain();
    g.gain.value = 0.25; // small and far away
    src.connect(g).connect(ac.destination);
  } else src.connect(ac.destination);
  src.start(ac.currentTime + delay);
}
