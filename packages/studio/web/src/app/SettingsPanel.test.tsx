// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows an 'env: LORE_AGENT_IMAGE' chip instead of the field for image '${LORE_AGENT_IMAGE}'", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: "v1",
        prompt: "Review.",
        settings: { image: "${LORE_AGENT_IMAGE}", timeout_minutes: 10 },
      },
    });

    render(<Inspector node={reviewerNode} actions={{ saveSettings: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    expect({
      chip: screen.queryByText("env: LORE_AGENT_IMAGE")?.textContent,
      field: screen.queryByRole("textbox", { name: "image" }),
    }).toEqual({ chip: "env: LORE_AGENT_IMAGE", field: null });
  });

  it("saves image acme/agent:3 when it is typed into the empty field opened by Override on '${LORE_AGENT_IMAGE}'", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: "v1",
        prompt: "Review.",
        settings: { image: "${LORE_AGENT_IMAGE}", timeout_minutes: 10 },
      },
    });
    let saved: { image?: unknown } | undefined;

    render(
      <Inspector
        node={reviewerNode}
        actions={{
          saveSettings: (settings) => {
            saved = settings;

            return Promise.resolve();
          },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Override" }));
    await userEvent.type(screen.getByRole("textbox", { name: "image" }), "acme/agent:3");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved?.image).toBe("acme/agent:3"));
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

  it("saves model my-model when it is typed into the empty Custom model field chosen from claude-sonnet-5-5", async () => {
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
    let saved: { model?: unknown } | undefined;

    render(
      <Inspector
        node={reviewerNode}
        actions={{
          saveSettings: (settings) => {
            saved = settings;

            return Promise.resolve();
          },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "model" }), "Custom…");
    await userEvent.type(screen.getByRole("textbox", { name: "Custom model" }), "my-model");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved?.model).toBe("my-model"));
  });

  it("shows max_turns 100 in a number field described by its schema help text", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: {
        name: "reviewer",
        file: "agents/reviewer.md",
        version: "v1",
        prompt: "Review.",
        settings: { image: "acme/agent:2", config: { max_turns: 100 } },
      },
    });

    render(<Inspector node={reviewerNode} actions={{ saveSettings: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

    const field = screen.queryByRole("spinbutton", { name: "max_turns" });
    const helpId = field?.getAttribute("aria-describedby");

    expect({
      value: (field as HTMLInputElement | null)?.valueAsNumber,
      help: helpId ? document.getElementById(helpId)?.textContent : undefined,
    }).toEqual({ value: 100, help: "The most turns the agent takes in one visit." });
  });
});
