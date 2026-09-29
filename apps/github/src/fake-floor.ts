// A stand-in for the floor's HTTP API: what floor.ts and review-router.ts each post or ask, recorded and answered.
import type { IncomingMessage } from "node:http";
import { startFakeServer, type Answer } from "./fake-http.js";

const HTTP_OK = 200;

export interface Run {
  outcome: string | null;
}

export interface FakeFloor {
  floorUrl: string;
  /** Every request taken, as `METHOD path`. */
  asked: string[];
  /** Every body posted, parsed. */
  posted: unknown[];
  /** What `GET /assembly-runs` answers with. Tests set this before calling. */
  runs: Run[];
  /** What every POST answers with; tests set it to something non-ok to exercise a refusal. */
  status: number;
  close(): Promise<void>;
}

interface State {
  asked: string[];
  posted: unknown[];
  runs: Run[];
  status: number;
}

export async function startFakeFloor(): Promise<FakeFloor> {
  const state: State = { asked: [], posted: [], runs: [], status: HTTP_OK };
  const server = await startFakeServer((request, body) => {
    state.asked.push(`${request.method} ${request.url}`);

    return answerTo(request, body, state);
  });

  return Object.assign(state, { floorUrl: server.url, close: server.close });
}

function answerTo(request: IncomingMessage, body: string, state: State): Answer {
  const path = request.url ?? "";

  if (path.startsWith("/assembly-runs")) return { status: HTTP_OK, body: { items: state.runs } };
  if (body) state.posted.push(JSON.parse(body));

  return { status: state.status, body: {} };
}
