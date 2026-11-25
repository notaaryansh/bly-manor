# Murder at Bly Manor

A pixel-art detective game where every suspect is an AI with its own story, secrets and temper.

Someone was killed at Bly Manor last night. Six people were in the house. One is dead, one of the other five did it, and none of them are going to make this easy.

## How it plays

Every game is a new case. The victim, the killer, the motive, the weapon, the alibis and the web of relationships between the guests are all written fresh, so you can't memorize your way to the answer.

You question the suspects one at a time, in your own words. There are no dialogue trees: ask anything, and they answer in character.

- **Read the room.** Each suspect has three moods that shift as you talk: **Anxious**, **Moody** and **Trust**. Push too hard and they get nervous and start mixing up their story. Be rude and they turn sarcastic. Treat them with respect and they open up.
- **Catch the lie.** Innocent suspects still hide things: affairs, debts, grudges. The killer has a story to protect. Compare what each of them tells you and look for the cracks.
- **Use your notes.** **Facts** keeps the case details in one place. **Logs** keeps track of everything you've been told.
- **Make the call.** When you're sure, hit **Accuse**. You'll find out whether you got it right, and what really happened.

## The guests

| Name | Occupation | Personality |
| --- | --- | --- |
| **Nick** | Lawyer | Intelligent, ambitious, witty |
| **Sarah** | Artist | Creative, sensitive, observant |
| **James** | Chef | Charming, confident, jealous |
| **Emma** | Tech worker | Logical, introverted, calculated |
| **David** | Writer | Observant, sarcastic, moody |
| **Lisa** | Musician | Expressive, emotional, loyal |

Any one of them can be the victim, and any of the rest can be the killer.

## Modes

- **Chaos mode** (`--chaos true`): the suspects talk to each other behind your back. Whatever you ask one of them spreads to their friends, partners and rivals, often bent along the way, and changes how the others treat you next.
- **Behind the scenes** (`--visualize true`): opens a live map of the house's social network, so you can watch the gossip move and the moods change as you play.
- **Practice case** (`--test true`): plays a fixed case instead of a new one.

## Play it

You need Python 3.10+ and an OpenAI API key.

```bash
git clone https://github.com/notaaryansh/tuff.git && cd tuff
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your OpenAI key
python3 main.py
```

Try `python3 main.py --chaos true` once you've solved a case or two.

## Credits

Interface art: Tiny RPG Dragon Regalia GUI by Gabriel "tiopalada" Lima and GUI Interface Kit by Jamie Cross (both CC0). Title font: [Raster Forge](https://www.fontspace.com/raster-forge-font-f135159). The forest background ([Oak Woods](https://brullov.itch.io/oak-woods) by brullov) and the suspect portraits (CraftPix) aren't included; drop them into `assets/oak_woods_v1.0/` and `assets/potrait/` for the full look.
