"""
Shared look: palette, fonts, cached images, nine-slice frames and pixel text.
Everything visual in the game should pull from here so it stays one style.
"""
import os
import pygame

# ---------------------------------------------------------------- palette
# Pulled from the Oak Woods night forest: plum shadows, amber firelight.
INK = (18, 14, 26)          # deepest shadow
NIGHT = (31, 24, 43)        # panel fill
PLUM = (58, 40, 72)         # raised panel
DUSK = (92, 70, 110)        # borders, inactive
MIST = (186, 172, 200)      # secondary text
PARCHMENT = (244, 232, 208) # primary text
AMBER = (247, 172, 66)      # highlights, firelight
EMBER = (226, 92, 60)       # danger, anger
BLOOD = (170, 36, 52)       # guilt, victim
FROST = (110, 168, 232)     # fear, nerves
MOSS = (120, 200, 120)      # trust, calm
ROSE = (232, 120, 168)      # romance

RELATIONSHIP_COLORS = {
    "Close Friend": MOSS,
    "Friend": MOSS,
    "Romantic Partner": ROSE,
    "Romantic": ROSE,
    "Business Partner": FROST,
    "Rival": (176, 120, 232),
    "Enemy": EMBER,
    "Acquaintance": MIST,
    "Family Member": AMBER,
}

FONT_TITLE = "assets/raster-forge-font/RasterForgeRegular-JpBgm.ttf"
FONT_BODY = "assets/fonts/GeistPixel-Square.ttf"

_fonts = {}
_images = {}


def font(size, title=False):
    """Pixel font at a size. title=True uses the Raster Forge display face."""
    key = (size, title)
    if key not in _fonts:
        path = FONT_TITLE if title else FONT_BODY
        try:
            _fonts[key] = pygame.font.Font(path, size)
        except (OSError, FileNotFoundError, pygame.error):
            _fonts[key] = pygame.font.Font(None, int(size * 1.3))
    return _fonts[key]


def image(path, scale=None):
    """Load an image once. scale: int factor (nearest-neighbour) or (w, h)."""
    key = (path, scale)
    if key in _images:
        return _images[key]
    try:
        surf = pygame.image.load(path).convert_alpha()
    except (FileNotFoundError, pygame.error):
        _images[key] = None
        return None
    if isinstance(scale, int):
        surf = pygame.transform.scale(surf, (surf.get_width() * scale, surf.get_height() * scale))
    elif scale:
        surf = pygame.transform.scale(surf, scale)
    _images[key] = surf
    return surf


def sheet_frames(path, count, scale=1):
    """Split a horizontal sprite sheet into `count` frames."""
    key = ("sheet", path, count, scale)
    if key in _images:
        return _images[key]
    base = image(path)
    frames = []
    if base:
        w = base.get_width() // count
        for i in range(count):
            f = base.subsurface((i * w, 0, w, base.get_height())).copy()
            if scale != 1:
                f = pygame.transform.scale(f, (f.get_width() * scale, f.get_height() * scale))
            frames.append(f)
    _images[key] = frames
    return frames


# Interior colours of the Dragon Regalia frames, swapped for our own fill
_FRAME_INTERIOR = ((69, 94, 177), (67, 147, 214), (244, 161, 58), (93, 153, 196), (136, 184, 196))


def _recolored(path, fill, alpha):
    key = ("recolor", path, fill, alpha)
    if key not in _images:
        src = image(path)
        out = src.copy()
        px = pygame.PixelArray(out)
        for c in _FRAME_INTERIOR:
            px.replace(c, (*fill, alpha), distance=0.04)
        del px
        _images[key] = out
    return _images[key]


def nine_slice(surface, rect, path, border, scale=2, fill=None, fill_alpha=235):
    """
    Draw a framed panel without stretching the corners.
    border: corner size in source pixels. fill recolours the frame's interior.
    """
    rect = pygame.Rect(rect)
    src = image(path)
    if src is None:
        pygame.draw.rect(surface, fill or NIGHT, rect)
        pygame.draw.rect(surface, AMBER, rect, 3)
        return
    key = ("nine", path, border, scale, rect.size, fill, fill_alpha)
    panel = _images.get(key)
    if panel is None:
        if fill is not None:
            src = _recolored(path, fill, fill_alpha)
        sw, sh = src.get_size()
        b = border
        db = b * scale
        panel = pygame.Surface(rect.size, pygame.SRCALPHA)
        cols = [(0, b, 0, db), (b, sw - 2 * b, db, rect.w - 2 * db), (sw - b, b, rect.w - db, db)]
        rows = [(0, b, 0, db), (b, sh - 2 * b, db, rect.h - 2 * db), (sh - b, b, rect.h - db, db)]
        for sy, shh, dy, dh in rows:
            for sx, sww, dx, dw in cols:
                if dw <= 0 or dh <= 0:
                    continue
                piece = src.subsurface((sx, sy, sww, shh))
                panel.blit(pygame.transform.scale(piece, (dw, dh)), (dx, dy))
        _images[key] = panel
    surface.blit(panel, rect.topleft)


