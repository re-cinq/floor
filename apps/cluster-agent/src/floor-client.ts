// Thin HTTP client for the endpoints this agent calls on the Floor (docs/api_sketch.md, "Events"); no retry beyond what fetch gives, the claim loop decides what a failure means.

import type { BriefNeed, Produce } from "./domain/need.js";
import type { DispatchSettings, Conversation } from "./domain/agent-triple.js";

const HTTP_NO_CONTENT = 204;

export interface ClaimedEvent {
  id: string;
  name: "station_run.dispatch" | "station_run.abort";
  payload: { visitId: string };
}

/** The executor-facing response `GET /station-runs/:id/brief` returns for a machine dispatcher; richer than the plain Brief a station author sees, since a Kubernetes manifest needs each need's kind, path and access. */
export interface DispatchBriefResponse {
  visitId: string;
  floorBaseUrl: string;
  /** Scoped to this one visit; injected into the pod's environment by the claim loop. */
  token: string;
  deadlineMinutes: number;
  settings: DispatchSettings;
  needs: BriefNeed[];
  produces: Produce[];
  conversation: Conversation;
  modelSecretKey?: string;
}

export interface FloorClientDeps {
  baseUrl: string;
  token: string;
  fetchFn?: typeof fetch;
}

export class FloorClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly deps: FloorClientDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async claim(tags: string[], limit: number): Promise<ClaimedEvent[]> {
    const res = await this.post("/events/claim", { tags, limit });

    if (res.status === HTTP_NO_CONTENT) return [];
    if (!res.ok) throw await httpError("claim", res);

    return (await res.json()) as ClaimedEvent[];
  }

  async ack(eventId: string): Promise<void> {
    const res = await this.post(`/events/${eventId}/ack`, {});

    if (!res.ok) throw await httpError("ack", res);
  }

  /** Requeues with backoff. */
  async fail(eventId: string, error: string): Promise<void> {
    const res = await this.post(`/events/${eventId}/fail`, { error, permanent: false });

    if (!res.ok) throw await httpError("fail", res);
  }

  /** No retry: an unknown event name, for instance, would never succeed. */
  async deadLetter(eventId: string, error: string): Promise<void> {
    const res = await this.post(`/events/${eventId}/fail`, { error, permanent: true });

    if (!res.ok) throw await httpError("dead-letter", res);
  }

  async brief(visitId: string): Promise<DispatchBriefResponse> {
    const res = await this.fetchFn(`${this.deps.baseUrl}/station-runs/${visitId}/brief`, {
      headers: { authorization: `Bearer ${this.deps.token}` },
    });

    if (!res.ok) throw await httpError("brief", res);

    return (await res.json()) as DispatchBriefResponse;
  }

  /** Only for a `git` need declaring `access: write`; refused with 403 otherwise. A read-only need clones without a token, which only works against a public repo — see claim-loop.ts's dispatch handler. */
  async gitCredential(visitId: string): Promise<string> {
    const res = await this.post(`/station-runs/${visitId}/git-credential`, {});

    if (!res.ok) throw await httpError("git-credential", res);
    const body = (await res.json()) as { token: string };

    return body.token;
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.fetchFn(`${this.deps.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.deps.token}`,
      },
      body: JSON.stringify(body),
    });
  }
}

async function httpError(verb: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");

  return new Error(`${verb} failed with HTTP ${res.status}: ${body}`);
}
