import { describe, it, expect } from "vitest";
import { unwrapParagraphs } from "./unwrap-paragraphs";

describe("unwrapParagraphs", () => {
  it.each<{ title: string; text: string; unwrapped: string }>([
    {
      title: "joins 'a review\\nthat asked' into one line and keeps the blank line before 'Take the comments'",
      text: "The text above is a review\nthat asked for changes.\n\nTake the comments one at a time.",
      unwrapped: "The text above is a review that asked for changes.\n\nTake the comments one at a time.",
    },
    {
      title: "keeps '- A comment' items on their own lines and joins the indented 'under /workspace/target.' to its item",
      text: "Take the comments one at a time:\n- A comment that asks for a change: make it\n  under /workspace/target.\n- A comment that asks a question: answer it.",
      unwrapped:
        "Take the comments one at a time:\n- A comment that asks for a change: make it under /workspace/target.\n- A comment that asks a question: answer it.",
    },
    {
      title: "keeps every line of the 'REVIEW_REPLY' fenced block between 'Then emit two fenced blocks.' and 'Lore posts the first.'",
      text: "Then emit two fenced blocks.\n```\nREVIEW_REPLY\n<short markdown>\n```\nLore posts the first.",
      unwrapped: "Then emit two fenced blocks.\n```\nREVIEW_REPLY\n<short markdown>\n```\nLore posts the first.",
    },
  ])("$title",({ text, unwrapped }) => {
    expect(unwrapParagraphs(text)).toEqual(unwrapped);
  });
});
