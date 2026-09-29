import { describe, expect, it } from "vitest";
import { readReview, reviewInBody, reviewRequest, type Review } from "./review.js";

const REVIEW: Review = {
  verdict: "changes_requested",
  summary: "One null dereference.",
  findings: [
    { path: "src/foo.ts", line: 42, label: "issue", decoration: "blocking", subject: "user can be null here", suggestion: 'const name = user?.name ?? "anon";' },
    { label: "question", subject: "is the rename intended?" },
  ],
};

function printed(review: unknown): string {
  return `I looked at the diff.\n\n\`\`\`REVIEW_FINDINGS\n${JSON.stringify(review)}\n\`\`\`\n\nREVIEW_RESULT:CHANGES_REQUESTED:one defect`;
}

describe("readReview, of a finding that speaks of code", () => {
  it("reads a subject that names a fence, which is not the block's end", () => {
    const findings = { verdict: "approved", summary: "Fine.", findings: [{ label: "nit", subject: "open the sample with ```ts so it is coloured" }] };
    const read = readReview(`\`\`\`REVIEW_FINDINGS\n${JSON.stringify(findings)}\n\`\`\``);

    expect(read).toMatchObject({ findings: [{ subject: "open the sample with ```ts so it is coloured" }] });
  });
});

describe("readReview", () => {
  it("reads the block the agent printed", () => {
    expect(readReview(printed(REVIEW))).toEqual(REVIEW);
  });

  it("reads the last block, when the agent showed the format before using it", () => {
    const shown = printed({ verdict: "approved", summary: "an example", findings: [] });

    expect(readReview(`${shown}\n${printed(REVIEW)}`)).toMatchObject({ verdict: "changes_requested" });
  });

  it("takes a review with no findings", () => {
    expect(readReview(printed({ verdict: "approved", summary: "Clean." }))).toEqual({ verdict: "approved", summary: "Clean.", findings: [] });
  });

  it("says there is no block, for output with none", () => {
    expect(readReview("REVIEW_RESULT:APPROVED")).toEqual({ unreadable: "the review has no REVIEW_FINDINGS block" });
  });

  it("says what is wrong, for a block it cannot read", () => {
    expect(readReview(printed({ summary: "no verdict" }))).toEqual({ unreadable: expect.stringContaining("verdict") });
  });

  it("says the block cannot be read, for text inside it that is not JSON at all", () => {
    expect(readReview("```REVIEW_FINDINGS\nnot json at all\n```")).toEqual({ unreadable: expect.stringContaining("REVIEW_FINDINGS block cannot be read") });
  });
});

describe("reviewRequest", () => {
  it("is a comment whatever the verdict, never an approval or a request for changes", () => {
    expect(reviewRequest(REVIEW).event).toBe("COMMENT");
  });

  it("puts a finding with a place on its line, as a conventional comment with its suggestion", () => {
    expect(reviewRequest(REVIEW).comments).toEqual([
      { path: "src/foo.ts", line: 42, side: "RIGHT", body: '**issue (blocking):** user can be null here\n\n```suggestion\nconst name = user?.name ?? "anon";\n```' },
    ]);
  });

  it("says a finding with no place in the body, under the verdict", () => {
    expect(reviewRequest(REVIEW).body).toBe("**changes_requested**: One null dereference.\n\n- **question:** is the rename intended?");
  });
});

describe("reviewInBody", () => {
  it("places nothing on a line", () => {
    expect(reviewInBody(REVIEW).comments).toEqual([]);
  });

  it("says every finding in the body, each with where it is", () => {
    expect(reviewInBody(REVIEW).body).toContain("- `src/foo.ts:42` **issue (blocking):** user can be null here");
  });

  it("says a finding with a path but no line as the path alone, with no colon", () => {
    const noLine: Review = { verdict: "changes_requested", summary: "A file-level note.", findings: [{ path: "src/bar.ts", label: "note", subject: "the whole file is stale" }] };

    expect(reviewInBody(noLine).body).toContain("- `src/bar.ts` **note:** the whole file is stale");
  });
});
