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

  it("labels the image field with a visible 'image' label", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: "v1",
        prompt: "Review.",
        settings: { image: "acme/agent:2", timeout_minutes: 10 },
      },
    });

    render(<Inspector node={reviewerNode} actions={{ saveSettings: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    const field = screen.getByRole("textbox", { name: "image" });

    expect(Array.from((field as HTMLInputElement).labels ?? [], (label) => label.textContent)).toEqual(["image"]);
  });

  it("offers the model claude-sonnet-5-5 in a dropdown grouped Claude, Codex, Gemini, Exec", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: "v1",
        prompt: "Review.",
        settings: { model: "claude-sonnet-5-5", image: "acme/agent:2" },
      },
    });

    render(<Inspector node={reviewerNode} actions={{ saveSettings: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    const select = screen.getByRole("combobox", { name: "model" });

    expect(within(select).getAllByRole("group").map((group) => group.getAttribute("label"))).toEqual([
      "Claude",
      "Codex",
      "Gemini",
      "Exec",
    ]);
  });

  it("opens Custom… with the model opencode/anthropic/claude-sonnet-5-5 in a text field", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: "v1",
        prompt: "Review.",
        settings: { model: "opencode/anthropic/claude-sonnet-5-5", image: "acme/agent:2" },
      },
    });

    render(<Inspector node={reviewerNode} actions={{ saveSettings: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    const select = screen.getByRole("combobox", { name: "model" });
    const customField = screen.queryByRole("textbox", { name: "Custom model" });

    expect({
      chosen: Array.from((select as HTMLSelectElement).selectedOptions, (option) => option.textContent),
      custom: (customField as HTMLInputElement | null)?.value,
    }).toEqual({ chosen: ["Custom…"], custom: "opencode/anthropic/claude-sonnet-5-5" });
  });
});
