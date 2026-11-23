// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inspector from "./Inspector";
import { nodeView } from "./inspector.fixtures";

describe("Inspector Settings panel", () => {
  it("lists model: claude-sonnet-5-5 in the Settings panel when the Settings tab is pressed", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: null,
        prompt: "Review.",
        settings: { model: "claude-sonnet-5-5" },
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    const settingsList = within(screen.getByRole("tabpanel", { name: "Settings" })).getByRole("list", {
      name: "Settings",
    });

    expect(within(settingsList).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      "model: claude-sonnet-5-5",
    ]);
  });

  it('lists config: {"env":{"LOG":"debug"}} as compact JSON when the config setting is a nested object', async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: null,
        prompt: "Review.",
        settings: { config: { env: { LOG: "debug" } } },
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    const settingsList = within(screen.getByRole("tabpanel", { name: "Settings" })).getByRole("list", {
      name: "Settings",
    });

    expect(within(settingsList).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      'config: {"env":{"LOG":"debug"}}',
    ]);
  });
});
