"""
The rumor board: a detective's corkboard of the guests, pinned photos joined by
coloured string. Gossip travels along the strings as notes you can follow,
hop by hop, and every card reacts when someone is questioned or rattled.

Public methods are called from game and agent threads, so each one only queues
work; everything happens on the main thread in update().
"""
import math
import queue
import random
import pygame
from src.ui import style, sound
from src.ui.fx import ease_out_back, ease_in_out

CARD_W, CARD_H = 88, 112
NOTE_FRAMES = 54
AFTERGLOW = 60


def _bezier(p0, p1, sag, t):
    """Point on a string hanging between two pins."""
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + sag
    a = (1 - t) ** 2
    b = 2 * (1 - t) * t
    c = t * t
    return (a * p0[0] + b * mx + c * p1[0], a * p0[1] + b * my + c * p1[1])


class _Card:
    def __init__(self, name, data, pos, victim=False):
        self.name, self.data, self.home, self.victim = name, data, pos, victim
        self.tilt = random.Random(name).uniform(-5, 5)
        self.questioned = 0
        self.wiggle = 0
        self.bubble = 0
        self.rattle = 0
        self.drop = 1 if victim else -1   # -1 waits for the briefing, then animates 0..1
        self.levels = {"Anxious": 3, "Moody": 3, "Trust": 3}
        self._img = None

    @property
    def pin(self):
        return (self.home[0], self.home[1] - CARD_H // 2 + 8)

    def image(self):
        if self._img is None:
            card = pygame.Surface((CARD_W, CARD_H), pygame.SRCALPHA)
            card.fill((236, 228, 210))
            pygame.draw.rect(card, (200, 190, 170), card.get_rect(), 2)
            photo = style.portrait(self.name, 64).copy()
            if self.victim and hasattr(pygame.transform, "grayscale"):
                photo = pygame.transform.grayscale(photo)
            bg = pygame.Surface((72, 72))
            bg.fill((46, 36, 56))
            bg.blit(photo, (4, 4))
            card.blit(bg, (8, 8))
            label = style.font(14).render(self.name, False, style.INK)
            card.blit(label, label.get_rect(center=(CARD_W // 2, 94)))
            if self.victim:
                pygame.draw.line(card, style.BLOOD, (10, 10), (78, 78), 5)
                pygame.draw.line(card, style.BLOOD, (78, 10), (10, 78), 5)
            self._img = card
        return self._img


class _Note:
    def __init__(self, src, dst, text, start):
        self.src, self.dst, self.text, self.start = src, dst, text, start


class AgentBehaviorVisualizer:
    """Rumor board panel drawn to the right of the game."""

    def __init__(self, suspects, relationships, start_x, start_y, width, height):
        self.suspects = suspects
        self.relationships = relationships
        self.rect = pygame.Rect(start_x, start_y, width, height)
        self.start_x, self.start_y, self.width, self.height = start_x, start_y, width, height
        self.frame = 0
        self._q = queue.Queue()
        self.cards = {}
        self.victim = None
        self.notes = []
        self.traffic = {}
        self.afterglow = []
        self.feed = []
        self.drop_queue = 0
        self._cork = None
        self._layout()

    # ------------------------------------------------------------ layout
    def _layout(self):
        names = [n for n, s in self.suspects.items() if not s.get("is_victim")]
        victims = [n for n, s in self.suspects.items() if s.get("is_victim")]
        cx, cy = self.rect.x + self.rect.w // 2, self.rect.y + 380
        rx, ry = self.rect.w * 0.34, 210
        for i, name in enumerate(names):
            ang = -math.pi / 2 + 2 * math.pi * i / max(1, len(names))
            pos = (int(cx + rx * math.cos(ang)), int(cy + ry * math.sin(ang)))
            self.cards[name] = _Card(name, self.suspects[name], pos)
        if victims:
            self.victim = _Card(victims[0], self.suspects[victims[0]], (cx, cy + 6), victim=True)

    def _rel(self, a, b):
        return self.relationships.get(f"{a}_{b}") or self.relationships.get(f"{b}_{a}")

    # ------------------------------------------------------------ public API (thread-safe)
    def send_interaction(self, suspect_name, duration=60):
        self._q.put(("questioned", suspect_name, duration))

    def send_personality_update(self, suspect_name, personality_state):
        self._q.put(("mood", suspect_name, dict(personality_state)))

    def send_orchestrator_briefing(self, suspect_name, duration=180):
        self._q.put(("drop", suspect_name, None))

    def send_feedback_to_orchestrator(self, suspect_name, duration=180):
        pass  # internal bookkeeping; nothing for the player to see

    def send_agent_communication(self, from_suspect, to_suspect, duration=120, text=""):
        self._q.put(("gossip", (from_suspect, to_suspect), text))

    def send_relationship_interaction(self, suspect1, suspect2, duration=60):
        self._q.put(("gossip", (suspect1, suspect2), ""))

    def send_info_flow(self, suspect1, suspect2, duration=60):
        self._q.put(("gossip", (suspect1, suspect2), ""))

    # ------------------------------------------------------------ update
    def update(self):
        self.frame += 1
        while not self._q.empty():
            kind, who, arg = self._q.get_nowait()
            if kind == "questioned" and who in self.cards:
                self.cards[who].questioned = max(self.cards[who].questioned, 150)
            elif kind == "mood" and who in self.cards:
                self.cards[who].levels = arg
                self.cards[who].rattle = 30
            elif kind == "drop" and who in self.cards and self.cards[who].drop == -1:
                self.cards[who].drop = -2 - self.drop_queue * 9  # staggered countdown
                self.drop_queue += 1
            elif kind == "gossip":
                a, b = who
                if a in self.cards and b in self.cards:
                    last = max([n.start for n in self.notes] + [self.frame - 30])
                    self.notes.append(_Note(a, b, arg, max(self.frame, last + 30)))

        for card in self.cards.values():
            if card.drop < -2:
                card.drop += 1
            elif card.drop == -2:
                card.drop = 0.0001
            elif 0 < card.drop < 1:
                card.drop = min(1, card.drop + 1 / 26)
            card.questioned = max(0, card.questioned - 1)
            card.wiggle = max(0, card.wiggle - 1)
            card.bubble = max(0, card.bubble - 1)
            card.rattle = max(0, card.rattle - 1)
        if self.frame == 120:  # never briefed: just show them
            for card in self.cards.values():
                if card.drop <= -1:
                    card.drop = 0.0001

        for n in self.notes[:]:
            if self.frame - n.start >= NOTE_FRAMES:
                dst = self.cards[n.dst]
                dst.wiggle, dst.bubble = 40, 90
                key = tuple(sorted((n.src, n.dst)))
                self.traffic[key] = self.traffic.get(key, 0) + 1
                snippet = (n.text or "").strip().replace("\n", " ")
                self.feed.insert(0, (n.src, n.dst, snippet, self.frame))
                self.feed = self.feed[:3]
                sound.play("whisper")
                self.afterglow.append((n.src, n.dst, self.frame))
                self.afterglow = [g for g in self.afterglow if self.frame - g[2] < AFTERGLOW]
                self.notes.remove(n)

    # ------------------------------------------------------------ drawing
    def _cork_surface(self):
        if self._cork is None:
            w, h = self.rect.size
            small = pygame.Surface((w // 4, h // 4))
            rng = random.Random(7)
            small.fill((150, 104, 66))
            for _ in range(small.get_width() * small.get_height() // 3):
                x, y = rng.randrange(small.get_width()), rng.randrange(small.get_height())
                small.set_at((x, y), rng.choice([(128, 86, 54), (168, 120, 78), (138, 94, 60), (180, 134, 88)]))
            cork = pygame.transform.scale(small, (w, h))
            pygame.draw.rect(cork, (74, 46, 34), cork.get_rect(), 14)
            pygame.draw.rect(cork, (110, 72, 48), cork.get_rect().inflate(-4, -4), 2)
            pygame.draw.rect(cork, (46, 28, 22), cork.get_rect().inflate(-26, -26), 2)
            shade = pygame.Surface((w, h), pygame.SRCALPHA)
            shade.fill((20, 10, 20, 70))
            cork.blit(shade, (0, 0))
            self._cork = cork
        return self._cork

    def _string(self, surface, a, b, color, width):
        pts = [_bezier(a, b, 26, i / 24) for i in range(25)]
        shadow = [(x + 1, y + 2) for x, y in pts]
        pygame.draw.lines(surface, (40, 24, 20), False, shadow, width)
        pygame.draw.lines(surface, color, False, pts, width)

    def _flow(self, overlay, a, b, color, width, head, fade):
        """
        Light running along the string from a (speaker) to b (listener).
        head 0..1 is how far the pulse has travelled; fade 0..1 dims the afterglow.
        """
        n = 48
        pts = [_bezier(a, b, 26, i / n) for i in range(n + 1)]
        ox, oy = self.rect.topleft
        for i in range(n):
            s = i / n
            if s > head:
                break
            tail = head - s
            k = (0.35 + 0.65 * max(0.0, 1 - tail * 3.0)) * fade  # bright near the pulse, lit behind it
            hot = tuple(min(255, int(c + (255 - c) * k)) for c in color)
            p0 = (pts[i][0] - ox, pts[i][1] - oy)
            p1 = (pts[i + 1][0] - ox, pts[i + 1][1] - oy)
            pygame.draw.line(overlay, (*hot, int(70 * k)), p0, p1, width + 8)
            pygame.draw.line(overlay, (*hot, int(255 * min(1, k + 0.2))), p0, p1, width + 1)
        if head < 1 and fade > 0:
            x, y = _bezier(a, b, 26, head)
            c = (int(x - ox), int(y - oy))
            pygame.draw.circle(overlay, (*color, 90), c, 14)
            pygame.draw.circle(overlay, (255, 250, 230, 230), c, 6)
            pygame.draw.circle(overlay, (255, 255, 255, 255), c, 3)

    def draw(self, surface):
        surface.blit(self._cork_surface(), self.rect.topleft)
        r = self.rect

        strip = pygame.Rect(0, 0, 250, 46)
        strip.midtop = (r.centerx, 28)
        pygame.draw.rect(surface, (236, 228, 210), strip)
        pygame.draw.rect(surface, (200, 190, 170), strip, 2)
        style.text(surface, "RUMOR BOARD", strip.center, 24, style.INK, title=True, center=True, shadow=False)
        for px in (strip.x + 12, strip.right - 12):
            pygame.draw.circle(surface, style.BLOOD, (px, strip.y + 8), 6)

        live = {k: v for k, v in self.cards.items() if v.drop > 0}
        names = list(live)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                rel = self._rel(a, b)
                if not rel:
                    continue
                key = tuple(sorted((a, b)))
                traffic = self.traffic.get(key, 0)
                col = style.RELATIONSHIP_COLORS.get(rel, style.MIST)
                if not traffic:
                    col = tuple(int(c * 0.55 + 27) for c in col)
                self._string(surface, live[a].pin, live[b].pin, col, min(5, 2 + traffic))

        # light flowing from speaker to listener, then a fading afterglow
        overlay = pygame.Surface(r.size, pygame.SRCALPHA)
        flows = [(n.src, n.dst, ease_in_out((self.frame - n.start) / NOTE_FRAMES), 1.0)
                 for n in self.notes if self.frame >= n.start]
        flows += [(src, dst, 1.0, 1 - (self.frame - at) / AFTERGLOW)
                  for src, dst, at in self.afterglow if self.frame - at < AFTERGLOW]
        for src, dst, head, fade in flows:
            if src in live and dst in live:
                col = style.RELATIONSHIP_COLORS.get(self._rel(src, dst), style.PARCHMENT)
                self._flow(overlay, live[src].pin, live[dst].pin, col, 3, head, fade)
        surface.blit(overlay, r.topleft)

        if self.victim:
            self._card(surface, self.victim)
        for card in sorted(live.values(), key=lambda c: c.questioned > 0):
            self._card(surface, card)

        self._legend(surface)
        self._feed(surface)

    def _card(self, surface, card):
        x, y = card.home
        d = ease_out_back(min(1, card.drop))
        y = int(y - (1 - d) * 120)
        alpha = int(255 * min(1, card.drop * 3))
        lift = 8 if card.questioned else 0
        tilt = card.tilt
        if card.wiggle:
            tilt += math.sin(card.wiggle * 0.6) * card.wiggle * 0.35
        dx = int(math.sin(card.rattle * 1.3) * card.rattle * 0.25)

        img = pygame.transform.rotate(card.image(), tilt)
        if alpha < 255:
            img.set_alpha(alpha)
        rect = img.get_rect(center=(x + dx, y - lift))
        shadow = pygame.Surface(img.get_size(), pygame.SRCALPHA)
        shadow.fill((20, 10, 10, 90 if not lift else 130))
        surface.blit(shadow, rect.move(4 + lift // 2, 6 + lift))
        if card.questioned:
            glow = pygame.Surface((rect.w + 30, rect.h + 30), pygame.SRCALPHA)
            a = 70 + int(40 * math.sin(self.frame * 0.15))
            pygame.draw.rect(glow, (*style.AMBER, a), glow.get_rect(), border_radius=10)
            surface.blit(glow, rect.inflate(30, 30))
        surface.blit(img, rect)

        px, py = rect.centerx, rect.y + 8
        col = style.BLOOD if card.victim else (220, 60, 60) if card.questioned else (70, 110, 200)
        pygame.draw.circle(surface, style.INK, (px + 2, py + 2), 7)
        pygame.draw.circle(surface, col, (px, py), 7)
        pygame.draw.circle(surface, (255, 255, 255), (px - 2, py - 2), 2)

        if card.victim:
            tag = pygame.Rect(0, 0, 70, 20)
            tag.midtop = (rect.centerx, rect.bottom - 4)
            pygame.draw.rect(surface, style.BLOOD, tag)
            style.text(surface, "VICTIM", tag.center, 12, style.PARCHMENT, center=True, shadow=False)
            return

        for i, (trait, col) in enumerate((("Anxious", style.FROST), ("Moody", style.EMBER), ("Trust", style.MOSS))):
            v = card.levels.get(trait, 0)
            bx = rect.centerx - 39 + i * 27
            by = rect.bottom + 2
            pygame.draw.rect(surface, style.INK, (bx, by, 24, 6))
            pygame.draw.rect(surface, col, (bx, by, int(24 * min(5, v) / 5), 6))
            if card.rattle and (card.rattle // 4) % 2:
                pygame.draw.rect(surface, style.PARCHMENT, (bx, by, 24, 6), 1)

        if card.bubble:
            pop = ease_out_back(min(1, (90 - card.bubble) / 10))
            fade = min(1, card.bubble / 20)
            size = max(1, int(30 * pop))
            b = pygame.Rect(0, 0, size, size)
            b.midbottom = (rect.right - 6, rect.y + 6)
            surf = pygame.Surface((size + 8, size + 12), pygame.SRCALPHA)
            pygame.draw.rect(surf, (*style.PARCHMENT, int(255 * fade)), (0, 0, size, size), border_radius=6)
            pygame.draw.polygon(surf, (*style.PARCHMENT, int(255 * fade)), [(4, size - 2), (12, size - 2), (2, size + 8)])
            surface.blit(surf, b)
            if pop > 0.6:
                style.text(surface, "!", b.center, 22, style.EMBER, title=True, center=True, shadow=False, alpha=int(255 * fade))

    def _legend(self, surface):
        r = self.rect
        y0 = r.y + 650
        style.text(surface, "STRING", (r.x + 36, y0), 14, style.PARCHMENT)
        items = [("Friend", style.MOSS), ("Lovers", style.ROSE), ("Business", style.FROST),
                 ("Rival", style.RELATIONSHIP_COLORS["Rival"]), ("Enemy", style.EMBER), ("Family", style.AMBER)]
        for i, (lab, col) in enumerate(items):
            x = r.x + 36 + (i % 3) * 116
            y = y0 + 24 + (i // 3) * 22
            pygame.draw.line(surface, col, (x, y + 7), (x + 22, y + 7), 4)
            style.text(surface, lab, (x + 30, y), 14, style.PARCHMENT)

    def _feed(self, surface):
        r = self.rect
        panel = pygame.Rect(r.x + 22, r.y + 726, r.w - 44, 150)
        pygame.draw.rect(surface, (236, 228, 210), panel)
        pygame.draw.rect(surface, (200, 190, 170), panel, 2)
        for i in range(1, 6):
            pygame.draw.line(surface, (200, 214, 230), (panel.x + 8, panel.y + 26 + i * 22), (panel.right - 8, panel.y + 26 + i * 22))
        pygame.draw.circle(surface, style.BLOOD, (panel.centerx, panel.y + 6), 6)
        style.text(surface, "WHISPERS", (panel.x + 12, panel.y + 10), 14, style.BLOOD, shadow=False)
        if not self.feed:
            style.text(surface, "Nothing yet. Leave a room after", (panel.x + 12, panel.y + 40), 13, (90, 80, 90), shadow=False)
            style.text(surface, "questioning and they'll talk.", (panel.x + 12, panel.y + 62), 13, (90, 80, 90), shadow=False)
            return
        y = panel.y + 36
        for src, dst, snippet, at in self.feed:
            fresh = self.frame - at < 40 and (self.frame // 5) % 2
            style.text(surface, f"{src} → {dst}", (panel.x + 12, y), 14, style.EMBER if fresh else style.INK, shadow=False)
            if snippet:
                short = snippet if len(snippet) <= 40 else snippet[:38] + "..."
                style.text(surface, f'"{short}"', (panel.x + 12, y + 17), 12, (70, 60, 80), shadow=False)
            y += 38
