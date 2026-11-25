"""
Tiny synthesized sound effects, so the game ships with no audio files.
Every call is a no-op if the machine has no audio device.
"""
import array
import math
import random
import pygame

RATE = 22050
CHANNELS = 1
_ok = None
_cache = {}

# Each suspect "speaks" at their own pitch, like visual-novel text blips.
VOICE_PITCH = {"Nick": 220, "Sarah": 392, "James": 196, "Emma": 330, "David": 247, "Lisa": 440, "You": 294}


def _ready():
    global _ok, RATE, CHANNELS
    if _ok is None:
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(RATE, -16, 1, 256)
            RATE, _, CHANNELS = pygame.mixer.get_init()
            _ok = True
        except pygame.error:
            _ok = False
    return _ok


def _tone(freq, ms, vol=0.25, wave="square", slide=0.0, noise=0.0):
    key = (freq, ms, vol, wave, slide, noise)
    if key in _cache:
        return _cache[key]
    n = int(RATE * ms / 1000)
    buf = array.array("h")
    phase = 0.0
    for i in range(n):
        t = i / n
        f = freq * (1 + slide * t)
        phase += f / RATE
        if wave == "square":
            s = 1.0 if (phase % 1) < 0.5 else -1.0
        elif wave == "tri":
            s = 4 * abs((phase % 1) - 0.5) - 1
        else:
            s = math.sin(2 * math.pi * phase)
        if noise:
            s = s * (1 - noise) + random.uniform(-1, 1) * noise
        env = min(1.0, i / 60) * (1 - t) ** 1.6
        v = int(32767 * vol * s * env)
        for _ in range(CHANNELS):
            buf.append(v)
    snd = pygame.mixer.Sound(buffer=buf.tobytes())
    _cache[key] = snd
    return snd


def play(name, speaker=None):
    if not _ready():
        return
    try:
        if name == "blip":
            base = VOICE_PITCH.get(speaker, 300)
            _tone(base * random.choice((1, 1.06, 0.94)), 28, 0.10).play()
        elif name == "thud":       # big emotional hit
            _tone(70, 260, 0.45, "sine", -0.5, 0.25).play()
        elif name == "sting":      # shock
            _tone(660, 140, 0.18, "square", 0.6).play()
        elif name == "whisper":    # gossip lands
            _tone(900, 90, 0.07, "sine", -0.3, 0.6).play()
        elif name == "select":
            _tone(520, 60, 0.12, "tri", 0.4).play()
        elif name == "open":
            _tone(260, 180, 0.14, "tri", 0.8).play()
        elif name == "gavel":
            _tone(55, 400, 0.6, "sine", -0.6, 0.35).play()
    except pygame.error:
        pass
