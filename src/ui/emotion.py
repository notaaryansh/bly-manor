"""
Expressions for suspects, driven by the Anxious / Moody / Trust levels the
agents already track. The same pixel portrait becomes six readable states
through pose, tint and hand-placed pixel emotes (sweat, anger vein, gloom...).
"""
import math
import pygame
from src.ui import style
from src.ui.fx import ease_out_back

NEUTRAL, NERVOUS, IRRITATED, GUARDED, OPEN, SHOCKED = (
    "neutral", "nervous", "irritated", "guarded", "open", "shocked")

LABELS = {
    NEUTRAL: ("Composed", style.MIST),
    NERVOUS: ("Nervous", style.FROST),
    IRRITATED: ("Irritated", style.EMBER),
    GUARDED: ("Guarded", (168, 150, 200)),
    OPEN: ("Opening up", style.MOSS),
    SHOCKED: ("Shaken", style.AMBER),
}


def choose(levels, deltas=None, line=""):
    """Pick the expression for this moment: what just changed beats the resting mood."""
    deltas = deltas or {}
    a, m, t = levels.get("Anxious", 3), levels.get("Moody", 3), levels.get("Trust", 3)
    da, dm, dt = deltas.get("Anxious", 0), deltas.get("Moody", 0), deltas.get("Trust", 0)
    if max(abs(da), abs(dm), abs(dt)) >= 2:
        return SHOCKED
    if dm > 0 or (dt < 0 and dm >= 0 and m >= 3):
        return IRRITATED
    if da > 0:
        return NERVOUS
    if dt > 0 or da < 0:
        return OPEN
    # no change this turn: read the line, then fall back to resting mood
    low = line.lower()
    if line.count("!") >= 2 or "how dare" in low:
        return IRRITATED
    if "..." in line or "i-" in low:
        return NERVOUS
    if m >= 4:
        return IRRITATED
    if a >= 4:
        return NERVOUS
    if t <= 1:
        return GUARDED
    if t >= 4:
        return OPEN
    return NEUTRAL


def shake_for(deltas):
    """How hard the screen should shake for this mood swing (0..1)."""
    bad = max(0, deltas.get("Anxious", 0)) + max(0, deltas.get("Moody", 0)) + max(0, -deltas.get("Trust", 0))
    return min(1.0, 0.18 * bad + (0.25 if bad >= 2 else 0))


_VEIN_SMALL = ("..X.X..", "..X.X..", "XX...XX", ".......", "XX...XX", "..X.X..", "..X.X..")
_VEIN_BIG = ("...X.X...", "...X.X...", "...X.X...", "XXX...XXX", ".........",
             "XXX...XXX", "...X.X...", "...X.X...", "...X.X...")

_TINTS = {
    NERVOUS: ((150, 190, 255), pygame.BLEND_RGB_MULT),
    IRRITATED: ((255, 190, 170), pygame.BLEND_RGB_MULT),
    GUARDED: ((150, 140, 170), pygame.BLEND_RGB_MULT),
    OPEN: ((255, 240, 210), pygame.BLEND_RGB_MULT),
    SHOCKED: ((255, 255, 255), pygame.BLEND_RGB_MULT),
}


