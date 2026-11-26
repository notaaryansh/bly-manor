"""
One game of bly manor, held in memory on the server. Everything the player
must not see yet (the murderer, the motive, each suspect's briefing) stays
in here; public() is the only view that leaves the server before an accusation.
"""
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from src.agents import AgentCommunicationManager, AgentOrchestrator, MurderMysteryMaster, SuspectAgent

from . import content

TEST_CASE = os.path.join(os.path.dirname(__file__), "..", "src", "test_case.json")
PUBLIC_SUSPECT_FIELDS = ("name", "age", "gender", "occupation", "personality_traits", "is_victim")


class GameError(Exception):
    pass


class Game:
    def __init__(self, gid, test=False, chaos=True):
        self.id = gid
        self.chaos = chaos
        self.created = time.time()
        self.lock = threading.Lock()
        self.events = []            # gossip events, read by the SSE stream
        self.accused = None

        self.master = MurderMysteryMaster()
        if test:
            with open(TEST_CASE) as f:
                self.master.case_state = json.load(f)
        elif not self.master.generate_case_state():
            raise GameError("could not generate a case")
        self.master.build_world_state()
        m = self.master
        self.orchestrator = AgentOrchestrator(m.case_state, m.suspects, m.relationships, m.clues)

        living = [n for n, s in m.suspects.items() if not s["is_victim"]]
        with ThreadPoolExecutor(max_workers=len(living)) as pool:  # each briefing is an AI call
            agents = pool.map(self._make_agent, living)
        self.agents = dict(zip(living, agents))

        self.transcripts = {n: [] for n in living}   # (speaker, text) pairs
        self.openings = {}
        self.snippets = {n: [] for n in living}
        self.last_exchange = {}
        self.comms = AgentCommunicationManager(self.agents, m.relationships, m.case_state,
                                               on_gossip=self._on_gossip) if chaos else None

    def _make_agent(self, name):
        m = self.master
        rels = {}
        for pair, rel in m.relationships.items():
            a, b = pair.split("_")
            if name in (a, b):
                rels[b if a == name else a] = rel
        return SuspectAgent(m.suspects[name], rels, m.case_state, m.clues, self.orchestrator)

    # ---------------------------------------------------------------- views
    def moods(self):
        return {n: a.get_personality_state() for n, a in self.agents.items()}

    def public(self):
        m = self.master
        suspects = []
        for s in m.suspects.values():
            view = {k: s[k] for k in PUBLIC_SUSPECT_FIELDS}
            if not s["is_victim"]:
                view["moods"] = self.agents[s["name"]].get_personality_state()
                view["questioned"] = bool(self.transcripts[s["name"]])
            suspects.append(view)
        return {
            "id": self.id,
            "chaos": self.chaos,
            "victim": m.victim,
            "crime_location": m.crime_location,
            "cause_of_death": m.cause_of_death,
            "time_of_death": m.time_of_death,
            "suspects": suspects,
            "relationships": m.relationships,
            "briefing": content.briefing(m),
            "facts": content.facts(m),
            "accused": self.accused,
        }

    def suspect(self, name):
        if name not in self.agents:
            raise GameError(f"no suspect called {name}")
        if self.accused:
            raise GameError("the case is closed")
        return self.agents[name]

    # ---------------------------------------------------------------- actions
    def opening(self, name):
        agent = self.suspect(name)
        if name not in self.openings:
            text = agent.get_opening_statement()
            self.openings[name] = text
            self.transcripts[name].append((name, text))
        return self.openings[name]

    def ask(self, name, question):
        """Yield reply pieces; the last item is a dict with the final reply and mood changes."""
        agent = self.suspect(name)
        before = agent.get_personality_state()
        self.transcripts[name].append(("You", question))
        parts = []
        for piece in agent.respond_stream(question):
            parts.append(piece)
            yield piece
        reply = "".join(parts).strip()
        self.transcripts[name].append((name, reply))
        self.last_exchange[name] = (question, reply)
        after = agent.get_personality_state()
        deltas = {k: round(after[k] - before.get(k, after[k]), 2) for k in after if after[k] != before.get(k)}
        yield {"text": reply, "moods": after, "deltas": deltas}

    def leave(self, name):
        """The detective leaves a room: rumours start, and the log gets a new line."""
        self.suspect(name)
        threading.Thread(target=self._add_snippet, args=(name,), daemon=True).start()
        if self.comms and name in self.last_exchange:
            question, reply = self.last_exchange.pop(name)
            self.comms.trigger_agent_communications(name, question, reply)
            return True
        return False

    def _add_snippet(self, name):
        if not self.transcripts[name]:
            return
        line = content.snippet(name, self.transcripts[name], self.snippets[name])
        if line and line not in self.snippets[name]:
            self.snippets[name].append(line)

    def _on_gossip(self, src, dst, text, rel_type, levels):
        with self.lock:
            self.events.append({"type": "gossip", "from": src, "to": dst, "text": text,
                                "relationship": rel_type, "moods": levels})

    def logs(self):
        return {n: list(s) for n, s in self.snippets.items() if self.transcripts[n]}

    def accuse(self, name):
        self.suspect(name)
        self.accused = name
        m = self.master
        return {
            "accused": name,
            "correct": name == m.case_state["murderer"],
            "murderer": m.case_state["murderer"],
            "motive": m.case_state["murderer_motive"],
            "lines": content.results(m, self.orchestrator, name),
        }
