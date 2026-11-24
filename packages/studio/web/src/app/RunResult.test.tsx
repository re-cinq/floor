// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import RunResult from "./RunResult";

const ENDED = { type: "run.ended" as const, run: "r1", exitCode: 0, outcome: "failed", produced: [{ name: "story", found: false }], edge: { from: "tell-story", to: "publish-incomplete", on: "failed" } };

describe("RunResult", () => {
  it("labels outcome failed, exit code 0, story missing and the edge tell-story to publish-incomplete", () => {
    render(<RunResult ended={ENDED} raises={[]} />);
    const result = within(screen.getByRole("region", { name: "Run result" }));

    expect(result.getAllByRole("term").map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`)).toEqual([
      "Outcome: failed",
      "Exit code: 0",
      "Produces: story missing",
      "Edge taken: tell-story → publish-incomplete",
    ]);
  });
});
