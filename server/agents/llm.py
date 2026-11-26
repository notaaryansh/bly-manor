"""
One shared OpenAI client for every agent, created on first use.
Tests and the server's mock mode swap it out with use().
"""
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
_client = None


def client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


def use(fake_client):
    """Swap in another client (e.g. the mock) for every agent."""
    global _client
    _client = fake_client
