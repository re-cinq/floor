// Thin HTTP client for the endpoints this agent calls on the Floor
// (docs/api_sketch.md, "Events - the queue that drives everything": every
// worker pulls). No retry logic here beyond what fetch gives for free — the
// claim loop above it decides what a failure means.

export interface ClaimedEvent {
  id: string;
  name: "station_run.dispatch" | "station_run.abort";
  payload: { visitId: string };
}

// The rich, executor-facing response `GET /station-runs/:id/brief` returns
// for a machine dispatcher (docs/assembly_run_storage.md calls this "the
// executor's private view"). A service SDK reduces the same response down
// to the plain `{needs: Record<string,string>}` a station author sees; this
// agent, building a Kubernetes manifest, needs the fuller structure — each
// need's kind, path and access, not just its resolved value.
export interface DispatchBriefResponse {
  visitId: string;
  floorBaseUrl: string;
  /** The visit token itself, scoped to this one visit — the Floor mints it at open and hands it back here so the executor can inject it into the pod's environment; see claim-loop.ts. */
  token: string;
  deadlineMinutes: number;
  settings: {
    model?: string;
    prompt: string;
    image: string;
    disallowedTools?: string[];
    skills?: string[];
    env?: Record<string, string>;
  };
  needs: (
    | { name: string; kind: "value"; value: string }
    | { name: string; kind: "file"; path: string; url: string }
    | { name: string; kind: "git"; path: string; repoUrl: string; ref: string; access: "read" | "write" }
  )[];
  produces: { name: string; kind: "value" | "file"; path?: string }[];
  conversation: { mode: "new" } | { mode: "continue"; sessionRef: string };
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

    if (res.status === 204) return [];
    if (!res.ok) throw await httpError("claim", res);

    return (await res.json()) as ClaimedEvent[];
  }

  async ack(eventId: string): Promise<void> {
    const res = await this.post(`/events/${eventId}/ack`, {});

    if (!res.ok) throw await httpError("ack", res);
  }

  async fail(eventId: string, error: string, permanent = false): Promise<void> {
    const res = await this.post(`/events/${eventId}/fail`, { error, permanent });

    if (!res.ok) throw await httpError("fail", res);
  }

  async brief(visitId: string): Promise<DispatchBriefResponse> {
    const res = await this.fetchFn(`${this.deps.baseUrl}/station-runs/${visitId}/brief`, {
      headers: { authorization: `Bearer ${this.deps.token}` },
    });

    if (!res.ok) throw await httpError("brief", res);

    return (await res.json()) as DispatchBriefResponse;
  }

  /** Only for a `git` need declaring `access: write` (docs/api_sketch.md); refused with 403 for any other need. There is deliberately no read-credential exchange here — a read-only git need in this design clones without a token, which only works against a public repo. See the claim loop's dispatch handler for where this is called. */
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
