# Murder at Bly Manor

An AI murder-mystery detective game. Six suspects, each played by its own AI agent, one of them is the killer. Interrogate them, catch the contradictions, make your accusation.

## Run it

You only need Python 3.10+ and an OpenAI API key.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then put your OpenAI key in .env
python3 main.py
```

## Options

| Flag | What it does |
| --- | --- |
| `--test true` | Use the cached case in `src/test_case.json` instead of generating a new one |
| `--chaos true` | Suspects gossip with each other between interrogations and change their stories |
| `--visualize true` | Side panel showing how the agents are interacting |

Example: `python3 main.py --chaos true --visualize true`

## Art

The GUI kit, icons and title font in `assets/` are CC0 / public domain and ship with the repo. The forest background ([Oak Woods by brullov](https://brullov.itch.io/oak-woods)) and suspect portraits (CraftPix) are licensed packs that can't be redistributed, so they're gitignored. Without them the game shows a plain background and no portraits. To get the full look, put them at `assets/oak_woods_v1.0/` and `assets/potrait/`.
