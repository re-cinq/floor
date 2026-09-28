// Pure: a GitHub webhook as the floor event it becomes. The floor's templates read top-level text, numbers and booleans, so what a line may want is lifted out of GitHub's nesting and named plainly.
import { z } from "zod";

export interface FloorEvent {
  name: string;
  payload: Record<string, string | number | boolean>;
  /** GitHub's delivery id: a webhook delivered again is the same event. */
  dedupeKey: string;
}

export interface Delivery {
  /** `X-GitHub-Event`. */
  event: string;
  /** `X-GitHub-Delivery`. */
  id: string;
  body: unknown;
}

// GitHub's own field names.
const common = z.looseObject({
  action: z.string().optional(),
  repository: z.looseObject({ full_name: z.string() }).optional(),
  sender: z.looseObject({ login: z.string() }).optional(),
});

const pullRequest = z.looseObject({
  number: z.number(),
  pull_request: z.looseObject({
    html_url: z.string(),
    title: z.string(),
    draft: z.boolean().optional(),
    merged: z.boolean().optional(),
    head: z.looseObject({ ref: z.string(), sha: z.string() }),
    base: z.looseObject({ ref: z.string() }),
  }),
});

const issueComment = z.looseObject({
  issue: z.looseObject({ number: z.number(), pull_request: z.looseObject({ html_url: z.string() }).optional() }),
  comment: z.looseObject({ id: z.number(), body: z.string(), html_url: z.string() }),
});

type Payload = FloorEvent["payload"];

/** Null for a delivery that names no repository: a ping, or an event about an organisation. */
export function floorEventOf(delivery: Delivery): FloorEvent | null {
  const parsed = common.safeParse(delivery.body);
  const about = parsed.success ? aboutOf(parsed.data) : null;

  if (!about) return null;
  const name = about.action ? `github.${delivery.event}.${about.action}` : `github.${delivery.event}`;

  return { name, payload: { ...withoutUnset(about), ...detailOf(delivery) }, dedupeKey: `github:${delivery.id}` };
}

interface About {
  repository: string;
  repo: string;
  sender: string;
  action?: string;
}

function aboutOf(body: z.infer<typeof common>): About | null {
  const repository = body.repository;
  const sender = body.sender;

  if (!repository) return null;
  const named = `github.com/${repository.full_name}`;

  return { repository: named, repo: named, sender: sender?.login ?? "", action: body.action };
}

function withoutUnset(about: About): Payload {
  const given = Object.entries(about).filter((entry): entry is [string, string] => entry[1] !== undefined);

  return Object.fromEntries(given);
}

function detailOf(delivery: Delivery): Payload {
  if (delivery.event === "pull_request") return pullRequestOf(delivery.body);

  return delivery.event === "issue_comment" ? commentOf(delivery.body) : {};
}

// `subjectKey` is what a line marks as its subject, so an event about a pull request finds the run already open on it.
function pullRequestOf(body: unknown): Payload {
  const parsed = pullRequest.safeParse(body);

  if (!parsed.success) return {};
  const pull = parsed.data.pull_request;

  return {
    ...subjectOf(pull.html_url),
    number: parsed.data.number,
    title: pull.title,
    draft: pull.draft ?? false,
    merged: pull.merged ?? false,
    head_ref: pull.head.ref,
    head_sha: pull.head.sha,
    base_ref: pull.base.ref,
  };
}

// A comment on an issue that is not a pull request is about no run of ours.
function commentOf(body: unknown): Payload {
  const parsed = issueComment.safeParse(body);

  if (!parsed.success) return {};
  const { issue, comment } = parsed.data;
  const pull = issue.pull_request;

  if (!pull) return {};

  return { ...subjectOf(pull.html_url), number: issue.number, comment_id: comment.id, comment_body: comment.body, comment_url: comment.html_url };
}

function subjectOf(pullRequestUrl: string): Payload {
  return { pull_request_url: pullRequestUrl, subjectKey: `pr_url:${pullRequestUrl}` };
}
