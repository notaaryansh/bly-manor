"""
Game configuration and constants
"""

# Screen dimensions
SCREEN_WIDTH = 1400
SCREEN_HEIGHT = 900

# Board layout (8px grid). Menu column on the left margin, 3x2 card grid beside it.
MARGIN = 48
GRID_TOP = 144
MENU_X, MENU_W = MARGIN, 240
CARD_WIDTH = 280
CARD_HEIGHT = 338          # 144 + 2*338 + 32 = 852 = 900 - MARGIN
CARD_PADDING = 32
CARDS_PER_ROW = 3

# FPS
FPS = 60

# Character portraits mapping
CHARACTER_PORTRAITS = {
    "James": "assets/potrait/PNG/Transperent/Icon1.png",
    "Emma": "assets/potrait/PNG/Transperent/Icon2.png",
    "Nick": "assets/potrait/PNG/Transperent/Icon5.png",
    "Lisa": "assets/potrait/PNG/Transperent/Icon7.png",
    "Sarah": "assets/potrait/PNG/Transperent/Icon14.png",
    "David": "assets/potrait/PNG/Transperent/Icon39.png",
}

# Parallax scrolling speeds
PARALLAX_SPEED_2 = 0.3
PARALLAX_SPEED_3 = 0.5