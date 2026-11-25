"""
Case-file menu button built from the Dragon Regalia button sheet.
"""
import pygame
from src.config import *
from src.ui import style, sound

SHEET = "assets/dialogue_box/20240709dragonButtonA-Sheet.png"


class MenuButton:
    def __init__(self, label, x, y, width, height):
        self.label = label
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.is_hovered = False
        self.slide = 0.0
        self.danger = label == "ACCUSE"
        self.active = False  # e.g. accusation mode is on

    def check_hover(self, mouse_pos):
        was = self.is_hovered
        self.is_hovered = self.rect().collidepoint(mouse_pos)
        if self.is_hovered and not was:
            sound.play("select")

    def rect(self):
        return pygame.Rect(self.x, self.y, self.width, self.height)

    def draw(self, surface):
        self.slide += ((1.0 if self.is_hovered or self.active else 0.0) - self.slide) * 0.25
        r = self.rect().move(int(10 * self.slide), 0)
        frames = style.sheet_frames(SHEET, 4)
        if self.danger:
            idx = 2 if (self.is_hovered or self.active) else 0
        else:
            idx = 1 if self.is_hovered else 3
        if frames:
            # crop each state to its visible pixels so every state fills the rect exactly
            f = frames[idx]
            surface.blit(pygame.transform.scale(f.subsurface(f.get_bounding_rect()), r.size), r)
        else:
            pygame.draw.rect(surface, style.PLUM, r)
        light_bg = self.is_hovered and not self.danger
        color = style.INK if light_bg else style.PARCHMENT if (self.is_hovered or self.active) else style.MIST
        style.text(surface, self.label, r.center, 26, color, title=True, center=True, shadow=not light_bg)

    def is_clicked(self, mouse_pos):
        return self.rect().collidepoint(mouse_pos)