def text(surface, msg, pos, size=20, color=PARCHMENT, title=False, shadow=True, center=False, alpha=255):
    """Pixel text with a 2px drop shadow. Returns the drawn rect."""
    f = font(size, title)
    surf = f.render(msg, False, color)
    rect = surf.get_rect()
    if center:
        rect.center = pos
    else:
        rect.topleft = pos
    if alpha < 255:
        surf.set_alpha(alpha)
    if shadow:
        sh = f.render(msg, False, INK)
        if alpha < 255:
            sh.set_alpha(alpha)
        surface.blit(sh, (rect.x + 2, rect.y + 2))
    surface.blit(surf, rect)
    return rect


def text_mid(surface, msg, x, cy, size=20, color=PARCHMENT, title=False, align="left", shadow=True, alpha=255):
    """
    Text whose CAP HEIGHT is centred on cy, so rows of mixed fonts and sizes
    share one visual centre line. align: left | center | right (x is that edge).
    """
    f = font(size, title)
    cap = (f.metrics("H")[0] or (0, 0, 0, size * 0.7))[3]
    top = int(round(cy - f.get_ascent() + cap / 2))
    w = f.size(msg)[0]
    left = x if align == "left" else x - w // 2 if align == "center" else x - w
    return text(surface, msg, (left, top), size, color, title, shadow, False, alpha)


def cap_top(size, title=False):
    """Offset from a text's draw y to the top of its capital letters."""
    f = font(size, title)
    cap = (f.metrics("H")[0] or (0, 0, 0, size * 0.7))[3]
    return f.get_ascent() - cap


def wrap(msg, size, max_width, title=False):
    """Split text into lines that fit max_width at this font size."""
    f = font(size, title)
    lines = []
    for para in msg.split("\n"):
        line = ""
        for word in para.split(" "):
            test = f"{line} {word}".strip()
            if f.size(test)[0] <= max_width or not line:
                line = test
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def vignette(size, strength=170):
    """Dark edges that pull the eye to the centre."""
    key = ("vignette", size, strength)
    if key not in _images:
        w, h = size
        small = pygame.Surface((64, 40), pygame.SRCALPHA)
        for y in range(40):
            for x in range(64):
                dx = (x - 31.5) / 32
                dy = (y - 19.5) / 20
                d = min(1.0, (dx * dx + dy * dy) ** 0.5)
                small.set_at((x, y), (*INK, int(strength * d ** 2.2)))
        _images[key] = pygame.transform.smoothscale(small, (w, h))
    return _images[key]


def portrait_path(name):
    from src.config import CHARACTER_PORTRAITS
    p = CHARACTER_PORTRAITS.get(name)
    return p if p and os.path.exists(p) else None


def silhouette(size, seed_name=""):
    """A shadowed bust used when the portrait pack is not installed."""
    key = ("silhouette", size, seed_name)
    if key in _images:
        return _images[key]
    s = 64
    small = pygame.Surface((s, s), pygame.SRCALPHA)
    body = (44, 32, 58)
    rim = (120, 92, 140)
    pygame.draw.ellipse(small, body, (8, 40, 48, 40))
    pygame.draw.rect(small, body, (26, 30, 12, 14))
    pygame.draw.ellipse(small, body, (19, 8, 26, 30))
    pygame.draw.ellipse(small, rim, (19, 8, 26, 30), 1)
    pygame.draw.arc(small, rim, (8, 40, 48, 40), 0.3, 2.8, 1)
    q = font(14, title=True).render("?", False, DUSK)
    small.blit(q, q.get_rect(center=(32, 23)))
    _images[key] = pygame.transform.scale(small, (size, size))
    return _images[key]


def portrait(name, size):
    """Pixel portrait scaled with nearest-neighbour, or a silhouette."""
    p = portrait_path(name)
    if p:
        base = image(p)
        if base:
            key = ("portrait", name, size)
            if key not in _images:
                _images[key] = pygame.transform.scale(base, (size, size))
            return _images[key]
    return silhouette(size, name)
