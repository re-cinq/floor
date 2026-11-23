// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openReviewerSettings } from "./settings-panel.fixtures";

describe("Inspector Settings panel config form", () => {
  it("shows max_turns 100 in a number field described by its schema help text", async () => {
    await openReviewerSettings({ image: "acme/agent:2", config: { max_turns: 100 } });

    const field = screen.queryByRole("spinbutton", { name: "max_turns" });
    const helpId = field?.getAttribute("aria-describedby");

    expect({
      value: (field as HTMLInputElement | null)?.valueAsNumber,
      help: helpId ? document.getElementById(helpId)?.textContent : undefined,
    }).toEqual({ value: 100, help: "The most turns the agent takes in one visit." });
  });

  it("saves config max_turns 50 beside env LOG debug when max_turns is changed from 100 to 50", async () => {
    const saved = await openReviewerSettings({ image: "acme/agent:2", config: { max_turns: 100, env: { LOG: "debug" } } });
    const field = screen.getByRole("spinbutton", { name: "max_turns" });
    await userEvent.clear(field);
    await userEvent.type(field, "50");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 50, env: { LOG: "debug" } }));
  });

  it("saves config with only env LOG debug when max_turns 100 is cleared", async () => {
    const saved = await openReviewerSettings({ image: "acme/agent:2", config: { max_turns: 100, env: { LOG: "debug" } } });
    await userEvent.clear(screen.getByRole("spinbutton", { name: "max_turns" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ env: { LOG: "debug" } }));
  });

  it("saves config permission_mode auto beside max_turns 100 when auto is chosen from the unset permission_mode dropdown", async () => {
    const saved = await openReviewerSettings({ image: "acme/agent:2", config: { max_turns: 100 } });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "permission_mode" }), "auto");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 100, permission_mode: "auto" }));
  });

  it("saves config model_secret_key anthropic-key beside max_turns 100 when anthropic-key is typed into the unset model_secret_key field", async () => {
    const saved = await openReviewerSettings({ image: "acme/agent:2", config: { max_turns: 100 } });
    await userEvent.type(screen.getByRole("textbox", { name: "model_secret_key" }), "anthropic-key");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ max_turns: 100, model_secret_key: "anthropic-key" }));
  });

  it("saves config skills review and lint when lint is added to the review skills list", async () => {
    const saved = await openReviewerSettings({ image: "acme/agent:2", config: { skills: ["review"] } });
    await userEvent.click(screen.getByRole("button", { name: "Add to skills" }));
    await userEvent.type(screen.getByRole("textbox", { name: "skills 2" }), "lint");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ skills: ["review", "lint"] }));
  });

  it("saves config skills lint only when review is removed from the review and lint skills list", async () => {
    const saved = await openReviewerSettings({ image: "acme/agent:2", config: { skills: ["review", "lint"] } });
    await userEvent.click(screen.getByRole("button", { name: "Remove skills 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(saved()?.config).toEqual({ skills: ["lint"] }));
  });

  it("offers api-design, tdd-start and Custom… with tdd-start chosen for config skills tdd-start", async () => {
    await openReviewerSettings({ image: "acme/agent:2", config: { skills: ["tdd-start"] } }, ["api-design", "tdd-start"]);

    const select = screen.queryByRole("combobox", { name: "skills 1" }) as HTMLSelectElement | null;

    expect({ options: select ? Array.from(select.options, (option) => option.textContent) : undefined, chosen: select?.value }).toEqual({
      options: ["api-design", "tdd-start", "Custom…"],
      chosen: "tdd-start",
    });
  });
});
