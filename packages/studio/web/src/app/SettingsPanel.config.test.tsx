// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openReviewerSettings } from "./settings-panel.fixtures";

describe("Inspector Settings panel config form", () => {
  it("shows max_turns 100 in a number field described by its schema help text", async () => {
    await openReviewerSettings("Model", { image: "acme/agent:2", config: { max_turns: 100 } });

    const field = screen.queryByRole("spinbutton", { name: "max_turns" });
    const helpId = field?.getAttribute("aria-describedby");

    expect({
      value: (field as HTMLInputElement | null)?.valueAsNumber,
      help: helpId ? document.getElementById(helpId)?.textContent : undefined,
    }).toEqual({ value: 100, help: "The most turns the agent takes in one visit." });
  });

  it("saves config max_turns 50 beside env LOG debug when max_turns is changed from 100 to 50", async () => {
    const saved = await openReviewerSettings("Model", { image: "acme/agent:2", config: { max_turns: 100, env: { LOG: "debug" } } });
    const field = screen.getByRole("spinbutton", { name: "max_turns" });
    await userEvent.clear(field);
    await userEvent.type(field, "50");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 50, env: { LOG: "debug" } }));
  });

  it("saves config with only env LOG debug when max_turns 100 is cleared", async () => {
    const saved = await openReviewerSettings("Model", { image: "acme/agent:2", config: { max_turns: 100, env: { LOG: "debug" } } });
    await userEvent.clear(screen.getByRole("spinbutton", { name: "max_turns" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ env: { LOG: "debug" } }));
  });

  it("saves config permission_mode auto beside max_turns 100 when auto is chosen from the unset permission_mode dropdown", async () => {
    const saved = await openReviewerSettings("Model", { image: "acme/agent:2", config: { max_turns: 100 } });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "permission_mode" }), "auto");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 100, permission_mode: "auto" }));
  });

  it("saves config model_secret_key anthropic-key beside max_turns 100 when anthropic-key is typed into the unset model_secret_key field", async () => {
    const saved = await openReviewerSettings("Model", { image: "acme/agent:2", config: { max_turns: 100 } });
    await userEvent.type(screen.getByRole("textbox", { name: "model_secret_key" }), "anthropic-key");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 100, model_secret_key: "anthropic-key" }));
  });

  it("saves config pod_resources limits memory 2Gi beside requests cpu 500m when 2Gi is typed into the empty limits memory cell", async () => {
    const saved = await openReviewerSettings("Pod", { image: "acme/agent:2", config: { pod_resources: { requests: { cpu: "500m" } } } });
    await userEvent.type(screen.getByRole("textbox", { name: "pod_resources limits memory" }), "2Gi");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ pod_resources: { requests: { cpu: "500m" }, limits: { memory: "2Gi" } } }));
  });

  it("saves config mcp_servers lore http beside files stdio npx when a files stdio npx card is added to the lore http card", async () => {
    const saved = await openReviewerSettings("MCP", {
      image: "acme/agent:2",
      config: { mcp_servers: [{ name: "lore", transport: "http", url: "https://lore.example/mcp" }] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Add server" }));
    await userEvent.type(screen.getByRole("textbox", { name: "mcp_servers 2 name" }), "files");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "mcp_servers 2 transport" }), "stdio");
    await userEvent.type(screen.getByRole("textbox", { name: "mcp_servers 2 command" }), "npx");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() =>
      expect(saved()?.config).toEqual({
        mcp_servers: [
          { name: "lore", transport: "http", url: "https://lore.example/mcp" },
          { name: "files", transport: "stdio", command: "npx" },
        ],
      }),
    );
  });

  it("saves config mcp_servers with only lore http when the Remove server button of files stdio npx is pressed", async () => {
    const saved = await openReviewerSettings("MCP", {
      image: "acme/agent:2",
      config: {
        mcp_servers: [
          { name: "lore", transport: "http", url: "https://lore.example/mcp" },
          { name: "files", transport: "stdio", command: "npx" },
        ],
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove server files" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() =>
      expect(saved()?.config).toEqual({
        mcp_servers: [{ name: "lore", transport: "http", url: "https://lore.example/mcp" }],
      }),
    );
  });

  it("shows only team_notes in the Other config YAML for config max_turns 100 and team_notes", async () => {
    await openReviewerSettings("Other", { image: "acme/agent:2", config: { max_turns: 100, team_notes: "keep it short" } });

    expect((screen.getByRole("textbox", { name: "config" }) as HTMLTextAreaElement).value).toBe("team_notes: keep it short\n");
  });

  it("shows url but not command for an http mcp_servers card", async () => {
    await openReviewerSettings("MCP", {
      image: "acme/agent:2",
      config: { mcp_servers: [{ name: "lore", transport: "http", url: "https://lore.example/mcp" }] },
    });

    expect({
      url: screen.queryByRole("textbox", { name: "mcp_servers 1 url" }) !== null,
      command: screen.queryByRole("textbox", { name: "mcp_servers 1 command" }) !== null,
    }).toEqual({ url: true, command: false });
  });

  it("captions the mcp_servers 1 url field with just url", async () => {
    await openReviewerSettings("MCP", {
      image: "acme/agent:2",
      config: { mcp_servers: [{ name: "lore", transport: "http", url: "https://lore.example/mcp" }] },
    });

    const field = screen.getByRole("textbox", { name: "mcp_servers 1 url" });

    expect({ label: Array.from((field as HTMLInputElement).labels ?? [], (label) => label.querySelector("span")?.textContent) }).toEqual({
      label: ["url"],
    });
  });

  it("shows chip env: LORE_MCP_URL instead of the url textbox for an mcp_servers url of ${LORE_MCP_URL}", async () => {
    await openReviewerSettings("MCP", {
      image: "acme/agent:2",
      config: { mcp_servers: [{ name: "lore", transport: "http", url: "${LORE_MCP_URL}" }] },
    });

    expect({
      chip: screen.queryByText("env: LORE_MCP_URL")?.textContent,
      field: screen.queryByRole("textbox", { name: "mcp_servers 1 url" }),
    }).toEqual({ chip: "env: LORE_MCP_URL", field: null });
  });

  it("saves config skills review and lint when lint is added to the review skills list", async () => {
    const saved = await openReviewerSettings("Tools", { image: "acme/agent:2", config: { skills: ["review"] } });
    await userEvent.click(screen.getByRole("button", { name: "Add to skills" }));
    await userEvent.type(screen.getByRole("textbox", { name: "skills 2" }), "lint");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ skills: ["review", "lint"] }));
  });

  it("saves config skills lint only when review is removed from the review and lint skills list", async () => {
    const saved = await openReviewerSettings("Tools", { image: "acme/agent:2", config: { skills: ["review", "lint"] } });
    await userEvent.click(screen.getByRole("button", { name: "Remove skills 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ skills: ["lint"] }));
  });

  it("saves config env LOG debug and MODE fast when MODE fast is added to the env LOG debug rows", async () => {
    const saved = await openReviewerSettings("Pod", { image: "acme/agent:2", config: { env: { LOG: "debug" } } });
    await userEvent.click(screen.getByRole("button", { name: "Add to env" }));
    await userEvent.type(screen.getByRole("textbox", { name: "env name 2" }), "MODE");
    await userEvent.type(screen.getByRole("textbox", { name: "env value 2" }), "fast");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ env: { LOG: "debug", MODE: "fast" } }));
  });

  it("saves config with only max_turns 100 when the only env row LOG debug is removed", async () => {
    const saved = await openReviewerSettings("Pod", { image: "acme/agent:2", config: { max_turns: 100, env: { LOG: "debug" } } });
    await userEvent.click(screen.getByRole("button", { name: "Remove env 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 100 }));
  });

  it("offers api-design, tdd-start and Custom… with tdd-start chosen for config skills tdd-start", async () => {
    await openReviewerSettings("Tools", { image: "acme/agent:2", config: { skills: ["tdd-start"] } }, ["api-design", "tdd-start"]);

    const select = screen.queryByRole("combobox", { name: "skills 1" }) as HTMLSelectElement | null;

    expect({ options: select ? Array.from(select.options, (option) => option.textContent) : undefined, chosen: select?.value }).toEqual({
      options: ["api-design", "tdd-start", "Custom…"],
      chosen: "tdd-start",
    });
  });
});
