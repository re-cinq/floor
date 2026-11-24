// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RunTranscript from "./RunTranscript";

const LINES = [
  { stream: "stdout" as const, text: JSON.stringify({ type: "system", subtype: "init" }) },
  { stream: "stdout" as const, text: JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/tmp/run-1/tests.json" } }] } }) },
  { stream: "stdout" as const, text: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "The tests add host keys." }] } }) },
];

describe("RunTranscript", () => {
  it("lists Read /tmp/run-1/tests.json and The tests add host keys., and no system event, for a run that read and spoke", () => {
    render(<RunTranscript lines={LINES} />);

    expect(within(screen.getByRole("region", { name: "Transcript" })).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual(["Read /tmp/run-1/tests.json", "The tests add host keys."]);
  });

  it("shows the three lines as printed once Raw is pressed", async () => {
    render(<RunTranscript lines={LINES} />);
    await userEvent.click(screen.getByRole("button", { name: "Raw" }));

    expect(within(screen.getByRole("region", { name: "Transcript" })).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual(LINES.map((line) => line.text));
  });
});
