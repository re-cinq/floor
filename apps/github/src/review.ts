// Pure: the review an agent printed, read, and written as GitHub takes it. The format is lore's: a fenced REVIEW_FINDINGS block of JSON. What is posted is suggestion-only, as lore's is: always a comment, never an approval or a request for changes, whatever the verdict.
import { z } from "zod";

// Ended by a fence on a line of its own. Inside JSON a line break is written `\n`, so no line of the block begins with one; a fence met mid-line is a finding speaking of code.
const FINDINGS_BLOCK = /```REVIEW_FINDINGS\s*\n([\s\S]*?)\n```/g;

const finding = z.object({
  path: z.string().optional(),
  line: z.number().int().positive().optional(),
  label: z.string().default("note"),
  decoration: z.string().optional(),
  subject: z.string(),
  suggestion: z.string().optional(),
});

const review = z.object({
  verdict: z.string(),
  summary: z.string().default(""),
  findings: z.array(finding).default([]),
});

export type Finding = z.infer<typeof finding>;
export type Review = z.infer<typeof review>;

export interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

export interface ReviewRequest {
  event: "COMMENT";
  body: string;
  comments: ReviewComment[];
}

/** The last block the agent printed, or why there is none to read. An agent that explains the format before using it prints it twice. */
export function readReview(said: string): Review | { unreadable: string } {
  const last = [...said.matchAll(FINDINGS_BLOCK)].at(-1);

  if (!last) return { unreadable: "the review has no REVIEW_FINDINGS block" };
  const parsed = review.safeParse(jsonOf(last[1]));

  return parsed.success ? parsed.data : { unreadable: `the REVIEW_FINDINGS block cannot be read: ${problemsOf(parsed.error)}` };
}

function problemsOf(error: z.ZodError): string {
  const issues = error.issues;

  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A finding with a place is a comment on that line; one without is said in the review's body. */
export function reviewRequest(read: Review): ReviewRequest {
  const placed = read.findings.filter(isPlaced);
  const unplaced = read.findings.filter((each) => !isPlaced(each));

  return {
    event: "COMMENT",
    body: bodyOf(read, unplaced),
    comments: placed.map((each) => ({ path: each.path, line: each.line, side: "RIGHT", body: commentOf(each) })),
  };
}

/** Everything in the body and nothing on a line: for a review GitHub refused because a finding names a line the pull request does not touch. */
export function reviewInBody(read: Review): ReviewRequest {
  return { event: "COMMENT", body: bodyOf(read, read.findings), comments: [] };
}

function isPlaced(each: Finding): each is Finding & { path: string; line: number } {
  return each.path !== undefined && each.line !== undefined;
}

function bodyOf(read: Review, findings: Finding[]): string {
  const said = findings.map((each) => `- ${placeOf(each)}${commentOf(each)}`);

  return [`**${read.verdict}**: ${read.summary}`, ...said].join("\n\n");
}

function placeOf(each: Finding): string {
  return each.path ? `\`${each.path}${each.line ? `:${each.line}` : ""}\` ` : "";
}

// Conventional Comments: `label (decoration): subject`.
function commentOf(each: Finding): string {
  const decoration = each.decoration ? ` (${each.decoration})` : "";
  const suggestion = each.suggestion ? `\n\n\`\`\`suggestion\n${each.suggestion}\n\`\`\`` : "";

  return `**${each.label}${decoration}:** ${each.subject}${suggestion}`;
}
