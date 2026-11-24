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

  it("carries env CLAUDE_CODE_DISABLE_CLAUDE_MDS 1 from the agent's config.env to the run", () => {
    expect(runPreview(previewInput({ settings: { model: "claude-sonnet-5-5", config: { env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" } } }, fixture: { ticket: "ENG-1" } })).env).toEqual({ CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
  });

  it.each([
    { prompt: "Read /workspace/tests.json.", rendered: "Read /tmp/run-1/tests.json." },
    { prompt: "Work in /workspace.", rendered: "Work in /tmp/run-1." },
    { prompt: "Leave /workspaces/other and /workspace-x alone.", rendered: "Leave /workspaces/other and /workspace-x alone." },
  ])("renders $prompt as $rendered for the folder /tmp/run-1", ({ prompt, rendered }) => {
    expect(runPreview(previewInput({ prompt, station: stationNeeding([]) })).prompt).toEqual(rendered);
  });

  it("blocks with '\"ticket\" has no value' and keeps {ticket} unfilled when the fixture is empty", () => {
    expect(runPreview(previewInput())).toMatchObject({
      prompt: "Fix {ticket}.",
      blockers: ['"ticket" has no value'],
    });
  });

  it("blocks with 'the folder must be an absolute path: example' when the folder is example", () => {
    expect(runPreview(previewInput({ folder: "example", fixture: { ticket: "ENG-1" } }))).toMatchObject({
      blockers: ["the folder must be an absolute path: example"],
    });
  });

  it("blocks with an empty command when gemini-2.5-pro is a vendor the studio cannot run", () => {
    expect(runPreview(previewInput({ settings: { model: "gemini-2.5-pro" }, fixture: { ticket: "ENG-1" } }))).toMatchObject({
      command: [],
      blockers: ["the studio runs claude and codex agents; gemini-2.5-pro is a gemini model"],
    });
  });
});
