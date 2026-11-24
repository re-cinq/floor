import { describe, expect, it } from "vitest";
import { answerParts, finalAnswer } from "./answer-parts";

describe("answerParts", () => {
  it("splits words, a one-line JSON object and more words, dropping the LORE_NODE_RESULT line", () => {
    const text = 'Here it is.\n\n{"status":"complete","story":[{"text":"Adds host keys."}]}\n\nDone.\n\nLORE_NODE_RESULT: {"outcome":"success"}';

    expect(answerParts(text)).toEqual([
      { kind: "text", text: "Here it is." },
      { kind: "json", value: { status: "complete", story: [{ text: "Adds host keys." }] } },
      { kind: "text", text: "Done." },
    ]);
  });

  it("reads a fenced json block as JSON", () => {
    expect(answerParts('```json\n{"status": "incomplete",\n "story": []}\n```')).toEqual([{ kind: "json", value: { status: "incomplete", story: [] } }]);
  });

  it("keeps a line that looks like JSON but does not parse as text", () => {
    expect(answerParts("{not json}")).toEqual([{ kind: "text", text: "{not json}" }]);
  });
});

describe("finalAnswer", () => {
  it("answers the result text of the last result event, done, among the run's lines", () => {
    const lines = [
      { stream: "stdout" as const, text: JSON.stringify({ type: "result", result: "first" }) },
      { stream: "stdout" as const, text: JSON.stringify({ type: "result", result: "done" }) },
    ];

    expect(finalAnswer(lines)).toEqual("done");
  });

  it("answers nothing for a run with no result event", () => {
    expect(finalAnswer([{ stream: "stdout", text: "plain" }])).toBeUndefined();
  });
});
