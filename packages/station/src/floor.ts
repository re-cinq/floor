// The floor, as a station reaches it: over HTTP and nothing else. The service token claims and acks; everything about one visit goes under that visit's own token.

export interface Claimed {
  id: string;
  name: string;
  payload: { visitId: string };
}

export type BriefNeed =
  | { name: string; kind: "value"; value: string }
  | { name: string; kind: "file"; path: string; url: string }
  | { name: string; kind: "git"; path: string; repoUrl: string; ref: string };

export interface VisitBrief {
  visitId: string;
  iteration: number;
  token: string;
  deadlineMinutes: number;
  needs: BriefNeed[];
}

export interface FloorAccess {
  floorUrl: string;
  token: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;

export class Floor {
  constructor(private readonly access: FloorAccess) {}

  async claim(tags: string[], limit: number): Promise<Claimed[]> {
    const response = await this.send("/events/claim", { method: "POST", body: JSON.stringify({ tags, limit }) });

    return response.status === HTTP_NO_CONTENT ? [] : ((await response.json()) as Claimed[]);
  }

  async ack(eventId: string): Promise<void> {
    await this.send(`/events/${eventId}/ack`, { method: "POST" });
  }

  async fail(eventId: string, error: string): Promise<void> {
    await this.send(`/events/${eventId}/fail`, { method: "POST", body: JSON.stringify({ error, permanent: false }) });
  }

  /** Null when the visit is already done: a dispatch delivered again after its visit reported. */
  async brief(visitId: string): Promise<VisitBrief | null> {
    const response = await this.request(`/station-runs/${visitId}/brief`, {}, this.access.token);

    if (response.status === HTTP_CONFLICT) return null;

    return (await accepted(response)).json() as Promise<VisitBrief>;
  }

  // The brief gives a file's address as a pod would reach it. A station reaches the floor its own way, so only the path is taken from it.
  async read(url: string, visitToken: string): Promise<Buffer> {
    const response = await accepted(await this.request(new URL(url).pathname, {}, visitToken));

    return Buffer.from(await response.arrayBuffer());
  }

  async store(bytes: Buffer, visitToken: string): Promise<string> {
    const response = await this.request("/blobs", { method: "POST", body: new Uint8Array(bytes), headers: { "content-type": "application/octet-stream" } }, visitToken);
    const stored = (await (await accepted(response)).json()) as { hash: string };

    return stored.hash;
  }

  async record(visitId: string, body: unknown, visitToken: string): Promise<void> {
    const records = [{ kind: "llm_call", body, occurredAt: new Date().toISOString() }];

    await accepted(await this.request(`/station-runs/${visitId}/records`, { method: "POST", body: JSON.stringify({ records }) }, visitToken));
  }

  // Deduplicated on the visit, so posting it again after a lost answer reports once.
  async report(visitId: string, report: unknown, worker: string): Promise<void> {
    const event = { name: "station_run.reported", payload: { visitId, worker, report }, dedupeKey: `station_run.reported:${visitId}` };

    await this.send("/events", { method: "POST", body: JSON.stringify(event) });
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    return accepted(await this.request(path, init, this.access.token));
  }

  private request(path: string, init: RequestInit, token: string): Promise<Response> {
    const headers = { "content-type": "application/json", ...init.headers, authorization: `Bearer ${token}` };

    return fetch(`${this.access.floorUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }
}

async function accepted(response: Response): Promise<Response> {
  if (response.ok) return response;

  throw new Error(`the floor answered ${response.status} to ${response.url}: ${await response.text()}`);
}
