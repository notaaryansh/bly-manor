// Soft rain and a slow, moody score, all synthesized (royalty-free by
// construction, nothing to download). Built light: the rain is one second of
// noise at a low sample rate looped through filters, and the music schedules a
// few oscillators at a time a moment ahead of when they play.

type Mood = "storm" | "calm" | "tense";

// chord roots (Hz) and qualities for each mood; one chord every CHORD seconds
const A2 = 110, C3 = 130.81, D3 = 146.83, E3 = 164.81, F2 = 87.31, G2 = 98;
const PROGRESSIONS: Record<Mood, [number, "min" | "maj"][]> = {
  storm: [[A2, "min"], [F2, "maj"], [C3, "maj"], [G2, "maj"]],
  calm: [[A2, "min"], [F2, "maj"], [C3, "maj"], [G2, "maj"]],
  tense: [[A2, "min"], [D3 / 2, "min"], [E3 / 2, "maj"], [A2, "min"]],
};
const CHORD = 7;
const MUTE_KEY = "bly-muted";

let ac: AudioContext | null = null;
let master: GainNode, rainGain: GainNode, musicGain: GainNode, echo: DelayNode, rainFilter: BiquadFilterNode;
let mood: Mood = "storm";
let analyser: AnalyserNode | null = null;
let nextChord = 0;
let chordIndex = 0;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* private mode: just not remembered */
}

/** Called once audio is allowed (first key or click). */
export function startAmbience(ctx: AudioContext) {
  if (ac) return;
  ac = ctx;
  master = ac.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ac.destination);
  if (import.meta.env.DEV) {
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
  }

  // rain: a real recording (CC0, 12s mono loop, ~97 KB). Synthesized rain is
  // only the fallback when the file can't load.
  rainFilter = ac.createBiquadFilter();
  rainFilter.type = "lowpass";
  rainFilter.frequency.value = 7000;
  rainGain = ac.createGain();
  rainGain.gain.value = 0;
  rainFilter.connect(rainGain).connect(master);
  loadRain(ac);

  // music bus with one shared echo
  musicGain = ac.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  echo = ac.createDelay(1);
  echo.delayTime.value = 0.42;
  const feedback = ac.createGain();
  feedback.gain.value = 0.32;
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(musicGain);

  nextChord = ac.currentTime + 0.5;
  setMood(mood);
  window.setInterval(schedule, 400);
}

/** storm on the title, calm on the board, tense in interrogations. */
export function setMood(m: Mood) {
  mood = m;
  if (!ac) return;
  const t = ac.currentTime;
  // very quiet: the rain sits under everything, never on top of it
  const rain = (m === "storm" ? 0.14 : m === "calm" ? 0.08 : 0.1) * rainBoost;
  const music = m === "tense" ? 0.13 : 0.11;
  rainGain.gain.setTargetAtTime(rain, t, 1.2);
  musicGain.gain.setTargetAtTime(music, t, 1.5);
  // indoors the rain is on the other side of the window: duller, not quieter
  rainFilter.frequency.setTargetAtTime(m === "tense" ? 1600 : m === "calm" ? 5000 : 7000, t, 1);
}

// the recording is normalised quieter than the synth, so it gets a fixed lift
let rainBoost = 1;

async function loadRain(ctx: AudioContext) {
  let buf: AudioBuffer;
  try {
    const res = await fetch("/assets/audio/rain.mp3");
    if (!res.ok) throw new Error(String(res.status));
    buf = await ctx.decodeAudioData(await res.arrayBuffer());
    rainBoost = 2.5;
  } catch {
    buf = rainBuffer(ctx);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // some browsers pad decoded MP3s with a few ms of silence: loop inside it
  const d = buf.getChannelData(0);
  let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < 0.002) a++;
  while (b > a && Math.abs(d[b]) < 0.002) b--;
  src.loopStart = a / buf.sampleRate;
  src.loopEnd = (b + 1) / buf.sampleRate;
  src.connect(rainFilter);
  src.start(0, src.loopStart);
  setMood(mood);
}

/**
 * Fallback rain = a soft hiss plus many tiny droplet ticks of random size, and a few
 * brighter plinks. Left and right are different so it surrounds you.
 */
