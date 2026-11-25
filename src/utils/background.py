"""
Background and parallax utilities
"""
import pygame
from src.config import *


class ParallaxBackground:
    def __init__(self):
        # Load backgrounds (the Oak Woods pack is not in the repo; fall back to a plain night sky)
        self.background_layer_1 = self._load_layer(1, fill=(20, 24, 38))
        self.background_layer_2 = self._load_layer(2)
        self.background_layer_3 = self._load_layer(3)

        # Parallax offsets
        self.parallax_offset_2 = 0
        self.parallax_offset_3 = 0

    @staticmethod
    def _load_layer(n, fill=None):
        path = f"assets/oak_woods_v1.0/background/background_layer_{n}.png"
        try:
            layer = pygame.image.load(path).convert_alpha()
            return pygame.transform.scale(layer, (SCREEN_WIDTH, SCREEN_HEIGHT))
        except (pygame.error, FileNotFoundError):
            layer = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            if fill:
                layer.fill(fill)
            return layer

    def update(self, scroll_speed_2=PARALLAX_SPEED_2, scroll_speed_3=PARALLAX_SPEED_3):
        """Update parallax offsets"""
        self.parallax_offset_2 += scroll_speed_2
        self.parallax_offset_3 += scroll_speed_3

        # Reset offsets to prevent overflow
        if self.parallax_offset_2 >= SCREEN_WIDTH:
            self.parallax_offset_2 = 0
        if self.parallax_offset_3 >= SCREEN_WIDTH:
            self.parallax_offset_3 = 0

    def draw(self, surface):
        """Draw parallax background"""
        # Draw static layer 1
        surface.blit(self.background_layer_1, (0, 0))

        # Draw parallax layer 2
        surface.blit(self.background_layer_2, (-self.parallax_offset_2, 0))
        if self.parallax_offset_2 > 0:
            surface.blit(self.background_layer_2, (SCREEN_WIDTH - self.parallax_offset_2, 0))

        # Draw parallax layer 3
        surface.blit(self.background_layer_3, (-self.parallax_offset_3, 0))
        if self.parallax_offset_3 > 0:
            surface.blit(self.background_layer_3, (SCREEN_WIDTH - self.parallax_offset_3, 0))