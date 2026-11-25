"""
Game feel: screen shake, flashes, floating numbers, toasts and easing.
One shared `fx` instance; anything (even background threads) can call it.
"""
import math
import queue
import random
import pygame
from src.ui import style


def lerp(a, b, t):
    return a + (b - a) * t


def ease_out_cubic(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_out_back(t, s=1.70158):
    t = max(0.0, min(1.0, t)) - 1
    return t * t * ((s + 1) * t + s) + 1


def ease_in_out(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


class _Floater:
    def __init__(self, msg, pos, color, size, life=70):
        self.msg, self.x, self.y = msg, pos[0], pos[1]
        self.color, self.size, self.life, self.age = color, size, life, 0

    def draw(self, surface):
        t = self.age / self.life
        y = self.y - 46 * ease_out_cubic(t)
        alpha = 255 if t < 0.6 else int(255 * (1 - (t - 0.6) / 0.4))
        pop = 1 + 0.6 * max(0.0, 1 - self.age / 8)
        style.text(surface, self.msg, (self.x, y), int(self.size * pop), self.color, center=True, alpha=alpha)


class _Toast:
    def __init__(self, msg, color, life=300):
        self.msg, self.color, self.life, self.age = msg, color, life, 0


class FX:
    def __init__(self):
        self.trauma = 0.0
        self.max_shake = 22
        self.flash_color = None
        self.flash_alpha = 0.0
        self.floaters = []
        self.toasts = []
        self.punch = 0.0  # zoom punch, decays to 0
        self.frame = 0
        self._inbox = queue.Queue()

    # ---- thread-safe entry point
    def post(self, fn, *args):
        """Run fn(*args) on the main thread at the next update."""
        self._inbox.put((fn, args))

    # ---- triggers
    def shake(self, amount):
        """amount 0..1; stacks, capped at 1."""
        self.trauma = min(1.0, self.trauma + amount)

    def flash(self, color, alpha=150):
        self.flash_color = color
        self.flash_alpha = max(self.flash_alpha, alpha)

    def zoom_punch(self, amount=0.04):
        self.punch = max(self.punch, amount)

    def float_text(self, msg, pos, color=style.PARCHMENT, size=26):
        self.floaters.append(_Floater(msg, pos, color, size))

    def toast(self, msg, color=style.AMBER):
        self.toasts.append(_Toast(msg, color))
        self.toasts = self.toasts[-3:]

    # ---- per frame
    def update(self):
        while not self._inbox.empty():
            fn, args = self._inbox.get_nowait()
            fn(*args)
        self.frame += 1
        self.trauma = max(0.0, self.trauma - 0.025)
        self.flash_alpha = max(0.0, self.flash_alpha * 0.86 - 1)
        self.punch *= 0.85
        for f in self.floaters:
            f.age += 1
        self.floaters = [f for f in self.floaters if f.age < f.life]
        for t in self.toasts:
            t.age += 1
        self.toasts = [t for t in self.toasts if t.age < t.life]

    def offset(self):
        if self.trauma <= 0:
            return (0, 0)
        s = self.max_shake * self.trauma ** 2
        t = self.frame * 0.9
        return (int(s * math.sin(t * 2.1 + random.random())), int(s * math.cos(t * 2.7 + random.random())))

    def present(self, display, canvas):
        """Blit the finished canvas to the window with shake and zoom punch."""
        display.fill(style.INK)
        ox, oy = self.offset()
        if self.punch > 0.002:
            w, h = canvas.get_size()
            zw, zh = int(w * (1 + self.punch)), int(h * (1 + self.punch))
            zoomed = pygame.transform.scale(canvas, (zw, zh))
            display.blit(zoomed, ((w - zw) // 2 + ox, (h - zh) // 2 + oy))
        else:
            display.blit(canvas, (ox, oy))

    def draw_overlay(self, surface, area_width):
        """Flash, floating numbers and toasts, drawn last over the game area."""
        if self.flash_alpha > 1 and self.flash_color:
            veil = pygame.Surface((area_width, surface.get_height()), pygame.SRCALPHA)
            veil.fill((*self.flash_color, int(self.flash_alpha)))
            surface.blit(veil, (0, 0))
        for f in self.floaters:
            f.draw(surface)
        prev_clip = surface.get_clip()
        surface.set_clip(pygame.Rect(0, 0, area_width, surface.get_height()))
        y = 18
        for t in self.toasts:
            slide = ease_out_back(min(1, t.age / 18))
            out = 1 - ease_in_out(max(0, (t.age - t.life + 30) / 30))
            msg_w = style.font(18).size(t.msg)[0] + 64
            x = area_width - int(msg_w * slide * out) - 16 * out
            rect = pygame.Rect(int(x), y, msg_w, 48)
            style.nine_slice(surface, rect, "assets/dialogue_box/20240707dragon9SlicesD.png", 12, 2, fill=style.NIGHT)
            pygame.draw.circle(surface, t.color, (rect.x + 26, rect.centery), 7)
            if (t.age // 10) % 2 == 0 and t.age < 90:
                pygame.draw.circle(surface, style.PARCHMENT, (rect.x + 26, rect.centery), 7, 2)
            style.text(surface, t.msg, (rect.x + 44, rect.y + 13), 18, style.PARCHMENT)
            y += 56
        surface.set_clip(prev_clip)


fx = FX()
