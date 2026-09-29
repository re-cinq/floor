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
  sender: z.looseObject({ login: z.string(), type: z.string().optional() }).optional(),
});

// A `pull_request` event carries the number beside the pull request; a review carries it only inside.
const pullRequest = z.looseObject({
  pull_request: z.looseObject({
    number: z.number(),
    html_url: z.string(),
    title: z.string(),
    draft: z.boolean().optional(),
    merged: z.boolean().optional(),
    head: z.looseObject({ ref: z.string(), sha: z.string() }),
    base: z.looseObject({ ref: z.string() }),
  }),
});

const review = z.looseObject({
  review: z.looseObject({ id: z.number(), state: z.string(), html_url: z.string() }),
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
  /** `User` or `Bot`, as GitHub says: what keeps a line from being started by what the floor itself posted. Spelled as the event's other fields are. */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  sender_type?: string;
  action?: string;
}

function aboutOf(body: z.infer<typeof common>): About | null {
  const repository = body.repository;
  const sender = body.sender;

  if (!repository) return null;
  const named = `github.com/${repository.full_name}`;

  return { repository: named, repo: named, sender: sender?.login ?? "", sender_type: sender?.type, action: body.action };
}

function withoutUnset(about: About): Payload {
  const given = Object.entries(about).filter((entry): entry is [string, string] => entry[1] !== undefined);

  return Object.fromEntries(given);
}

const DETAILS: Partial<Record<string, (body: unknown) => Payload>> = {
  pull_request: pullRequestOf,
  pull_request_review: reviewOf,
  issue_comment: commentOf,
};

function detailOf(delivery: Delivery): Payload {
  const detail = DETAILS[delivery.event];

  return detail ? detail(delivery.body) : {};
}

// `subjectKey` is what a line marks as its subject, so an event about a pull request finds the run already open on it.
function pullRequestOf(body: unknown): Payload {
  const parsed = pullRequest.safeParse(body);

  if (!parsed.success) return {};
  const pull = parsed.data.pull_request;

  return {
    ...subjectOf(pull.html_url),
    number: pull.number,
    title: pull.title,
    draft: pull.draft ?? false,
    merged: pull.merged ?? false,
    head_ref: pull.head.ref,
    head_sha: pull.head.sha,
    base_ref: pull.base.ref,
  };
}

// A review carries its pull request whole, so it is told as one, with the review beside it.
function reviewOf(body: unknown): Payload {
  const parsed = review.safeParse(body);

  if (!parsed.success) return {};
  const { id, state, html_url: url } = parsed.data.review;

  return { ...pullRequestOf(body), review_id: id, review_state: state, review_url: url };
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
