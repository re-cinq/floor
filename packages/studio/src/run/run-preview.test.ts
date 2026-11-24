import { describe, expect, it } from "vitest";
import { runPreview } from "./run-preview.js";
import { stationNeeding } from "./station-fixtures.js";

const previewInput = (overrides: Partial<Parameters<typeof runPreview>[0]> = {}): Parameters<typeof runPreview>[0] => ({
  station: stationNeeding([{ name: "ticket", kind: "value" }]),
  prompt: "Fix {ticket}.",
  settings: { model: "claude-sonnet-5-5" },
  fixture: {},
  folder: "/tmp/run-1",
  permission: "acceptEdits",
  ...overrides,
});

describe("runPreview", () => {
  it("renders Fix ENG-1. and builds the claude command with model and max turns for a ticket value", () => {
    expect(
      runPreview(
        previewInput({
          settings: { model: "claude-sonnet-5-5", config: { max_turns: 30 } },
          fixture: { ticket: "ENG-1" },
        }),
      ),
    ).toMatchObject({
      prompt: "Fix ENG-1.",
      command: ["claude", "--print", "--verbose", "--output-format", "stream-json", "--model", "claude-sonnet-5-5", "--permission-mode", "acceptEdits", "--max-turns", "30", "--", "Fix ENG-1."],
      blockers: [],
    });
  });

  it("blocks with '\"ticket\" has no value' and keeps {ticket} unfilled when the fixture is empty", () => {
    expect(runPreview(previewInput())).toMatchObject({
      prompt: "Fix {ticket}.",
      blockers: ['"ticket" has no value'],
    });
  });

  it("blocks with an empty command when gemini-2.5-pro is a vendor the studio cannot run", () => {
    expect(runPreview(previewInput({ settings: { model: "gemini-2.5-pro" }, fixture: { ticket: "ENG-1" } }))).toMatchObject({
      command: [],
      blockers: ["the studio runs claude and codex agents; gemini-2.5-pro is a gemini model"],
    });
  });
});
