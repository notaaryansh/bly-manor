"""Plays a whole case against the mock AI. Run from the repo root: pytest server"""
import json
import time

import pytest
from fastapi.testclient import TestClient

from server.app import app, games

client = TestClient(app)


def sse_events(text):
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "event" in lines:
            out.append((lines["event"], json.loads(lines["data"])))
    return out


@pytest.fixture
def game():
    r = client.post("/api/games", json={"test": True, "chaos": True})
    assert r.status_code == 200
    return r.json()


def wait_for(check, seconds=5):
    end = time.time() + seconds
    while time.time() < end:
        if check():
            return True
        time.sleep(0.05)
    return False


def test_health_reports_mock():
    assert client.get("/api/health").json()["mock"] is True


def test_new_game_hides_the_answer(game):
    secret = games[game["id"]].master.case_state
    raw = json.dumps(game)
    assert secret["murderer_motive"] not in raw
    for key in ("murderer", "is_murderer", "alibi", "murderer_motive"):
        assert f'"{key}"' not in raw
    living = [s for s in game["suspects"] if not s["is_victim"]]
    assert len(game["suspects"]) == 6 and len(living) == 5
    assert all("moods" in s for s in living)
    assert game["briefing"] and game["facts"]


def test_opening_and_streamed_answer(game):
    name = next(s["name"] for s in game["suspects"] if not s["is_victim"])
    opening = client.post(f"/api/games/{game['id']}/suspects/{name}/opening").json()
    assert opening["text"]

    r = client.post(f"/api/games/{game['id']}/suspects/{name}/ask", json={"question": "Where were you at 11:45?"})
    events = sse_events(r.text)
    tokens = [d["t"] for e, d in events if e == "token"]
    done = [d for e, d in events if e == "done"]
    assert len(tokens) > 1 and len(done) == 1
    assert done[0]["text"] == "".join(tokens).strip()
    assert set(done[0]["moods"]) == {"Anxious", "Moody", "Trust"}

    state = client.get(f"/api/games/{game['id']}").json()
    assert next(s for s in state["suspects"] if s["name"] == name)["questioned"]


def test_leaving_spreads_gossip_and_logs(game):
    gid = game["id"]
    name = next(s["name"] for s in game["suspects"] if not s["is_victim"])
    client.post(f"/api/games/{gid}/suspects/{name}/ask", json={"question": "Did you kill them?"})
    assert client.post(f"/api/games/{gid}/suspects/{name}/leave").json()["gossip"] is True

    g = games[gid]
    assert wait_for(lambda: len(g.events) > 0)
    event = g.events[0]
    assert event["from"] == name and event["to"] in g.agents and event["text"]
    assert set(event["moods"]) == {"Anxious", "Moody", "Trust"}
    assert wait_for(lambda: client.get(f"/api/games/{gid}/logs").json().get(name))


def test_accusation_reveals_and_closes_the_case(game):
    gid = game["id"]
    murderer = games[gid].master.case_state["murderer"]
    r = client.post(f"/api/games/{gid}/accuse", json={"name": murderer}).json()
    assert r["correct"] is True and r["murderer"] == murderer
    assert any("CORRECT" in line for line in r["lines"])
    assert client.post(f"/api/games/{gid}/suspects/{murderer}/opening").status_code == 400


def test_bad_ids(game):
    assert client.get("/api/games/nope").status_code == 404
    assert client.post(f"/api/games/{game['id']}/suspects/Nobody/opening").status_code == 400
    assert client.post(f"/api/games/{game['id']}/suspects/Nick/ask", json={"question": ""}).status_code == 422


def test_events_resume_after_reconnect(game):
    gid = game["id"]
    g = games[gid]
    g._on_gossip("Nick", "Sarah", "one", "Close Friend", {"Anxious": 1, "Moody": 1, "Trust": 1})
    g._on_gossip("Nick", "David", "two", "Rival", {"Anxious": 1, "Moody": 1, "Trust": 1})
    with client.stream("GET", f"/api/games/{gid}/events", headers={"Last-Event-ID": "1"}) as r:
        for line in r.iter_lines():
            if line.startswith("data:"):
                assert json.loads(line[5:])["text"] == "two"
                break
