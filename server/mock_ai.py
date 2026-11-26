"""
A stand-in for the OpenAI client so the whole game runs with no key.
Turned on with BLY_MOCK_AI=1. Replies are canned but shaped like the real ones:
the case is the test case, moods move, gossip spreads, replies stream.
"""
import itertools
import json
import os
import random
import time
from types import SimpleNamespace as NS

CASE_PATH = os.path.join(os.path.dirname(__file__), "test_case.json")

REPLIES = itertools.cycle([
    "I was in the library all evening. Reading. Ask anyone.",
    "Eleven forty-five? I... I don't remember the exact time. Why does it matter?",
    "How dare you. I've told you everything I know about that night!",
    "Fine. I heard raised voices near the study. That's all I'll say.",
    "You should be asking James's other friends, not me.",
])
OPENINGS = itertools.cycle([
    "Detective. I suppose you want to know where I was.",
    "Let's get this over with. I have nothing to hide.",
    "I... yes, come in. This whole thing is awful.",
])
MOODS = itertools.cycle([
    {"Anxious": 1}, {"Moody": 1, "Trust": -1}, {"Trust": 1}, {"Anxious": 2, "Trust": -1}, {},
])
GOSSIP = itertools.cycle([
    "The detective grilled me about 11:45. I think they suspect me.",
    "Watch what you say, they're asking about the study.",
    "Apparently I was 'acting nervous'. Can you believe it?",
])
SNIPPETS = itertools.cycle([
    "Vague about where they were at 11:45",
    "Got defensive when the study came up",
    "Pointed the finger at someone else",
])


def _message(text):
    return NS(choices=[NS(message=NS(content=text))])


def _stream(text, delay):
    for word in text.split(" "):
        time.sleep(delay)
        yield NS(choices=[NS(delta=NS(content=word + " "))])


class _Completions:
    def __init__(self, delay):
        self.delay = delay

    def create(self, **kwargs):
        messages = kwargs.get("messages", [])
        prompt = " ".join(str(m.get("content", "")) for m in messages)
        if kwargs.get("stream"):
            return _stream(next(REPLIES), self.delay)
        if "master storyteller for a murder mystery" in prompt:
            with open(CASE_PATH) as f:
                return _message(f.read())
        if "hintable facts" in prompt:
            return _message(json.dumps(["heard arguing near the study", "saw someone in the hall at 11:40"]))
        if "Analyze how this interrogation affects" in prompt:
            return _message(json.dumps(next(MOODS)))
        if "opening statement" in prompt:
            return _message(next(OPENINGS))
        if "You were just interrogated by a detective" in prompt:
            return _message(next(GOSSIP))
        if "observation" in prompt:
            return _message(next(SNIPPETS))
        return _message(random.choice(["...", "I'd rather not say."]))


class MockClient:
    def __init__(self, delay=0.03):
        self.chat = NS(completions=_Completions(delay))
