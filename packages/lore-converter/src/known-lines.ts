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

/** A station lore's floor ran in code before the line's entry. The line enters here, and goes on to its own entry when this succeeds. */
export type EntryStation = Pick<HookStation, "nodeId" | "stationId" | "station" | "bind">;

export interface KnownLine {
  args: Record<string, LineArgSpec>;
  start?: LineStart;
  first?: EntryStation;
  hooks: HookStation[];
  /** Node -> what its agent is told, after lore's prompt, about delivering what it committed. Its station writes to the repository. */
  delivers?: Record<string, string>;
  /** Node -> need name -> the bag item it is filled from, beside the repository. */
  binds?: Record<string, Record<string, string>>;
}

export const DEFAULT_ARGS: Record<string, LineArgSpec> = {
  repo: { kind: "git" },
  description: { kind: "value" },
};

// lore's floor posted the review from a hook, `postReviewFromNode`, once the review node ended. Here it is a station like any other.
function postReviewAfter(node: string): HookStation {
  return { ...POST_REVIEW, after: node };
}

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

const REVIEW_ARGS: KnownLine["args"] = {
  repo: { kind: "git" },
  pr_url: { kind: "value", subject: true },
  description: { kind: "value" },
};

const FROM_A_PULL_REQUEST = { repo: "{repository}@{head_ref}", pr_url: "{pull_request_url}", description: "{title}" };

// lore's floor read the review, its body and its inline comments, from GitHub before it started the line, and wrote the agent's task from them.
const READ_REVIEW: EntryStation = {
  nodeId: "read-review",
  stationId: "read-review",
  station: {
    kind: "service",
    outcomes: ["success", "failed"],
    needs: [
      { name: "pr_url", kind: "value" },
      { name: "review_id", kind: "value" },
      { name: "intent", kind: "value" },
    ],
    produces: [{ name: "review_feedback", kind: "value" }],
  },
  bind: {},
};

// lore's floor posted the reply from a hook, `postReplyFromNode`.
const POST_REPLY: HookStation = {
  after: "reply",
  outcomes: ["success", "changes_requested"],
  nodeId: "post-reply",
  stationId: "post-reply",
  station: {
    kind: "service",
    outcomes: ["success", "failed"],
    needs: [
      { name: "reply_output", kind: "file" },
      { name: "pr_url", kind: "value" },
    ],
    produces: [{ name: "reply_url", kind: "value" }],
  },
  bind: { reply_output: "{node}_output" },
};

// lore's prompt has the agent commit and never push, and nothing in lore pushes for it: the fix stays in the pod. Here git in the pod is authenticated for the one repository, so the agent is told to push.
const PUSH_THE_FIX = `One thing above is different here. Nobody pushes your commit for you. When the intent is address, push it once it is committed:
\`git -C /workspace/target push origin HEAD\`
That one command may use the network, and git is already authenticated for this repository. Push nothing else, and never force. If the push is refused, say so in your reply and output REVIEW_RESULT:CHANGES_REQUESTED:the fix could not be pushed.`;

// A push to a pull request starts neither of these by itself. lore chose in code: the full review if none had run, the fast recheck if one had. Here a router line chooses, a `review-router` station, and asks for one by name.
export const KNOWN_LINES: Partial<Record<string, KnownLine>> = {
  "code-review": {
    args: REVIEW_ARGS,
    start: { on: ["github.pull_request.opened", "review.full.requested"], when: { draft: false }, args: FROM_A_PULL_REQUEST },
    hooks: [POST_REVIEW],
  },
  "code-review-recheck": {
    args: REVIEW_ARGS,
    start: { on: ["review.recheck.requested"], args: FROM_A_PULL_REQUEST },
    hooks: [postReviewAfter("recheck")],
  },
  // Started by a review asking for changes, from a person who may write to the repository. Never a bot's: the post-review station's own review would start it again. Never a stranger's: what the review says becomes the task of an agent that may push. lore's other way in, a comment read by a triage line, is switched off in lore.
  "code-review-reply": {
    args: {
      repo: { kind: "git" },
      pr_url: { kind: "value", subject: true },
      review_id: { kind: "value" },
      intent: { kind: "value" },
    },
    start: {
      on: ["github.pull_request_review.submitted"],
      when: { review_state: "changes_requested", sender_type: "User", sender_trusted: true, draft: false },
      args: { repo: "{repository}@{head_ref}", pr_url: "{pull_request_url}", review_id: "{review_id}", intent: "address" },
    },
    first: READ_REVIEW,
    hooks: [POST_REPLY],
    delivers: { reply: PUSH_THE_FIX },
    binds: { reply: { description: "review_feedback" } },
  },
};
