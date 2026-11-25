"""
Interrogation scene, played like a visual novel: the suspect stands in their
room, lines type out with voice blips, and their expression, the screen and
the sound react to every swing in their mood.
"""
import threading
import pygame
from src.config import *
from src.ui import style, sound
from src.ui.fx import fx, ease_out_back, ease_out_cubic
from src.ui.emotion import SuspectSprite, LABELS, choose, shake_for, SHOCKED, IRRITATED, NERVOUS
from src.ui.scene import Room

# ---- layout: everything sits on an 8px grid -------------------------------
G = 8
MARGIN = 6 * G                 # 48: screen edge to any panel
FRAME = 16                     # gold border + inner rim of the 9-slice, at 2x
PAD = FRAME + 3 * G            # 40: frame edge to content
SCREEN_W, SCREEN_H = 1400, 900
TEXTBOX = pygame.Rect(MARGIN, SCREEN_H - MARGIN - 29 * G, SCREEN_W - 2 * MARGIN, 29 * G)  # 48,620 1304x232
HEADER_CAP = 12               # cap height row of the panel header
PANEL_CONTENT_H = HEADER_CAP + 3 * G + 2 * 5 * G + 20     # header, gap, 3 rows @40 pitch, last pip
PANEL = pygame.Rect(SCREEN_W - MARGIN - 45 * G, MARGIN, 45 * G, PANEL_CONTENT_H + 2 * PAD)  # 992,48 360x216
LINE_H = 36
INPUT_ROW_H = 3 * G
PIP_W, PIP_H, PIP_GAP = 28, 20, G
ROW_H = 5 * G
TEXT_SIZE = 24
TYPE_SPEED = 1.6            # characters per frame
MOOD_LABELS = (("Anxious", "Nerves", style.FROST), ("Moody", "Temper", style.EMBER), ("Trust", "Trust", style.MOSS))


