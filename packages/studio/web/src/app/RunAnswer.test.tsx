// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import RunAnswer from "./RunAnswer";

const ANSWER = [
  "Here is the story.",
  JSON.stringify({ status: "complete", summary: "Collections name their host keys.", story: [{ text: "hostKeysIn reads the list.", tests: [{ path: "lint-directory.test.ts", line: 231 }] }] }),
  'LORE_NODE_RESULT: {"outcome":"success"}',
].join("\n\n");

describe("RunAnswer", () => {
  it("lays out status complete, the summary and the story paragraph with its test lint-directory.test.ts line 231", () => {
    render(<RunAnswer text={ANSWER} />);
    const answer = within(screen.getByRole("region", { name: "Answer" }));

    expect({
      words: answer.getByText("Here is the story.").tagName,
      fields: answer.getAllByRole("term").map((term) => term.textContent),
      status: answer.getByText("complete").tagName,
      paragraph: answer.getByText("hostKeysIn reads the list.").tagName,
      test: answer.getByText("path lint-directory.test.ts · line 231").tagName,
      marker: answer.queryByText(/LORE_NODE_RESULT/),
    }).toEqual({ words: "P", fields: ["status", "summary", "story", "text", "tests"], status: "DD", paragraph: "DD", test: "LI", marker: null });
  });
});
