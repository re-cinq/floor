// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inspector from "./Inspector";
import { nodeView } from "./inspector.fixtures";

const workNode = nodeView({
  id: "work",
  station: "work",
  kind: "agent",
  agent: { name: "worker", file: "agents/worker.md", version: null, prompt: null, settings: {} },
});

describe("Inspector tabs keyboard", () => {
  it.each([
    { start: "Station", key: "ArrowRight", expected: "Events" },
    { start: "Other", key: "ArrowRight", expected: "Station" },
    { start: "Station", key: "ArrowLeft", expected: "Other" },
    { start: "Events", key: "End", expected: "Other" },
    { start: "Prompt", key: "Home", expected: "Station" },
  ])("selects and focuses $expected when $key is pressed on $start", async ({ start, key, expected }) => {
    render(<Inspector node={workNode} />);

    await userEvent.click(screen.getByRole("tab", { name: start }));
    await userEvent.keyboard(`{${key}}`);

    const selectedTab = screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");

    expect({ selected: selectedTab?.textContent, focused: document.activeElement?.textContent }).toEqual({
      selected: expected,
      focused: expected,
    });
  });
});
