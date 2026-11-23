import { describe, expect, it } from "vitest";
import type { PlaceholderRow } from "@re-cinq/floor-assembly-lines";
import { promptPieces } from "./prompt-pieces";

const topic: PlaceholderRow = { name: "topic", source: "value-need", state: "filled", filledBy: ["a"], path: [] };

describe("promptPieces", () => {
  it("returns text, the {topic} placeholder with its row, and text when topic has a row", () => {
    expect(promptPieces("Write {topic} now", [topic])).toEqual([{ text: "Write " }, { placeholder: "topic", row: topic }, { text: " now" }]);
  });

  it("keeps {other} as text when other has no row", () => {
    expect(promptPieces("a {other} b", [topic])).toEqual([{ text: "a " }, { text: "{other}" }, { text: " b" }]);
  });
});
