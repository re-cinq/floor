import { describe, expect, it } from "vitest";
import type { Brief } from "@floor/station";
import { GIVEN_TOKEN, LAST_LINE } from "./fake-github.js";
import { fixedToken } from "./github-auth.js";
import { postReviewStation } from "./post-review.js";
import { githubFixture, PULL_REQUEST, toolsReading } from "./test-support.js";

const github = githubFixture();

function printed(line: number): string {
  const review = { verdict: "changes_requested", summary: "One defect.", findings: [{ path: "src/foo.ts", line, label: "issue", subject: "guard the null" }] };

  return `\`\`\`REVIEW_FINDINGS\n${JSON.stringify(review)}\n\`\`\``;
}

interface Visited {
  prUrl?: string;
  visitId?: string;
}

let visits = 0;

async function posted(said: string, visited: Visited = {}) {
  const station = postReviewStation({ apiUrl: github.apiUrl, tokenFor: fixedToken(GIVEN_TOKEN) });
  const report = await station(visit(visited), toolsReading(said));

  return { report, review: github.reviews.at(-1) };
}

function visit(visited: Visited): Brief {
  visits += 1;

  return { visitId: visited.visitId ?? `visit-${visits}`, iteration: 1, needs: { pr_url: visited.prUrl ?? PULL_REQUEST, review_output: "/blobs/sha256-x" } };
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

  it("leads the review with its mark, and ends by saying floor posted it", async () => {
    const { review } = await posted(printed(42), { visitId: "marked" });

    expect(review).toMatchObject({ body: "<!-- floor-review: marked -->\n\n**changes_requested**: One defect.\n\n<sub>Posted by floor, visit marked.</sub>" });
  });

  it("posts nothing for a visit that has already posted its review", async () => {
    await posted(printed(42), { visitId: "worked-twice" });
    const before = github.reviews.length;

    await posted(printed(42), { visitId: "worked-twice" });

    expect(github.reviews.length - before).toBe(0);
  });

  it("reports the review already posted, for a visit worked twice", async () => {
    const first = await posted(printed(42), { visitId: "reported-twice" });
    const second = await posted(printed(42), { visitId: "reported-twice" });

    expect(second.report).toEqual(first.report);
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
    const { report } = await posted(printed(42), { prUrl: "https://github.com/re-cinq/floor/issues/12" });

    expect(report.error).toBe('"https://github.com/re-cinq/floor/issues/12" is not a pull request\'s address');
  });

  it("throws when GitHub refuses the token outright", async () => {
    const station = postReviewStation({ apiUrl: github.apiUrl, tokenFor: fixedToken("bad-token") });

    await expect(station(visit({ visitId: "bad-token" }), toolsReading(printed(42)))).rejects.toThrow(/GitHub answered 401/);
  });

  it("throws when GitHub refuses the review placed and unplaced alike", async () => {
    github.fixtures.refuseReviews = true;

    await expect(posted(printed(42), { visitId: "refused-twice" })).rejects.toThrow(/GitHub refused the review/);

    github.fixtures.refuseReviews = false;
  });

  it("does not choke on an existing review with no body, and posts its own", async () => {
    github.reviews.push({ body: null, html_url: "https://github.com/re-cinq/floor/pull/12#pullrequestreview-blank" });
    const before = github.reviews.length;

    await posted(printed(42), { visitId: "past-a-blank-review" });

    expect(github.reviews.length - before).toBe(1);
  });
});
