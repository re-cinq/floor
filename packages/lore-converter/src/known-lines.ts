// What lore knows about a line that is not in the line's file: what starts it, what it is given, and what its floor did in code around it. Each entry is a line read by hand; a line with none converts, and says what is missing.
import type { LineArgSpec, LineStart, StationBody } from "@floor/store";

export interface HookStation {
  /** The node this one follows, taking over its edges for these outcomes. */
  after: string;
  outcomes: string[];
  nodeId: string;
  stationId: string;
  station: StationBody;
  /** Need name -> the bag item it is filled from. `{node}` is the node it follows. */
  bind: Record<string, string>;
}

export interface KnownLine {
  args: Record<string, LineArgSpec>;
  start?: LineStart;
  hooks: HookStation[];
}

export const DEFAULT_ARGS: Record<string, LineArgSpec> = {
  repo: { kind: "git" },
  description: { kind: "value" },
};

// lore's floor posted the review from a hook, `postReviewFromNode`, once the review node ended. Here it is a station like any other.
const POST_REVIEW: HookStation = {
  after: "review",
  outcomes: ["success", "changes_requested"],
  nodeId: "post-review",
  stationId: "post-review",
  station: {
    kind: "service",
    outcomes: ["success", "failed"],
    needs: [
      { name: "review_output", kind: "file" },
      { name: "pr_url", kind: "value" },
    ],
    produces: [
      { name: "review_summary", kind: "value" },
      { name: "review_url", kind: "value" },
    ],
  },
  bind: { review_output: "{node}_output" },
};

export const KNOWN_LINES: Partial<Record<string, KnownLine>> = {
  "code-review": {
    args: {
      repo: { kind: "git" },
      pr_url: { kind: "value", subject: true },
      description: { kind: "value" },
    },
    start: {
      on: ["github.pull_request.opened", "github.pull_request.synchronize"],
      when: { draft: false },
      args: { repo: "{repository}@{head_ref}", pr_url: "{pull_request_url}", description: "{title}" },
    },
    hooks: [POST_REVIEW],
  },
};
