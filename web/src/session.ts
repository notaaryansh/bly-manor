// The case the server dealt, as the player is allowed to see it.

import { getGame, newGame, type GameState, type Moods } from "./api";

const params = new URLSearchParams(location.search);
/** ?test=1 plays the fixed practice case; ?calm=1 turns off chaos gossip. */
export const TEST = params.get("test") === "1";
export const CHAOS = params.get("calm") !== "1";

export let game: GameState | null = null;

export async function deal() {
  game = await newGame(TEST, CHAOS);
  transcripts.clear();
  return game;
}

export async function refresh() {
  if (game) game = await getGame(game.id);
  return game;
}

export const living = () => (game ? game.suspects.filter((s) => !s.is_victim) : []);

export function setMoods(name: string, moods: Moods) {
  const s = game?.suspects.find((x) => x.name === name);
  if (s) s.moods = moods;
}

export function markQuestioned(name: string) {
  const s = game?.suspects.find((x) => x.name === name);
  if (s) s.questioned = true;
}

/** What each suspect and the detective said, for the notes view. */
export const transcripts = new Map<string, [speaker: string, text: string][]>();
export function transcript(name: string) {
  let t = transcripts.get(name);
  if (!t) transcripts.set(name, (t = []));
  return t;
}
