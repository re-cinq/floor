import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Brief, Tools } from "@floor/station";
import { GIVEN_TOKEN, LAST_LINE, startFakeGitHub, type FakeGitHub } from "./fake-github.js";
import { fixedToken } from "./github-auth.js";
import { postReviewStation } from "./post-review.js";

const EXPIRES = new Date("2026-01-01T01:00:00Z");
const PULL_REQUEST = "https://github.com/re-cinq/floor/pull/12";

let github: FakeGitHub;

beforeAll(async () => {
  github = await startFakeGitHub("", EXPIRES);
});

afterAll(async () => {
  await github.close();
});

function printed(line: number): string {
  const review = { verdict: "changes_requested", summary: "One defect.", findings: [{ path: "src/foo.ts", line, label: "issue", subject: "guard the null" }] };

  return `\`\`\`REVIEW_FINDINGS\n${JSON.stringify(review)}\n\`\`\``;
}

async function posted(said: string, prUrl = PULL_REQUEST) {
  const station = postReviewStation({ apiUrl: github.apiUrl, tokenFor: fixedToken(GIVEN_TOKEN) });
  const report = await station(visit(prUrl), toolsReading(said));

  return { report, review: github.reviews.at(-1) };
}

function toolsReading(said: string): Tools {
  return { read: () => Promise.resolve(Buffer.from(said)), produce: () => Promise.resolve(), modelCall: () => Promise.resolve(), signal: AbortSignal.timeout(1000) };
}

function visit(prUrl: string): Brief {
  return { visitId: "v1", iteration: 1, needs: { pr_url: prUrl, review_output: "/blobs/sha256-x" } };
}

describe("the post-review station", () => {
  it("posts the review to the pull request the visit names", async () => {
    await posted(printed(42));

    expect(github.asked.at(-1)).toBe("POST /repos/re-cinq/floor/pulls/12/reviews");
  });

  it("posts each placed finding as a comment on its line", async () => {
    const { review } = await posted(printed(42));

    expect(review).toMatchObject({ event: "COMMENT", comments: [{ path: "src/foo.ts", line: 42, body: "**issue:** guard the null" }] });
  });

  it("reports what it posted, and where it can be read", async () => {
    const { report } = await posted(printed(42));

    expect(report).toEqual({
      outcome: "success",
      produced: { review_summary: "changes_requested: One defect. (1 findings)", review_url: expect.stringContaining("/pull/12#pullrequestreview-") },
    });
  });

  it("posts the findings in the body when GitHub refuses where one is placed", async () => {
    const { review } = await posted(printed(LAST_LINE + 1));

    expect(review).toMatchObject({ comments: [], body: expect.stringContaining("`src/foo.ts:101` **issue:** guard the null") });
  });

  it("fails the visit on a review it cannot read, and posts nothing", async () => {
    const { report } = await posted("REVIEW_RESULT:APPROVED");

    expect(report).toEqual({ outcome: "failed", error: "the review has no REVIEW_FINDINGS block" });
  });

  it("fails the visit on an address that is no pull request's", async () => {
    const { report } = await posted(printed(42), "https://github.com/re-cinq/floor/issues/12");

    expect(report.error).toBe('"https://github.com/re-cinq/floor/issues/12" is not a pull request\'s address');
  });
});
