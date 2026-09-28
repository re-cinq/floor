// The review router: a push to a pull request is reviewed in full if it never was, and rechecked if it was. lore made that choice in code; here it is a station, and the choice is a run one can look at.
import type { Handle } from "@floor/station";

const REQUEST_TIMEOUT_MS = 30_000;
const FULL = { line: "code-review", event: "review.full.requested" };
const RECHECK = { line: "code-review-recheck", event: "review.recheck.requested" };

export interface FloorAccess {
  floorUrl: string;
  token: string;
}

export const ROUTER_STATION = {
  id: "review-router",
  kind: "service",
  outcomes: ["success", "failed"],
  needs: [
    { name: "repository", kind: "value" },
    { name: "head_ref", kind: "value" },
    { name: "pr_url", kind: "value" },
    { name: "title", kind: "value" },
  ],
  produces: [{ name: "routed_to", kind: "value" }],
};

export const ROUTER_LINE = {
  id: "review-router",
  entry: "route",
  exit: "done",
  start: {
    on: ["github.pull_request.synchronize"],
    when: { draft: false },
    args: { repository: "{repository}", head_ref: "{head_ref}", pr_url: "{pull_request_url}", title: "{title}" },
  },
  args: { repository: { kind: "value" }, head_ref: { kind: "value" }, pr_url: { kind: "value" }, title: { kind: "value" } },
  nodes: [{ id: "route", station: "review-router" }, { id: "done" }],
  edges: [{ from: "route", to: "done", on: "success" }],
};

export function reviewRouter(floor: FloorAccess): Handle {
  return async (brief) => {
    const needs = brief.needs;
    const reviewed = await hasReviewed(floor, needs);
    const chosen = reviewed ? RECHECK : FULL;
    // GitHub's names, as the lines' start mappings read them.
    const payload = { repository: needs.repository, repo: needs.repository, head_ref: needs.head_ref, pull_request_url: needs.pr_url, title: needs.title, draft: false };

    await asked(floor, "/events", { method: "POST", body: JSON.stringify({ name: chosen.event, payload, dedupeKey: `${chosen.event}:${brief.visitId}` }) });

    return { outcome: "success", produced: { routed_to: chosen.line } };
  };
}

// Reviewed means a full review of this pull request ran to its end and went well. One that failed reviewed nothing.
async function hasReviewed(floor: FloorAccess, needs: Record<string, string>): Promise<boolean> {
  const query = new URLSearchParams({ line: FULL.line, repo: needs.repository, subject: `pr_url:${needs.pr_url}`, open: "false" });
  const response = await asked(floor, `/assembly-runs?${query.toString()}`, {});
  const settled = (await response.json()) as { items: { outcome: string | null }[] };

  return settled.items.some((run) => run.outcome === "success");
}

/** Puts the router's own station and line to the floor. A version is its content, so doing it at every start changes nothing after the first. */
export async function putRouter(floor: FloorAccess): Promise<void> {
  await asked(floor, "/stations", { method: "POST", body: JSON.stringify(ROUTER_STATION) });
  await asked(floor, "/assembly-lines", { method: "POST", body: JSON.stringify(ROUTER_LINE) });
}

async function asked(floor: FloorAccess, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${floor.floorUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${floor.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`the floor answered ${response.status} to ${path}: ${await response.text()}`);

  return response;
}
