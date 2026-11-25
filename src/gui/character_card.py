"""
Suspect card on the main board: framed portrait that lifts on hover, gets a
QUESTIONED stamp once you've talked to them, and turns red in accusation mode.
"""
import math
import pygame
from src.config import *
from src.ui import style, sound
from src.ui.fx import ease_out_cubic


class CharacterCard:
    def __init__(self, suspect_data, x, y):
        self.suspect = suspect_data
        self.x = x
        self.y = y
        self.width = CARD_WIDTH
        self.height = CARD_HEIGHT
        self.is_hovered = False
        self.lift = 0.0
        self.frame = 0
        self.visited = False
        self.accuse_mode = False
        self.portrait = style.portrait(suspect_data["name"], 192)

    def check_hover(self, mouse_pos):
        was = self.is_hovered
        self.is_hovered = self.rect().collidepoint(mouse_pos)
        if self.is_hovered and not was:
            sound.play("select")

    def rect(self):
        return pygame.Rect(self.x, self.y, self.width, self.height)

    def is_clicked(self, mouse_pos):
        return self.rect().collidepoint(mouse_pos)

    def draw(self, surface):
        self.frame += 1
        self.lift += ((1.0 if self.is_hovered else 0.0) - self.lift) * 0.2
        up = int(12 * ease_out_cubic(self.lift))
        r = self.rect().move(0, -up)

        # drop shadow grows as the card lifts
        shadow = pygame.Surface(r.size, pygame.SRCALPHA)
        shadow.fill((*style.INK, 110 + int(60 * self.lift)))
        surface.blit(shadow, r.move(6 + up // 3, 8 + up))

        fill = (52, 22, 30) if self.accuse_mode else style.NIGHT
        style.nine_slice(surface, r, "assets/dialogue_box/20240707dragon9SlicesB.png", 24, 2, fill=fill)

        # portrait window with a candle-warm backdrop
        inset = 24
        win = pygame.Rect(r.x + inset, r.y + inset, r.w - 2 * inset, 200)
        pygame.draw.rect(surface, style.PLUM if not self.accuse_mode else (90, 30, 40), win)
        glow = pygame.Surface(win.size, pygame.SRCALPHA)
        pygame.draw.ellipse(glow, (*style.AMBER, 34), glow.get_rect().inflate(-30, -10))
        surface.blit(glow, win)
        bob = int(math.sin(self.frame * 0.08) * 2 * self.lift)
        surface.blit(self.portrait, self.portrait.get_rect(midbottom=(win.centerx, win.bottom + bob)))
        pygame.draw.rect(surface, style.DUSK, win, 2)

        name = self.suspect["name"].upper()
        style.text_mid(surface, name, r.centerx, win.bottom + 28, 30, style.PARCHMENT, title=True, align="center")
        style.text_mid(surface, f"{self.suspect['occupation']}  ·  {self.suspect['age']}",
                       r.centerx, win.bottom + 58, 16, style.MIST, align="center")

        if self.is_hovered:
            pulse = 0.5 + 0.5 * math.sin(self.frame * 0.2)
            col = style.EMBER if self.accuse_mode else style.AMBER
            c = tuple(int(v * (0.7 + 0.3 * pulse)) for v in col)
            L, t = 26, 4
            for (cx, cy, sx, sy) in ((r.x + 6, r.y + 6, 1, 1), (r.right - 6, r.y + 6, -1, 1),
                                     (r.x + 6, r.bottom - 6, 1, -1), (r.right - 6, r.bottom - 6, -1, -1)):
                pygame.draw.rect(surface, c, (min(cx, cx + sx * L), cy - (t if sy < 0 else 0), L, t))
                pygame.draw.rect(surface, c, (cx - (t if sx < 0 else 0), min(cy, cy + sy * L), t, L))
            label = "ACCUSE?" if self.accuse_mode else "QUESTION"
            style.text_mid(surface, label, r.centerx, r.bottom - 32, 14, c, align="center")

        if self.visited:
            # rubber stamp across the bottom-right of the portrait window
            stamp = style.font(16, title=True).render("QUESTIONED", False, style.BLOOD)
            box = pygame.Surface((stamp.get_width() + 20, stamp.get_height() + 12), pygame.SRCALPHA)
            box.fill((*style.PARCHMENT, 225))
            pygame.draw.rect(box, style.BLOOD, box.get_rect(), 3)
            box.blit(stamp, (10, 6))
            box = pygame.transform.rotate(box, 10)
            surface.blit(box, box.get_rect(center=(win.right - 64, win.bottom - 26)))
