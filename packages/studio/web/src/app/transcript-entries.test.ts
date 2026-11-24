import { describe, expect, it } from "vitest";
import { transcriptEntries } from "./transcript-entries";

const out = (event: unknown) => ({ stream: "stdout" as const, text: JSON.stringify(event) });

const said = (text: string) => out({ type: "assistant", message: { content: [{ type: "text", text }] } });
const used = (name: string, input: Record<string, unknown>) => out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
const toolAnswer = (fields: Record<string, unknown>) => out({ type: "user", message: { content: [{ type: "tool_result", ...fields }] } });
const refused = (content: string) => toolAnswer({ content, is_error: true });
const answered = (content: string) => toolAnswer({ content });

describe("transcriptEntries", () => {
  it("keeps what the agent said, as said", () => {
    expect(transcriptEntries([said("I read the packet.")])).toEqual([{ kind: "said", text: "I read the packet." }]);
  });

  it.each([
    { name: "Read", input: { file_path: "/tmp/run-1/tests.json" }, text: "Read /tmp/run-1/tests.json" },
    { name: "Bash", input: { command: "wc -c tests.json" }, text: "Bash wc -c tests.json" },
    { name: "Grep", input: { pattern: "hostKeys", path: "src" }, text: "Grep hostKeys" },
    { name: "TodoWrite", input: { todos: [] }, text: "TodoWrite" },
  ])("shows the $name call with $input as the tool line $text", ({ name, input, text }) => {
    expect(transcriptEntries([used(name, input)])).toEqual([{ kind: "tool", text }]);
  });

  it("shows a refused tool call's reason as an error, and leaves a tool's ordinary answer out", () => {
    expect(transcriptEntries([refused("Claude requested permissions to read from /workspace/tests.json"), answered("12| const limit = 2;")])).toEqual([
      { kind: "error", text: "Claude requested permissions to read from /workspace/tests.json" },
    ]);
  });

  it("leaves the system and hook events out", () => {
    expect(transcriptEntries([out({ type: "system", subtype: "hook_started" }), out({ type: "system", subtype: "init" })])).toEqual([]);
  });

  it("sums the run up from the result event: 3 turns, 5.7 s, $0.1027", () => {
    expect(transcriptEntries([out({ type: "result", num_turns: 3, duration_ms: 5655, total_cost_usd: 0.1027117 })])).toEqual([{ kind: "result", text: "3 turns, 5.7 s, $0.1027" }]);
  });

  it("shows stderr and a line that is not JSON as they are", () => {
    expect(transcriptEntries([{ stream: "stderr", text: "auth expired" }, { stream: "stdout", text: "plain words" }])).toEqual([
      { kind: "error", text: "auth expired" },
      { kind: "raw", text: "plain words" },
    ]);
  });

  it("shows the agent's final words, which the result event repeats, as a pointer to the Answer", () => {
    const final = 'Here.\n{"status":"complete"}';

    expect(transcriptEntries([said("Reading."), said(final), out({ type: "result", result: final, num_turns: 2, duration_ms: 1000, total_cost_usd: 0.01 })])).toEqual([
      { kind: "said", text: "Reading." },
      { kind: "tool", text: "Final answer, shown under Answer" },
      { kind: "result", text: "2 turns, 1.0 s, $0.0100" },
    ]);
  });
});

