// Talks to the python game server (server/app.py). The browser never sees the
// murderer or the OpenAI key; it only gets what a player is allowed to know.

export type Moods = { Anxious: number; Moody: number; Trust: number };

export interface Suspect {
  name: string;
  age: number;
  gender: string;
  occupation: string;
  personality_traits: string[];
  is_victim: boolean;
  moods?: Moods;
  questioned?: boolean;
}

export interface GameState {
  id: string;
  victim: string;
  crime_location: string;
  cause_of_death: string;
  time_of_death: string;
  suspects: Suspect[];
  relationships: Record<string, string>;
  briefing: string[];
  facts: string[];
  accused: string | null;
}

export interface Reply {
  text: string;
  moods: Moods;
  deltas: Partial<Moods>;
}

export interface Gossip {
  from: string;
  to: string;
  text: string;
  relationship: string;
  moods: Moods;
}

export interface Verdict {
  accused: string;
  correct: boolean;
  murderer: string;
  motive: string;
  lines: string[];
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export const newGame = (test = false) => call<GameState>("POST", "/games", { test });
export const getGame = (id: string) => call<GameState>("GET", `/games/${id}`);
export const opening = (id: string, name: string) =>
  call<{ text: string; moods: Moods }>("POST", `/games/${id}/suspects/${name}/opening`);
export const leave = (id: string, name: string) => call<{ gossip: boolean }>("POST", `/games/${id}/suspects/${name}/leave`);
export const logs = (id: string) => call<Record<string, string[]>>("GET", `/games/${id}/logs`);
export const accuse = (id: string, name: string) => call<Verdict>("POST", `/games/${id}/accuse`, { name });

/** Ask a question; onToken gets each piece of the reply as the suspect "talks". */
export async function ask(id: string, name: string, question: string, onToken: (t: string) => void): Promise<Reply> {
  const r = await fetch(`/api/games/${id}/suspects/${name}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!r.ok || !r.body) throw new Error(`ask: ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const ev = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || !data) continue;
      const payload = JSON.parse(data);
      if (ev === "token") onToken(payload.t);
      else if (ev === "done") return payload as Reply;
      else if (ev === "error") throw new Error(payload.message);
    }
  }
  throw new Error("ask: stream ended early");
}

/** Gossip hops as they happen. Returns a function that stops listening. */
export function onGossip(id: string, handler: (g: Gossip) => void): () => void {
  const es = new EventSource(`/api/games/${id}/events`);
  es.addEventListener("gossip", (e) => handler(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
