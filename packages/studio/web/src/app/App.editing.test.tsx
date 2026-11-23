// @vitest-environment jsdom
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WORKER_COLLECTION, agentMarkdown, lineYaml } from "../../../src/backend/collection-view.fixtures";
import { closeStudios, openPage, openPromptEditor } from "./app-page.fixtures";

afterEach(closeStudios);

describe("App prompt editing", () => {
  it("writes 'Work on {ticket} carefully.' to the agent's file when the prompt is edited and saved", async () => {
    const { dir, editor } = await openPromptEditor();

    await userEvent.clear(editor);
    await userEvent.type(editor, "Work on {{ticket} carefully.{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Work on {ticket} carefully.")));
  });

  it("keeps the unsaved ' edited' in the Prompt textbox when the line file changes on disk", async () => {
    const { dir, editor } = await openPromptEditor();
    const grown = lineYaml("flow", "worker").replace("    - id: done\n", "    - id: done\n    - id: extra\n").replace("      on: success\n", "      on: success\n    - from: work\n      to: extra\n      on: failed\n");

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow", "assembly-line.yaml"), grown);
    await screen.findAllByRole("button", { name: /^extra\b/ });

    expect((screen.getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement).value).toMatch(/ edited$/);
  });

  it("shows 'Changed elsewhere.' in the Prompt textbox when the agent file changes on disk without unsaved edits", async () => {
    const { dir } = await openPromptEditor();

    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));

    await waitFor(() => expect((screen.getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement).value).toBe("Changed elsewhere.\n"));
  });

  it("shows 'Changed elsewhere.' in the Prompt textbox when 'Take the version on disk' is chosen over unsaved ' edited'", async () => {
    const { dir, editor } = await openPromptEditor();

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(await screen.findByRole("button", { name: "Take the version on disk" }));

    expect(await screen.findByDisplayValue("Changed elsewhere.")).toBeDefined();
  });

  it("writes 'Then more.' to the agent's file when saved after the prompt changed on disk to 'Changed elsewhere.'", async () => {
    const { dir } = await openPromptEditor();

    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    const editor = await screen.findByDisplayValue("Changed elsewhere.");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Then more.{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Then more.")));
  });

  it("alerts 'changed on disk' and keeps the file as 'Changed elsewhere.' when the file changed after the page read it", async () => {
    const { dir, panel, editor } = await openPromptEditor();

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    expect([(await within(panel).findByRole("alert")).textContent, readFileSync(join(dir, "flow/agents/worker.md"), "utf8")]).toEqual([
      expect.stringMatching(/changed on disk/),
      agentMarkdown("Changed elsewhere."),
    ]);
  });

  it("alerts 'changed on disk' and keeps the file as 'Changed elsewhere.' when Save is pressed after the disk change was pushed, before choosing a version", async () => {
    const { dir, panel, editor } = await openPromptEditor();

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await screen.findByRole("button", { name: "Take the version on disk" });
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    expect([(await within(panel).findByRole("alert")).textContent, readFileSync(join(dir, "flow/agents/worker.md"), "utf8")]).toEqual([
      expect.stringMatching(/changed on disk/),
      agentMarkdown("Changed elsewhere."),
    ]);
  });

  it("writes 'Work {ticket}.' followed by ' edited' over the disk version when 'Keep my edits' is chosen and the prompt is saved", async () => {
    const { dir, editor } = await openPromptEditor();

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(await screen.findByRole("button", { name: "Keep my edits" }));
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nWork {ticket}.\n edited"));
  });
});

describe("App settings editing", () => {
  it("shows the nested config setting as the YAML text 'env:\\n  LOG: debug\\n'", async () => {
    const configCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work {ticket}.", "config:\n  env:\n    LOG: debug\n") }];
    await openPage(configCollection, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });

    expect((await within(panel).findByRole("textbox", { name: "config" }) as HTMLTextAreaElement).value).toBe("env:\n  LOG: debug\n");
  });

  it("writes the nested config 'env: LOG: info' as nested YAML when the config setting is edited and saved", async () => {
    const configCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work {ticket}.", "config:\n  env:\n    LOG: debug\n") }];
    const { dir } = await openPage(configCollection, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });
    const configField = await within(panel).findByRole("textbox", { name: "config" });

    await userEvent.clear(configField);
    await userEvent.type(configField, "env:{Enter}  LOG: info{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Work {ticket}.", "config:\n  env:\n    LOG: info\n")));
  });

  it("writes image 'acme/agent:3' to the agent's file when the image setting is edited and saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });
    const imageField = await within(panel).findByRole("textbox", { name: "image" });

    await userEvent.clear(imageField);
    await userEvent.type(imageField, "acme/agent:3");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:3\ntimeout_minutes: 10\n---\nWork {ticket}.\n"));
  });

  it("shows image 'acme/agent:9' in the Settings form when the agent file changes on disk without unsaved edits", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });
    await within(panel).findByRole("textbox", { name: "image" });

    writeFileSync(join(dir, "flow/agents/worker.md"), "---\nimage: acme/agent:9\ntimeout_minutes: 10\n---\nWork {ticket}.\n");

    expect((await within(panel).findByDisplayValue("acme/agent:9")).getAttribute("aria-label")).toBe("image");
  });

  it("writes timeout_minutes 30 as a number when the numeric setting is edited and saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });
    const timeoutField = await within(panel).findByRole("textbox", { name: "timeout_minutes" });

    await userEvent.clear(timeoutField);
    await userEvent.type(timeoutField, "30");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:2\ntimeout_minutes: 30\n---\nWork {ticket}.\n"));
  });

  it("alerts naming timeout_minutes and keeps the file unchanged when the numeric setting is saved as 'abc'", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });
    const timeoutField = await within(panel).findByRole("textbox", { name: "timeout_minutes" });

    await userEvent.clear(timeoutField);
    await userEvent.type(timeoutField, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect([(await within(panel).findByRole("alert")).textContent, readFileSync(join(dir, "flow/agents/worker.md"), "utf8")]).toEqual([
      expect.stringMatching(/timeout_minutes/),
      "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nWork {ticket}.\n",
    ]);
  });

  it("alerts 'changed on disk' and keeps the file at image 'acme/agent:9' when Save is pressed after the disk change was pushed, before choosing a version", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Settings" });
    const panel = await screen.findByRole("tabpanel", { name: "Settings" });
    const imageField = await within(panel).findByRole("textbox", { name: "image" });
    const changedOnDisk = "---\nimage: acme/agent:9\ntimeout_minutes: 10\n---\nWork {ticket}.\n";

    await userEvent.clear(imageField);
    await userEvent.type(imageField, "acme/agent:3");
    writeFileSync(join(dir, "flow/agents/worker.md"), changedOnDisk);
    await within(panel).findByRole("button", { name: "Take the version on disk" });
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect([(await within(panel).findByRole("alert")).textContent, readFileSync(join(dir, "flow/agents/worker.md"), "utf8")]).toEqual([
      expect.stringMatching(/changed on disk/),
      changedOnDisk,
    ]);
  });
});
