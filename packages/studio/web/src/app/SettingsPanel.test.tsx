// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inspector from "./Inspector";
import { nodeView } from "./inspector.fixtures";
import { openReviewerSettings } from "./settings-panel.fixtures";

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
    await userEvent.click(screen.getByRole("tab", { name: "Model" }));

    const settingsList = within(screen.getByRole("tabpanel", { name: "Model" })).getByRole("list", {
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
    await userEvent.click(screen.getByRole("tab", { name: "Pod" }));

    const settingsList = within(screen.getByRole("tabpanel", { name: "Pod" })).getByRole("list", {
      name: "Settings",
    });

    expect(within(settingsList).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      'config: {"env":{"LOG":"debug"}}',
    ]);
  });

  it("labels the image field with a visible 'image' label", async () => {
    await openReviewerSettings("Pod", { image: "acme/agent:2", timeout_minutes: 10 });

    const field = screen.getByRole("textbox", { name: "image" });

    expect(Array.from((field as HTMLInputElement).labels ?? [], (label) => label.textContent)).toEqual(["image"]);
  });

  it("shows an 'env: LORE_AGENT_IMAGE' chip instead of the field for image '${LORE_AGENT_IMAGE}'", async () => {
    await openReviewerSettings("Pod", { image: "${LORE_AGENT_IMAGE}", timeout_minutes: 10 });

    expect({
      chip: screen.queryByText("env: LORE_AGENT_IMAGE")?.textContent,
      field: screen.queryByRole("textbox", { name: "image" }),
    }).toEqual({ chip: "env: LORE_AGENT_IMAGE", field: null });
  });

  it("saves image acme/agent:3 when it is typed into the empty field opened by Override on '${LORE_AGENT_IMAGE}'", async () => {
    const saved = await openReviewerSettings("Pod", { image: "${LORE_AGENT_IMAGE}", timeout_minutes: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Override" }));
    await userEvent.type(screen.getByRole("textbox", { name: "image" }), "acme/agent:3");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.image).toBe("acme/agent:3"));
  });

  it("saves image '${LORE_AGENT_IMAGE}' when Override on '${LORE_AGENT_IMAGE}' is saved with nothing typed", async () => {
    const saved = await openReviewerSettings("Pod", { image: "${LORE_AGENT_IMAGE}", timeout_minutes: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Override" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.image).toBe("${LORE_AGENT_IMAGE}"));
  });

  it("restores the chip env: LORE_AGENT_IMAGE when Use env: LORE_AGENT_IMAGE is pressed after Override on '${LORE_AGENT_IMAGE}'", async () => {
    await openReviewerSettings("Pod", { image: "${LORE_AGENT_IMAGE}", timeout_minutes: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Override" }));
    await userEvent.type(screen.getByRole("textbox", { name: "image" }), "acme/agent:3");
    await userEvent.click(screen.getByRole("button", { name: "Use env: LORE_AGENT_IMAGE" }));

    expect({
      chip: screen.queryByText("env: LORE_AGENT_IMAGE")?.textContent,
      field: screen.queryByRole("textbox", { name: "image" }),
    }).toEqual({ chip: "env: LORE_AGENT_IMAGE", field: null });
  });

  it("offers the model claude-sonnet-5-5 in a dropdown grouped Claude, Codex, Gemini, Exec", async () => {
    await openReviewerSettings("Model", { model: "claude-sonnet-5-5", image: "acme/agent:2" });

    const select = screen.getByRole("combobox", { name: "model" });

    expect(within(select).getAllByRole("group").map((group) => group.getAttribute("label"))).toEqual([
      "Claude",
      "Codex",
      "Gemini",
      "Exec",
    ]);
  });

  it("opens Custom… with the model opencode/anthropic/claude-sonnet-5-5 in a text field", async () => {
    await openReviewerSettings("Model", { model: "opencode/anthropic/claude-sonnet-5-5", image: "acme/agent:2" });

    const select = screen.getByRole("combobox", { name: "model" });
    const customField = screen.queryByRole("textbox", { name: "Custom model" });

    expect({
      chosen: Array.from((select as HTMLSelectElement).selectedOptions, (option) => option.textContent),
      custom: (customField as HTMLInputElement | null)?.value,
    }).toEqual({ chosen: ["Custom…"], custom: "opencode/anthropic/claude-sonnet-5-5" });
  });

  it("saves model my-model when it is typed into the empty Custom model field chosen from claude-sonnet-5-5", async () => {
    const saved = await openReviewerSettings("Model", { model: "claude-sonnet-5-5", image: "acme/agent:2" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "model" }), "Custom…");
    await userEvent.type(screen.getByRole("textbox", { name: "Custom model" }), "my-model");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.model).toBe("my-model"));
  });

  it("shows image acme/agent:2 on the second agent node when the first node's image was edited and unsaved", async () => {
    const agentNode = (id: string, image: string) =>
      nodeView({
        id,
        station: id,
        kind: "agent",
        agent: { name: id, file: `agents/${id}.md`, version: null, prompt: "Go.", settings: { image } },
      });
    const actions = { saveSettings: () => Promise.resolve() };
    const { rerender } = render(<Inspector node={agentNode("first", "acme/agent:1")} actions={actions} />);
    await userEvent.click(screen.getByRole("tab", { name: "Pod" }));
    await userEvent.type(screen.getByRole("textbox", { name: "image" }), " edited");

    rerender(<Inspector node={agentNode("second", "acme/agent:2")} actions={actions} />);

    expect((screen.getByRole("textbox", { name: "image" }) as HTMLInputElement).value).toBe("acme/agent:2");
  });
});