function rainBuffer(ctx: AudioContext) {
  const rate = 22050, seconds = 2, n = rate * seconds;
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const swell = 0.85 + 0.15 * Math.sin((2 * Math.PI * i) / n); // one slow swell per loop, seamless
      d[i] = (Math.random() * 2 - 1) * 0.1 * swell;
    }
    // droplets: ~500 a second, mostly tiny, decaying noise ticks of 2-10 ms
    const drops = 500 * seconds;
    for (let k = 0; k < drops; k++) {
      const at = (Math.random() * n) | 0;
      const amp = 0.05 + 0.45 * Math.random() ** 3;
      const len = (rate * (0.002 + 0.008 * Math.random())) | 0;
      for (let j = 0; j < len; j++) d[(at + j) % n] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * j) / len);
    }
    // a few plinks off the gutters: short bright pitched drops
    for (let k = 0; k < 6 * seconds; k++) {
      const at = (Math.random() * n) | 0, f = 1500 + Math.random() * 2500, len = (rate * 0.03) | 0;
      for (let j = 0; j < len; j++) d[(at + j) % n] += Math.sin((2 * Math.PI * f * j) / rate) * 0.12 * Math.exp((-6 * j) / len);
    }
  }
  return buf;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* not remembered */
  }
  if (ac) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.1);
  return muted;
}
export const isMuted = () => muted;

// ------------------------------------------------------------ the score
function schedule() {
  if (!ac || ac.state !== "running") return;
  while (nextChord < ac.currentTime + 1) {
    const prog = PROGRESSIONS[mood];
    const [root, quality] = prog[chordIndex % prog.length];
    pad(root, quality, nextChord);
    // sparse music-box notes over the chord, more of them when it's tense
    const tones = [root * 4, root * 4 * (quality === "min" ? 1.189 : 1.26), root * 6, root * 8];
    const count = mood === "tense" ? 5 : 3;
    for (let i = 0; i < count; i++) if (Math.random() < 0.7) bell(tones[(Math.random() * tones.length) | 0], nextChord + 0.6 + i * (CHORD / count));
    if (Math.random() < 0.3) drip(nextChord + Math.random() * CHORD);
    nextChord += CHORD;
    chordIndex++;
  }
}

function pad(root: number, quality: "min" | "maj", at: number) {
  const third = quality === "min" ? 1.189 : 1.26;
  const filter = ac!.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mood === "tense" ? 600 : 850;
  const env = ac!.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(0.16, at + 2.2);
  env.gain.setValueAtTime(0.16, at + CHORD - 1.5);
  env.gain.linearRampToValueAtTime(0, at + CHORD + 1.5);
  filter.connect(env).connect(musicGain);
  for (const [f, detune] of [[root, -6], [root * third, 5], [root * 1.5, -3], [root / 2, 0]] as [number, number][]) {
    const o = ac!.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(filter);
    o.start(at);
    o.stop(at + CHORD + 1.6);
  }
}

function bell(freq: number, at: number) {
  const o = ac!.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const env = ac!.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(0.09, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0005, at + 2.2);
  o.connect(env);
  env.connect(musicGain);
  env.connect(echo);
  o.start(at);
  o.stop(at + 2.3);
}

/** A single water drop off the eaves. */
function drip(at: number) {
  const o = ac!.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(1800 + Math.random() * 1200, at);
  o.frequency.exponentialRampToValueAtTime(600, at + 0.08);
  const env = ac!.createGain();
  env.gain.setValueAtTime(0.03, at);
  env.gain.exponentialRampToValueAtTime(0.0005, at + 0.1);
  o.connect(env).connect(rainGain);
  o.start(at);
  o.stop(at + 0.12);
}

/** Dev/testing: what the ambience is doing right now. */
export const ambienceState = () => ({
  running: ac?.state ?? "none",
  mood,
  muted,
  rain: ac ? +rainGain.gain.value.toFixed(3) : 0,
  music: ac ? +musicGain.gain.value.toFixed(3) : 0,
  chords: chordIndex,
  bands: bands(),
});

/** Dev: share of output energy per frequency band, to check the rain sounds like rain. */
function bands() {
  if (!analyser || !ac) return null;
  const db = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(db);
  const hz = ac.sampleRate / 2 / db.length;
  const edges = [0, 300, 1000, 3000, 7000, 11000];
  const e = edges.slice(1).map(() => 0);
  db.forEach((v, i) => {
    const f = i * hz, k = edges.findIndex((x, j) => f >= x && f < (edges[j + 1] ?? Infinity));
    if (k >= 0 && k < e.length) e[k] += 10 ** (v / 10);
  });
  const total = e.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(e.map((v, i) => [`${edges[i]}-${edges[i + 1]}Hz`, +(v / total).toFixed(2)]));
}