class SuspectSprite:
    """Large visual-novel style sprite built from the 64px portrait."""

    def __init__(self, name, size=384):
        self.name = name
        self.size = size
        self.px = size // 64            # one source pixel, in screen pixels
        self.base = style.portrait(name, size)
        self.emotion = NEUTRAL
        self.since = 0                  # frames in the current emotion
        self.shock_timer = 0
        self.thinking = False
        self._tinted = {}

    def set_emotion(self, emotion):
        if emotion == SHOCKED:
            self.shock_timer = 80
        if emotion != self.emotion:
            self.emotion = emotion
            self.since = 0

    def _tinted_base(self, emotion):
        if emotion not in _TINTS:
            return self.base
        if emotion not in self._tinted:
            col, mode = _TINTS[emotion]
            surf = self.base.copy()
            surf.fill(col, special_flags=mode)
            self._tinted[emotion] = surf
        return self._tinted[emotion]

    def update(self):
        self.since += 1
        if self.shock_timer:
            self.shock_timer -= 1

    # ------------------------------------------------------------ drawing
    def draw(self, surface, bottom_center, frame, dim=0.0, enter=1.0):
        """
        bottom_center: where the sprite stands. dim 0..1 darkens it while the
        detective talks. enter 0..1 slides it in from the right.
        """
        emo = SHOCKED if self.shock_timer else self.emotion
        px = self.px
        x, y = bottom_center
        x += int((1 - enter) * 260)
        sx = sy = 1.0
        dx = dy = 0

        # pose
        if emo == NEUTRAL:
            dy = int(math.sin(frame * 0.05) * px * 0.5)
        elif emo == NERVOUS:
            dx = int(math.sin(frame * 1.7) * px * 0.4)
            dy = int(math.sin(frame * 0.09) * px * 0.4)
        elif emo == IRRITATED:
            lean = ease_out_back(min(1, self.since / 14))
            sx = sy = 1 + 0.05 * lean
            dy = int(px * 0.5 * math.sin(frame * 0.12))
        elif emo == GUARDED:
            dy = int(px * 2 * min(1, self.since / 20))
        elif emo == OPEN:
            dy = int(math.sin(frame * 0.07) * px * 0.8) - px
        elif emo == SHOCKED:
            t = 1 - self.shock_timer / 80
            hop = math.sin(min(1, t * 2.4) * math.pi) * px * 3
            dy = -int(hop)
            squash = max(0, 1 - t * 4)
            sx, sy = 1 + 0.08 * squash, 1 - 0.06 * squash

        img = self._tinted_base(emo)
        w, h = int(self.size * sx), int(self.size * sy)
        if (w, h) != img.get_size():
            img = pygame.transform.scale(img, (w, h))
        rect = img.get_rect(midbottom=(x + dx, y + dy))

        if emo == SHOCKED:
            self._burst(surface, rect.center, frame)

        # soft floor shadow
        shadow = pygame.Surface((int(self.size * 0.7), 22), pygame.SRCALPHA)
        pygame.draw.ellipse(shadow, (*style.INK, 120), shadow.get_rect())
        surface.blit(shadow, shadow.get_rect(center=(x, y - 4)))

        surface.blit(img, rect)
        if enter > 0.6:
            self._emote(surface, rect, emo, frame)
        if self.thinking:
            self._thought(surface, rect, frame)
        if dim > 0:
            veil = img.copy()
            veil.fill((0, 0, 0, 255), special_flags=pygame.BLEND_RGBA_MULT)
            veil.set_alpha(int(150 * dim))
            surface.blit(veil, rect)
        return rect

    def _p(self, rect, gx, gy):
        """Grid coordinate (0..63 on the portrait) to screen."""
        return rect.x + int(gx * rect.w / 64), rect.y + int(gy * rect.h / 64)

    def _block(self, surface, rect, gx, gy, gw, gh, color):
        x, y = self._p(rect, gx, gy)
        s = rect.w / 64
        pygame.draw.rect(surface, color, (x, y, max(1, int(gw * s)), max(1, int(gh * s))))

    def _emote(self, surface, rect, emo, frame):
        """Emotes are drawn on a chunky 2x pixel grid so they read at a glance."""
        def e(gx, gy, w, h, c, k=2):
            self._block(surface, rect, gx, gy, w * k, h * k, c)

        if emo == NERVOUS:
            # big sweat drop sliding down the temple, then resetting
            t = (frame % 80) / 80
            gx, gy = 50, 6 + t * 14
            e(gx + 2, gy, 1, 1, (220, 240, 255))
            e(gx + 1, gy + 2, 2, 1, (170, 215, 255))
            e(gx, gy + 4, 4, 2, (120, 185, 250))
            e(gx + 1, gy + 8, 2, 1, (80, 140, 220))
            e(gx + 1, gy + 4, 1, 1, (255, 255, 255))
            # shiver lines either side of the head
            if (frame // 6) % 2:
                for i in range(3):
                    e(6 - i, 12 + i * 4, 2, 1, style.FROST)
                    e(58 + i, 12 + i * 4, 2, 1, style.FROST)
        elif emo == IRRITATED:
            # throbbing anger vein (classic four-corner mark), pulsing in size
            mark = _VEIN_BIG if (frame // 9) % 2 else _VEIN_SMALL
            cell = max(2, round(rect.w / 64 * 1.5))
            n = len(mark)
            ox, oy = self._p(rect, 55, 5)
            ox -= n * cell // 2
            oy -= n * cell // 2
            for pass_, col in ((0, style.INK), (1, (240, 70, 60))):
                grow = cell // 3 if pass_ == 0 else 0
                for ry, row in enumerate(mark):
                    for rx, ch in enumerate(row):
                        if ch == "X":
                            pygame.draw.rect(surface, col, (ox + rx * cell - grow, oy + ry * cell - grow,
                                                            cell + 2 * grow, cell + 2 * grow))
        elif emo == GUARDED:
            # gloom curtain over the brow + trailing dots
            for i in range(6):
                h = 3 + (i % 2) * 2
                e(14 + i * 6, 0, 1, h, (120, 105, 190))
            if (frame // 25) % 2 == 0:
                for i in range(3):
                    e(52 + i * 4, 2, 1, 1, style.MIST)
        elif emo == OPEN:
            # twinkling sparkles
            for i, (gx, gy) in enumerate(((6, 8), (54, 16), (52, 2), (10, 26))):
                if ((frame // 10) + i) % 3:
                    c = style.AMBER if i % 2 else style.PARCHMENT
                    e(gx, gy - 2, 1, 5, c, 1)
                    e(gx - 2, gy, 5, 1, c, 1)
                    e(gx, gy, 1, 1, (255, 255, 255), 1)
        elif emo == SHOCKED:
            pop = ease_out_back(min(1, (80 - self.shock_timer) / 10))
            size = int(80 * pop) + 4
            style.text(surface, "!!", (rect.right - 20, rect.top + 20), size, style.AMBER, title=True, center=True)

    def _burst(self, surface, center, frame):
        t = 1 - self.shock_timer / 80
        r0 = 150 + 90 * t
        for i in range(16):
            ang = i * math.pi / 8 + 0.1
            r1 = r0 + 60 + (i % 2) * 50
            p0 = (center[0] + math.cos(ang) * r0, center[1] + math.sin(ang) * r0)
            p1 = (center[0] + math.cos(ang) * r1, center[1] + math.sin(ang) * r1)
            pygame.draw.line(surface, style.AMBER if i % 2 else style.PARCHMENT, p0, p1, 4)

    def _thought(self, surface, rect, frame):
        cx, cy = rect.right - 10, rect.top + 20
        for i, (ox, oy, r) in enumerate(((-30, 50, 6), (-14, 30, 9))):
            pygame.draw.circle(surface, style.PARCHMENT, (cx + ox, cy + oy), r)
        bubble = pygame.Rect(0, 0, 96, 50)
        bubble.midbottom = (cx + 30, cy + 18)
        pygame.draw.ellipse(surface, style.PARCHMENT, bubble)
        pygame.draw.ellipse(surface, style.INK, bubble, 3)
        for i in range(3):
            up = 4 if (frame // 9) % 3 == i else 0
            pygame.draw.rect(surface, style.INK, (bubble.x + 26 + i * 16, bubble.centery - 3 - up, 8, 8))