class ConversationScreen:
    def __init__(self, suspect_data, agent, screen_width, screen_height, logs_modal=None, visualizer=None, chaos_callback=None):
        self.suspect = suspect_data
        self.name = suspect_data["name"]
        self.agent = agent
        self.is_open = False
        self.screen_width = screen_width
        self.screen_height = screen_height
        self.logs_modal = logs_modal
        self.visualizer = visualizer
        self.chaos_callback = chaos_callback
        self.last_question = None
        self.last_response = None

        # conversation state (messages is read by the logs modal)
        self.messages = []
        self.user_input = ""
        self.is_loading = False
        self.loading_message = None
        self.pending_response = None
        self.opening_statement = None
        self.response_cache = {}
        self.conversation_started = False
        self.session_snippets = []
        self.scroll_offset = 0

        # presentation
        self.room = Room(self.name)
        self.sprite = SuspectSprite(self.name, 448)
        self.frame = 0
        self.opened_at = 0
        self.line = None            # {"speaker", "text", "shown"}
        self.backlog_open = False
        self.last_personality_state = agent.get_personality_state().copy()
        self.shown_levels = dict(self.last_personality_state)
        self.row_flash = {}
        case = getattr(agent, "case_state", None) or {}
        self.time_text = str(case.get("time_of_death", "")).split("(")[0].strip()
        self.sprite.set_emotion(choose(self.last_personality_state))

    # ------------------------------------------------------------ lifecycle
    def toggle(self):
        self.is_open = not self.is_open
        if self.is_open:
            self.opened_at = self.frame
            self.backlog_open = False
            sound.play("open")
            if not self.conversation_started:
                self.conversation_started = True
                self.sprite.thinking = True
                threading.Thread(target=self._fetch_opening_statement, daemon=True).start()

    def get_window_rect(self):
        return pygame.Rect(0, 0, self.screen_width, self.screen_height)

    def _fetch_opening_statement(self):
        try:
            statement = self.agent.get_opening_statement()
            self.opening_statement = statement
            if statement:
                self.messages.append((self.name, statement))
                self._say(self.name, statement)
                if self.visualizer:
                    self.visualizer.send_interaction(self.name, duration=180)
                if self.logs_modal:
                    threading.Thread(target=self.logs_modal.generate_snippet_for_suspect,
                                     args=(self.name, self), daemon=True).start()
        except Exception as e:
            print(f"Error getting opening statement: {e}")
        finally:
            self.sprite.thinking = False

    def _fetch_response_async(self):
        try:
            if self.loading_message in self.response_cache:
                self.pending_response = self.response_cache[self.loading_message]
            else:
                response, _ = self.agent.respond(self.loading_message)
                self.pending_response = response
                self.response_cache[self.loading_message] = response
                if self.visualizer:
                    self.visualizer.send_interaction(self.name, duration=180)
                if self.agent.orchestrator:
                    self.agent.orchestrator.record_suspect_response(
                        self.name, self.loading_message, response, self.agent.get_personality_state())
        except Exception as e:
            self.pending_response = f"...I don't want to talk right now. ({e.__class__.__name__})"
        finally:
            self.is_loading = False

    def _say(self, speaker, text):
        self.line = {"speaker": speaker, "text": text, "shown": 0.0}

    # ------------------------------------------------------------ input
    def _line_done(self):
        return self.line is None or self.line["shown"] >= len(self.line["text"])

    def handle_click(self, pos=None):
        """Clicking finishes the line that is typing out."""
        if self.line and not self._line_done():
            self.line["shown"] = len(self.line["text"])

    def handle_input(self, event):
        if not self.is_open:
            return
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_TAB:
                self.backlog_open = not self.backlog_open
                self.scroll_offset = 0
                sound.play("select")
            elif event.key == pygame.K_RETURN:
                if not self._line_done():
                    self.handle_click()
                elif self.user_input.strip() and not self.is_loading and not self.sprite.thinking:
                    self._ask(self.user_input.strip())
            elif event.key == pygame.K_BACKSPACE:
                self.user_input = self.user_input[:-1]
            elif event.key == pygame.K_ESCAPE:
                if self.backlog_open:
                    self.backlog_open = False
                    return
                if self.chaos_callback and self.last_question and self.last_response:
                    self.chaos_callback(self.name, self.last_question, self.last_response)
                self.is_open = False
        elif event.type == pygame.TEXTINPUT:
            if len(self.user_input) < 120 and not self.is_loading and not self.backlog_open:
                self.user_input += event.text
        elif event.type == pygame.MOUSEWHEEL and self.backlog_open:
            self.scroll_offset = max(0, self.scroll_offset + event.y)

    def _ask(self, question):
        self.messages.append(("You", question))
        self.loading_message = question
        self.last_question = question
        self.user_input = ""
        self.is_loading = True
        self.sprite.thinking = True
        self._say("You", question)
        self.line["shown"] = len(question)
        sound.play("select")
        threading.Thread(target=self._fetch_response_async, daemon=True).start()

    # ------------------------------------------------------------ reactions
    def _receive(self):
        """A response arrived: react to the mood swing, then start typing it."""
        response = self.pending_response
        self.pending_response = None
        self.sprite.thinking = False
        self.messages.append((self.name, response))
        self.last_response = response

        current = self.agent.get_personality_state()
        deltas = {}
        for trait, new in current.items():
            change = new - self.last_personality_state.get(trait, new)
            if change:
                deltas[trait] = change
            self.last_personality_state[trait] = new

        emotion = choose(current, deltas, response)
        self.sprite.set_emotion(emotion)
        amount = shake_for(deltas)
        if emotion == SHOCKED:
            amount = max(amount, 0.55)
            fx.zoom_punch(0.03)
            sound.play("sting")
        if amount > 0:
            fx.shake(amount)
            if amount >= 0.3:
                sound.play("thud")
                fx.flash(style.EMBER if emotion == IRRITATED else style.FROST if emotion == NERVOUS else style.PARCHMENT,
                         60 + int(80 * amount))

        for i, (trait, label, color) in enumerate(MOOD_LABELS):
            d = deltas.get(trait)
            if d:
                good = (d > 0) == (trait == "Trust")
                self.row_flash[trait] = 50
                fx.float_text(f"{d:+.0f} {label}", (PANEL.right - PAD - 86, self._row_cy(i) - 4),
                              style.MOSS if good else style.EMBER, 22)

        if deltas and self.visualizer:
            self.visualizer.send_personality_update(self.name, current)
            self.visualizer.send_feedback_to_orchestrator(self.name)
        if self.logs_modal:
            threading.Thread(target=self.logs_modal.generate_snippet_for_suspect,
                             args=(self.name, self), daemon=True).start()
        self._say(self.name, response)

    # ------------------------------------------------------------ drawing
    def draw(self, surface):
        if not self.is_open:
            return
        self.frame += 1
        if self.pending_response:
            self._receive()
        self.sprite.update()
        for k in list(self.row_flash):
            self.row_flash[k] -= 1
            if self.row_flash[k] <= 0:
                del self.row_flash[k]

        # type the current line out, with blips
        if self.line and not self._line_done():
            before = int(self.line["shown"])
            self.line["shown"] = min(len(self.line["text"]), self.line["shown"] + TYPE_SPEED)
            after = int(self.line["shown"])
            if after // 2 != before // 2 and self.line["text"][after - 1:after].strip():
                sound.play("blip", self.line["speaker"])

        t_open = self.frame - self.opened_at
        enter = ease_out_cubic(min(1, t_open / 24))

        self.room.draw(surface, self.frame)
        surface.blit(style.vignette(surface.get_size()), (0, 0))

        speaking_player = self.line is not None and self.line["speaker"] == "You"
        self.sprite.draw(surface, (59 * G, TEXTBOX.y + 3 * G), self.frame,
                         dim=0.45 if speaking_player else 0.0, enter=enter)

        self._draw_location(surface, t_open)
        self._draw_demeanor(surface, enter)
        self._draw_textbox(surface, enter)
        if self.backlog_open:
            self._draw_backlog(surface)

        if t_open < 16:  # fade in from black
            veil = pygame.Surface(surface.get_size())
            veil.fill(style.INK)
            veil.set_alpha(int(255 * (1 - t_open / 16)))
            surface.blit(veil, (0, 0))

    def _row_cy(self, i):
        """Centre line of demeanor row i (rows follow a 24px header row)."""
        return PANEL.y + PAD + HEADER_CAP + 3 * G + 10 + ROW_H * i

    def _draw_location(self, surface, t_open):
        slide = ease_out_back(min(1, max(0, t_open - 6) / 22))
        x = int(MARGIN - (1 - slide) * 460)
        top = MARGIN - style.cap_top(40, True)          # caps start exactly on the margin
        r = style.text(surface, self.room.title.upper(), (x, top), 40, style.PARCHMENT, title=True)
        if self.time_text:
            style.text_mid(surface, f"Night of the murder  ·  {self.time_text}", x, r.bottom + 2 * G, 18, style.MIST)

    def _draw_demeanor(self, surface, enter):
        panel = PANEL.move(int((1 - enter) * 420), 0)
        style.nine_slice(surface, panel, "assets/dialogue_box/20240707dragon9SlicesB.png", 24, 2, fill=style.NIGHT)
        left, right = panel.x + PAD, panel.right - PAD
        style.text_mid(surface, "DEMEANOR", left, panel.y + PAD + HEADER_CAP // 2, 14, style.AMBER)
        levels = self.agent.get_personality_state()
        pips_left = right - (5 * PIP_W + 4 * PIP_GAP)
        for i, (trait, label, color) in enumerate(MOOD_LABELS):
            target = levels.get(trait, 0)
            cur = self.shown_levels.get(trait, target)
            cur += (target - cur) * 0.12
            self.shown_levels[trait] = cur
            cy = self._row_cy(i) + (panel.x - PANEL.x) * 0
            flashing = trait in self.row_flash and (self.row_flash[trait] // 5) % 2 == 0
            style.text_mid(surface, label, left, cy, 20, style.PARCHMENT if flashing else style.MIST)
            for p in range(5):
                r = pygame.Rect(pips_left + (panel.x - PANEL.x) + p * (PIP_W + PIP_GAP), cy - PIP_H // 2, PIP_W, PIP_H)
                fill = max(0.0, min(1.0, cur - p))
                pygame.draw.rect(surface, style.INK, r)
                if fill > 0:
                    pygame.draw.rect(surface, color, (r.x, r.y, int(r.w * fill), r.h))
                    pygame.draw.rect(surface, tuple(min(255, c + 60) for c in color), (r.x, r.y, int(r.w * fill), 4))
                pygame.draw.rect(surface, style.PARCHMENT if flashing else style.DUSK, r, 2)

        # expression chip: hugs its text, right-aligned to the panel, one grid row below
        label, color = LABELS[SHOCKED if self.sprite.shock_timer else self.sprite.emotion]
        tw = style.font(18).size(label)[0]
        chip = pygame.Rect(0, 0, 2 * G + 14 + G + tw + 2 * G, 5 * G)
        chip.topright = (panel.right, panel.bottom + 2 * G)
        pygame.draw.rect(surface, style.NIGHT, chip, border_radius=4)
        pygame.draw.rect(surface, color, chip, 2, border_radius=4)
        pygame.draw.circle(surface, color, (chip.x + 2 * G + 7, chip.centery), 7)
        style.text_mid(surface, label, chip.x + 2 * G + 14 + G, chip.centery, 18, color)

    def _draw_textbox(self, surface, enter):
        box = TEXTBOX.move(0, int((1 - enter) * 300))
        style.nine_slice(surface, box, "assets/dialogue_box/20240707dragon9SlicesB.png", 24, 2, fill=style.NIGHT, fill_alpha=240)
        left, right = box.x + PAD, box.right - PAD

        speaker = self.line["speaker"] if self.line else self.name
        is_player = speaker == "You"
        plate_img = style.image("assets/dialogue_box/20240707dragonHeaderB.png" if is_player
                                else "assets/dialogue_box/20240707dragonHeaderA.png", 2)
        if plate_img:
            # nameplate straddles the top border: its centre line sits on the frame's gold line
            plate = plate_img.get_rect(midleft=(box.x + PAD, box.y + FRAME // 2))
            surface.blit(plate_img, plate)
            style.text_mid(surface, "DETECTIVE" if is_player else speaker.upper(), plate.centerx, plate.centery,
                           22, style.PARCHMENT, title=True, align="center")
            if not is_player:
                # occupation tag pinned to the border, sharing the nameplate's centre line
                occ = self.suspect.get("occupation", "")
                tag = pygame.Rect(0, 0, style.font(16).size(occ)[0] + 4 * G, 3 * G)
                tag.midleft = (plate.right + G, plate.centery)
                pygame.draw.rect(surface, style.NIGHT, tag, border_radius=4)
                pygame.draw.rect(surface, style.DUSK, tag, 2, border_radius=4)
                style.text_mid(surface, occ, tag.centerx, tag.centery, 16, style.MIST, align="center", shadow=False)

        # dialogue: first line one grid row under the nameplate
        ty = box.y + PAD + G
        if self.line:
            shown = self.line["text"][: int(self.line["shown"])]
            color = (200, 215, 255) if is_player else style.PARCHMENT
            for i, ln in enumerate(style.wrap(shown, TEXT_SIZE, right - left)[:3]):
                style.text_mid(surface, ln, left, ty + LINE_H // 2 + i * LINE_H, TEXT_SIZE, color)
        elif self.sprite.thinking:
            style.text_mid(surface, "...", left, ty + LINE_H // 2, TEXT_SIZE, style.MIST)

        # input row pinned to the bottom content edge, divider one grid row above it
        row_cy = box.bottom - PAD - INPUT_ROW_H // 2
        div_y = row_cy - INPUT_ROW_H // 2 - 2 * G
        pygame.draw.line(surface, style.DUSK, (left, div_y), (right, div_y), 2)

        if self.line and self._line_done() and not self.sprite.thinking and not is_player:
            bob = 3 if (self.frame // 14) % 2 else 0
            ax, ay = right - 18, div_y - 2 * G - 12 + bob
            pygame.draw.polygon(surface, style.AMBER, [(ax, ay), (ax + 18, ay), (ax + 9, ay + 12)])

        waiting = self.is_loading or self.sprite.thinking
        style.text_mid(surface, ">", left, row_cy, 22, style.AMBER)
        input_x = left + 3 * G
        if self.user_input:
            style.text_mid(surface, self.user_input, input_x, row_cy, 22, style.PARCHMENT)
        else:
            ph = f"{self.name} is thinking..." if waiting else f"Ask {self.name} anything..."
            style.text_mid(surface, ph, input_x, row_cy, 22, style.DUSK, shadow=False)
        if not waiting and (self.frame // 20) % 2 == 0:
            cw = style.font(22).size(self.user_input)[0] if self.user_input else 0
            pygame.draw.rect(surface, style.AMBER, (input_x + cw + 2, row_cy - 11, 10, 22))

        style.text_mid(surface, "ENTER ask   ·   TAB notes   ·   ESC leave", right, row_cy, 14, style.MIST,
                       align="right", shadow=False)

    def _draw_backlog(self, surface):
        veil = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        veil.fill((*style.INK, 200))
        surface.blit(veil, (0, 0))
        panel = pygame.Rect(180, 70, 1040, 760)
        style.nine_slice(surface, panel, "assets/dialogue_box/20240707dragon9SlicesA.png", 40, 1, fill=style.NIGHT)
        style.text(surface, f"NOTES  ·  {self.name.upper()}", (panel.x + 60, panel.y + 48), 30, style.AMBER, title=True)
        rows = []
        for speaker, msg in self.messages:
            for j, ln in enumerate(style.wrap(msg, 20, panel.w - 260)):
                rows.append((speaker if j == 0 else "", ln, speaker == "You"))
            rows.append(("", "", False))
        visible = 17
        end = max(0, len(rows) - self.scroll_offset)
        start = max(0, end - visible)
        self.scroll_offset = len(rows) - end
        y = panel.y + 110
        for who, ln, mine in rows[start:end]:
            if who:
                style.text(surface, who, (panel.x + 60, y), 20, style.FROST if mine else style.AMBER)
            style.text(surface, ln, (panel.x + 200, y), 20, (200, 215, 255) if mine else style.PARCHMENT)
            y += 34
        if not self.messages:
            style.text(surface, "Nothing said yet.", (panel.x + 60, y), 20, style.MIST)
        style.text(surface, "scroll to read back  ·  TAB to close", (panel.centerx, panel.bottom - 50), 16, style.DUSK, center=True, shadow=False)
