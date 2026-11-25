"""
Procedural pixel-art rooms of Bly Manor, used as visual-novel backdrops.
Each room is painted once at 350x225 and scaled 4x, so it sits on the same
chunky pixel grid as the sprites. Candles, fire and rain animate on top.
"""
import math
import random
import pygame
from src.ui import style

LOW_W, LOW_H, K = 350, 225, 4

ROOMS = {
    "Nick": ("The Study", "window", (70, 52, 44)),
    "Sarah": ("The Conservatory", "conservatory", (44, 66, 60)),
    "James": ("The Kitchen", "kitchen", (78, 58, 40)),
    "Emma": ("The Library", "library", (52, 40, 70)),
    "David": ("The Drawing Room", "fireplace", (72, 36, 48)),
    "Lisa": ("The Music Room", "piano", (46, 48, 78)),
}


def _shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


class Room:
    def __init__(self, suspect_name):
        self.title, self.kind, self.wall = ROOMS.get(suspect_name, ("The Hall", "window", (60, 44, 66)))
        self.rng = random.Random(suspect_name)
        self.window = None  # set while painting
        self.base = self._paint()
        self.rain = [(self.rng.randrange(0, 1000), self.rng.randrange(0, 1000)) for _ in range(40)]

    # ------------------------------------------------------------ static
    def _paint(self):
        s = pygame.Surface((LOW_W, LOW_H))
        wall, rng = self.wall, self.rng
        floor_y = 168
        s.fill(wall)
        # wallpaper stripes + damask dots
        for x in range(0, LOW_W, 14):
            pygame.draw.rect(s, _shade(wall, 0.86), (x, 0, 5, floor_y))
            for y in range(6, floor_y - 40, 16):
                s.set_at((x + 10, y + (x // 14 % 2) * 8), _shade(wall, 1.3))
        # crown moulding
        pygame.draw.rect(s, _shade(wall, 0.55), (0, 0, LOW_W, 6))
        pygame.draw.rect(s, _shade(wall, 1.35), (0, 6, LOW_W, 1))
        # wainscot panels
        wy = floor_y - 38
        pygame.draw.rect(s, (54, 34, 30), (0, wy, LOW_W, 38))
        pygame.draw.rect(s, (92, 60, 46), (0, wy, LOW_W, 2))
        for x in range(6, LOW_W, 40):
            pygame.draw.rect(s, (40, 24, 22), (x, wy + 7, 32, 24), 1)
            pygame.draw.line(s, (74, 48, 40), (x + 1, wy + 8), (x + 31, wy + 8))
        # floorboards
        pygame.draw.rect(s, (46, 30, 28), (0, floor_y, LOW_W, LOW_H - floor_y))
        for y in range(floor_y + 4, LOW_H, 7):
            pygame.draw.line(s, (36, 22, 22), (0, y), (LOW_W, y))
            for x in range(rng.randrange(0, 30), LOW_W, 46):
                pygame.draw.line(s, (36, 22, 22), (x, y - 6), (x, y))
        # rug
        pygame.draw.ellipse(s, (92, 30, 40), (60, floor_y + 18, 230, 40))
        pygame.draw.ellipse(s, (140, 96, 50), (60, floor_y + 18, 230, 40), 1)
        pygame.draw.ellipse(s, (120, 40, 50), (90, floor_y + 25, 170, 26), 1)

        getattr(self, "_feature_" + self.kind)(s, floor_y)
        # paintings hang where the UI never covers them (the right wall is under the demeanor panel)
        spot = {"window": (40, 26), "piano": (70, 26)}.get(self.kind)
        if spot:
            self._painting(s, *spot)
        self._candle_base(s, 40, wy - 2)
        self._candle_base(s, 312, wy - 2)
        return pygame.transform.scale(s, (LOW_W * K, LOW_H * K))

    def _window(self, s, x, y, w, h):
        pygame.draw.rect(s, (16, 18, 40), (x, y, w, h))
        for i in range(h):  # night gradient
            c = (16 + i // 6, 20 + i // 5, 44 + i // 3)
            pygame.draw.line(s, c, (x, y + i), (x + w - 1, y + i))
        pygame.draw.circle(s, (232, 228, 200), (x + w - 14, y + 14), 7)
        pygame.draw.circle(s, (16 + 2, 20, 46), (x + w - 11, y + 12), 6)
        for _ in range(6):
            s.set_at((x + self.rng.randrange(2, w - 2), y + self.rng.randrange(2, h // 2)), (200, 200, 230))
        # tree silhouettes
        for i in range(3):
            tx = x + 6 + i * (w // 3)
            pygame.draw.polygon(s, (12, 12, 24), [(tx, y + h), (tx + 10, y + h - 30 - i * 6), (tx + 20, y + h)])
        pygame.draw.rect(s, (70, 46, 38), (x - 3, y - 3, w + 6, h + 6), 3)
        pygame.draw.line(s, (70, 46, 38), (x + w // 2, y), (x + w // 2, y + h), 2)
        pygame.draw.line(s, (70, 46, 38), (x, y + h // 2), (x + w, y + h // 2), 2)
        # curtains
        pygame.draw.rect(s, (110, 30, 44), (x - 10, y - 6, 9, h + 14))
        pygame.draw.rect(s, (110, 30, 44), (x + w + 1, y - 6, 9, h + 14))
        pygame.draw.line(s, (140, 50, 60), (x - 7, y - 6), (x - 7, y + h + 8))
        self.window = pygame.Rect(x, y, w, h)

    def _painting(self, s, x, y):
        pygame.draw.rect(s, (150, 110, 50), (x, y, 40, 50))
        pygame.draw.rect(s, (40, 30, 36), (x + 4, y + 4, 32, 42))
        pygame.draw.circle(s, (90, 70, 70), (x + 20, y + 20), 8)
        pygame.draw.rect(s, (60, 46, 56), (x + 10, y + 30, 20, 16))
        pygame.draw.rect(s, (200, 160, 80), (x, y, 40, 50), 1)

    def _candle_base(self, s, x, y):
        pygame.draw.rect(s, (150, 110, 50), (x - 4, y, 9, 3))
        pygame.draw.rect(s, (236, 226, 200), (x - 1, y - 10, 3, 10))

    def _feature_window(self, s, fy):
        self._window(s, 140, 30, 70, 80)
        # desk
        pygame.draw.rect(s, (80, 50, 36), (110, fy - 26, 130, 10))
        pygame.draw.rect(s, (60, 36, 28), (116, fy - 16, 10, 24))
        pygame.draw.rect(s, (60, 36, 28), (224, fy - 16, 10, 24))
        pygame.draw.rect(s, (220, 210, 180), (150, fy - 29, 20, 3))

    def _feature_conservatory(self, s, fy):
        for i in range(4):
            self._window(s, 30 + i * 76, 22, 60, 96)
        for x in (24, 110, 200, 300):
            pygame.draw.rect(s, (110, 60, 40), (x, fy - 18, 16, 18))
            for j in range(7):
                a = -2.6 + j * 0.45
                pygame.draw.line(s, (60, 120, 70), (x + 8, fy - 18), (x + 8 + 18 * math.cos(a), fy - 18 + 22 * math.sin(a)), 2)

    def _feature_kitchen(self, s, fy):
        self._window(s, 40, 30, 60, 60)
        pygame.draw.rect(s, (40, 40, 46), (190, fy - 58, 120, 58))   # range
        pygame.draw.rect(s, (24, 24, 30), (206, fy - 40, 40, 30))
        pygame.draw.rect(s, (70, 70, 80), (180, fy - 62, 140, 6))
        for i, x in enumerate((150, 175, 280, 305)):                 # hanging pots
            pygame.draw.line(s, (90, 90, 90), (x, 0), (x, 30 + i % 2 * 8))
            pygame.draw.rect(s, (170, 100, 60), (x - 7, 30 + i % 2 * 8, 14, 10))
        self.oven = pygame.Rect(206, fy - 40, 40, 30)

    def _feature_library(self, s, fy):
        for bx in (20, 250):
            pygame.draw.rect(s, (60, 36, 28), (bx, 18, 80, fy - 18))
            for sy in range(24, fy - 20, 22):
                x = bx + 4
                while x < bx + 74:
                    w = self.rng.randrange(3, 7)
                    h = self.rng.randrange(14, 19)
                    col = self.rng.choice([(120, 40, 50), (50, 80, 110), (60, 100, 60), (150, 120, 60), (90, 60, 110)])
                    pygame.draw.rect(s, col, (x, sy + 19 - h, w, h))
                    x += w + 1
                pygame.draw.rect(s, (80, 50, 36), (bx, sy + 19, 80, 3))
        self._window(s, 140, 30, 70, 80)

    def _feature_fireplace(self, s, fy):
        pygame.draw.rect(s, (110, 100, 104), (120, fy - 78, 110, 78))
        pygame.draw.rect(s, (140, 130, 134), (112, fy - 84, 126, 8))
        pygame.draw.rect(s, (24, 14, 16), (142, fy - 56, 66, 56))
        self.fire = pygame.Rect(142, fy - 56, 66, 56)
        self._window(s, 30, 30, 50, 70)

    def _feature_piano(self, s, fy):
        self._window(s, 150, 26, 80, 90)
        pygame.draw.polygon(s, (20, 16, 22), [(40, fy), (40, fy - 44), (110, fy - 44), (140, fy - 30), (140, fy)])
        pygame.draw.rect(s, (230, 226, 216), (44, fy - 40, 60, 5))
        for x in range(46, 104, 5):
            pygame.draw.rect(s, (20, 16, 22), (x, fy - 40, 2, 3))

    # ------------------------------------------------------------ animated
    def draw(self, surface, frame):
        surface.blit(self.base, (0, 0))
        if self.window:
            w = self.window
            clip = pygame.Rect(w.x * K, w.y * K, w.w * K, w.h * K)
            for i, (ox, oy) in enumerate(self.rain):
                x = clip.x + (ox + frame * 2) % clip.w
                y = clip.y + (oy + frame * 9) % clip.h
                pygame.draw.line(surface, (120, 140, 190), (x, y), (x - 4, min(clip.bottom - 1, y + 12)), 2)
        if hasattr(self, "fire"):
            self._flames(surface, self.fire, frame, 1.0)
        if hasattr(self, "oven"):
            self._flames(surface, self.oven, frame, 0.6)
        for cx in (40, 312):
            self._candle_flame(surface, cx * K + 2, (130 - 2 - 12) * K, frame + cx)

    def _flames(self, surface, rect, frame, power):
        r = pygame.Rect(rect.x * K, rect.y * K, rect.w * K, rect.h * K)
        flick = 0.85 + 0.15 * math.sin(frame * 0.3) * math.sin(frame * 0.13)
        g = flick * power
        size = (int(r.w * 2.4), int(r.h * 2.4))
        steps = 5
        acc = pygame.Surface(size)
        for i in range(steps):  # stepped falloff reads as pixel light, without one hard ring
            k = 1 - i / steps
            rect = acc.get_rect().inflate(-size[0] * (1 - k), -size[1] * (1 - k))
            layer = pygame.Surface(size)
            pygame.draw.ellipse(layer, (int(11 * g), int(6 * g), int(1.5 * g)), rect)
            acc.blit(layer, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
        surface.blit(acc, acc.get_rect(center=r.center), special_flags=pygame.BLEND_RGB_ADD)
        for i in range(int(14 * power)):
            fx = r.x + 8 + (i * 37 + frame * 3) % (r.w - 16)
            h = int((20 + 30 * abs(math.sin(frame * 0.2 + i))) * power)
            col = (255, 220, 120) if i % 3 == 0 else (247, 120, 40)
            pygame.draw.rect(surface, col, (fx // 4 * 4, r.bottom - h, 8, h))

    def _candle_flame(self, surface, x, y, frame):
        flick = math.sin(frame * 0.4) * math.sin(frame * 0.17)
        glow = pygame.Surface((200, 200))
        g = 1 + 0.2 * flick
        for rad in (100, 76, 54, 34):  # stepped falloff
            layer = pygame.Surface((200, 200))
            pygame.draw.circle(layer, (int(11 * g), int(7 * g), int(2 * g)), (100, 100), rad)
            glow.blit(layer, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
        surface.blit(glow, (x - 100, y - 90), special_flags=pygame.BLEND_RGB_ADD)
        h = 16 + int(4 * flick)
        pygame.draw.rect(surface, (255, 200, 90), (x - 4, y - h + 16, 8, h))
        pygame.draw.rect(surface, (255, 250, 220), (x - 4, y + 4, 4, 8))
