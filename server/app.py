"""
HTTP API for bly manor. Run from the repo root:

    uvicorn server.app:app --reload

BLY_MOCK_AI=1 swaps OpenAI for canned replies (no key needed).
After `npm run build` in web/, this one process also serves the game itself.
"""
import asyncio
import json
import os
import threading
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .agents import llm

from .game import Game, GameError

load_dotenv()
MOCK = os.getenv("BLY_MOCK_AI") == "1"
if MOCK:
    from .mock_ai import MockClient
    llm.use(MockClient(delay=float(os.getenv("BLY_MOCK_DELAY", "0.03"))))
elif not os.getenv("OPENAI_API_KEY"):
    raise SystemExit("OPENAI_API_KEY is not set. Put it in .env, or run with BLY_MOCK_AI=1.")

MAX_GAMES = int(os.getenv("BLY_MAX_GAMES", "200"))

app = FastAPI(title="bly manor")
games: dict[str, Game] = {}
games_lock = threading.Lock()


class NewGame(BaseModel):
    test: bool = False


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=300)


class Accusation(BaseModel):
    name: str


def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def get_game(gid) -> Game:
    game = games.get(gid)
    if not game:
        raise HTTPException(404, "game not found")
    return game


def guard(fn, *args):
    try:
        return fn(*args)
    except GameError as e:
        raise HTTPException(400, str(e))


@app.get("/api/health")
def health():
    return {"ok": True, "mock": MOCK, "games": len(games)}


@app.post("/api/games")
def new_game(body: NewGame):
    gid = uuid.uuid4().hex
    try:
        game = Game(gid, test=body.test)
    except GameError as e:
        raise HTTPException(502, str(e))
    with games_lock:
        if len(games) >= MAX_GAMES:  # forget the oldest game
            oldest = min(games.values(), key=lambda g: g.created)
            games.pop(oldest.id, None)
        games[gid] = game
    return game.public()


@app.get("/api/games/{gid}")
def game_state(gid: str):
    return get_game(gid).public()


@app.post("/api/games/{gid}/suspects/{name}/opening")
def opening(gid: str, name: str):
    game = get_game(gid)
    text = guard(game.opening, name)
    return {"text": text, "moods": game.agents[name].get_personality_state()}


@app.post("/api/games/{gid}/suspects/{name}/ask")
def ask(gid: str, name: str, body: Question):
    """Server-sent events: `token` pieces as the suspect talks, then `done` with moods."""
    game = get_game(gid)
    guard(game.suspect, name)

    def stream():
        try:
            for item in game.ask(name, body.question.strip()):
                if isinstance(item, str):
                    yield sse("token", {"t": item})
                else:
                    yield sse("done", item)
        except Exception as e:  # the model failed mid-reply
            yield sse("error", {"message": e.__class__.__name__})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/games/{gid}/suspects/{name}/leave")
def leave(gid: str, name: str):
    return {"gossip": guard(get_game(gid).leave, name)}


@app.get("/api/games/{gid}/events")
async def events(gid: str, request: Request, after: int = 0):
    """Server-sent events: each gossip hop as it happens."""
    game = get_game(gid)
    resume = request.headers.get("last-event-id", "")
    if resume.isdigit():  # EventSource reconnected: carry on where it stopped
        after = int(resume)

    async def stream():
        sent = after
        idle = 0
        while not await request.is_disconnected():
            with game.lock:
                fresh = game.events[sent:]
            for event in fresh:
                sent += 1
                yield f"id: {sent}\n" + sse(event["type"], event)
            idle = 0 if fresh else idle + 1
            if idle and idle % 60 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.25)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/games/{gid}/logs")
def logs(gid: str):
    return get_game(gid).logs()


@app.post("/api/games/{gid}/accuse")
def accuse(gid: str, body: Accusation):
    return guard(get_game(gid).accuse, body.name)


# the built web client, if there is one: one process serves the whole game
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
