import { describe, expect, it } from "vitest";
import { parseReviewReply } from "./review-reply.js";

function block(body: string): string {
  return `Sure thing.\n\n\`\`\`REVIEW_REPLY\n${body}\n\`\`\`\n\nREVIEW_RESULT:APPROVED`;
}

describe("parseReviewReply", () => {
  it("returns the trimmed body of a reply block", () => {
    expect(parseReviewReply(block("Fixed in a1b2c3d — the guard is now first."))).toBe("Fixed in a1b2c3d — the guard is now first.");
  });

  it("preserves multi-line markdown inside the block", () => {
    const body = "Two things:\n- done the guard\n- left the naming as-is";

    expect(parseReviewReply(block(body))).toBe(body);
  });

  it("keeps the code an agent quotes inside its reply, and what it says after it", () => {
    const body = "The call site now reads:\n\n```ts\nnew Error(describeRejection(error), {cause: error})\n```\n\nBehaviour is identical.";

    expect(parseReviewReply(block(body))).toBe(body);
  });

  it("keeps two quotes in one reply", () => {
    const body = "Before:\n```ts\nold()\n```\nAfter:\n```ts\nfresh()\n```";

    expect(parseReviewReply(block(body))).toBe(body);
  });

  it("reads the last block of an agent that showed the format before using it", () => {
    expect(parseReviewReply(`${block("an example")}\n\n${block("Fixed in a1b2c3d.")}`)).toBe("Fixed in a1b2c3d.");
  });

  it("returns null for a block the agent never closed", () => {
    expect(parseReviewReply("```REVIEW_REPLY\nFixed in a1b2c3d.")).toBeNull();
  });

  it("returns null when no reply block is present", () => {
    expect(parseReviewReply("REVIEW_RESULT:APPROVED")).toBeNull();
  });

  it("returns null for an empty reply block", () => {
    expect(parseReviewReply("```REVIEW_REPLY\n   \n```")).toBeNull();
  });
});
