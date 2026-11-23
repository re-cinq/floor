import { describe, expect, it } from "vitest";
import { editText, receivePrompt, resolveDisk, startDraft } from "./prompt-draft";

const ORIGINAL = { prompt: "Work.", version: "v1" };
const CHANGED = { prompt: "Changed elsewhere.", version: "v2" };

describe("receivePrompt", () => {
  it("returns the same draft when the prompt 'Work.' arrives again", () => {
    const draft = startDraft(ORIGINAL);

    expect(receivePrompt(draft, ORIGINAL)).toBe(draft);
  });

  it("takes 'Changed elsewhere.' at version v2 when there are no edits", () => {
    expect(receivePrompt(startDraft(ORIGINAL), CHANGED)).toEqual({ seed: CHANGED, text: "Changed elsewhere.", onDisk: undefined });
  });

  it("keeps the edits and version v1, holding 'Changed elsewhere.' on disk, when there are edits", () => {
    const edited = editText(startDraft(ORIGINAL), "Work. edited");

    expect(receivePrompt(edited, CHANGED)).toEqual({
      seed: { prompt: "Changed elsewhere.", version: "v1" },
      text: "Work. edited",
      onDisk: "Changed elsewhere.",
    });
  });

  it("holds the empty prompt on disk, keeping the edits, when the file is emptied", () => {
    const edited = editText(startDraft(ORIGINAL), "Work. edited");

    expect(receivePrompt(edited, { prompt: "", version: "v2" })).toStrictEqual({
      seed: { prompt: "", version: "v1" },
      text: "Work. edited",
      onDisk: "",
    });
  });
});

describe("resolveDisk", () => {
  it("starts from version v2 with the chosen 'Work. edited' and nothing on disk", () => {
    expect(resolveDisk("Work. edited", CHANGED)).toEqual({ seed: CHANGED, text: "Work. edited", onDisk: undefined });
  });
});
