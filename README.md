# bly manor

murder mystery game where every suspect is an ai and they all lie to you lol. runs in the browser now

![talking to david, he gets nervous then annoyed then freaks out](docs/screenshots/interrogation.gif)

so basically someone got killed at bly manor last night. theres 6 people in the house, one of them is dead and one of the other 5 did it. you go talk to them one by one and try to figure out who

every game is a new case btw. the ai makes up the victim, the killer, why they did it, everyones alibis and who hates who. so you cant just memorize it

the suspects are nick (lawyer), sarah (artist), james (chef), emma (tech), david (writer) and lisa (musician). any of them can end up dead and any of the rest can be the killer

![title screen with the storm](docs/screenshots/title.png)

## how it works

you just type questions, theres no dialogue options or anything. ask whatever

each suspect has nerves, temper and trust and it changes based on how you talk to them. you can see it on their face too, they start sweating if theyre nervous, get the little anger thing if you piss them off, and if you hit a nerve the whole screen shakes. be nice and they open up more, be a jerk and they lie more (kinda like real life idk)

innocent people lie too btw. everyone has some secret (affairs, money stuff, whatever) so dont assume the liar is the killer

press tab while talking to someone to see everything theyve said so far. when you think you know who did it hit accuse. you get one shot

<p>
  <img src="docs/screenshots/interrogation.png" width="49%" alt="david in the drawing room">
  <img src="docs/screenshots/shaken.png" width="49%" alt="david freaking out about the letter">
</p>

first time you play theres a little tour that shows you what everything is. press H on the board if you want it again

![the tour pointing at the suspects](docs/screenshots/tour.png)

## suspects (the corkboard)

they gossip behind your back. you leave a room and whatever you asked gets passed around to their friends / exes / rivals, usually twisted a bit, and then they treat you different

the suspects board on the right shows this. everyones pinned on a corkboard with string between them (color = how they know each other) and when someone tells someone something the string lights up going from one to the other. its always on, tbh my fav part

<img src="docs/screenshots/suspects.gif" width="280" alt="gossip going around the suspects board">

![the board with all the suspects](docs/screenshots/board.png)

## running it

need python 3.10+, node 18+ and an openai key thats it

```bash
git clone https://github.com/notaaryansh/bly-manor.git && cd bly-manor
cp .env.example .env   # put your openai key in here
./dev.sh
```

then open http://localhost:5173. first run installs everything so it takes a sec

no key? `BLY_MOCK_AI=1 ./dev.sh` runs it with fake canned answers, good for messing with the ui. add `?test=1` to the url to get the same case every time

if you want to host it somewhere its one process:

```bash
cd web && npm run build && cd ..
.venv/bin/uvicorn server.app:app --host 0.0.0.0 --port 8000
```

controls: type and hit enter to ask (enter also skips the text typing out), tab for notes, esc to leave a room / close stuff / cancel an accusation, H for the tour, M to mute

the game itself is plain typescript + canvas, no framework, and its tiny (like 25kb gzipped) so it should run on pretty much anything. the python server just holds the case and talks to openai, the killer never gets sent to your browser so no peeking in devtools

<p>
  <img src="docs/screenshots/notes.png" width="49%" alt="notes on what david said">
  <img src="docs/screenshots/verdict.png" width="49%" alt="the verdict">
</p>

## Credits

ui art is tiny rpg dragon regalia gui by gabriel "tiopalada" lima and gui interface kit by jamie cross (both cc0). fonts are [raster forge](https://www.fontspace.com/raster-forge-font-f135159) and [geist pixel](https://github.com/vercel/geist-font). the rain is a real recording, [rain (loopable)](https://opengameart.org/content/rain-loopable) by ylmir (cc0). the music, thunder, sound effects and the rooms are just made in code

the forest background ([oak woods](https://brullov.itch.io/oak-woods) by brullov) and the character portraits (craftpix) are paid packs so theyre not in the repo. game still works without them, you just get silhouettes and a plain sky. if you have them put them in `web/public/assets/oak_woods_v1.0/` and `web/public/assets/potrait/` (yes potrait is spelled wrong, its staying)
