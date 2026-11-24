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
  it("shows no Prompt textbox until Edit prompt is pressed, then 'Work {ticket}.' in it", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    const beforeEdit = await within(panel).findByRole("button", { name: "Edit prompt" }).then(() => within(panel).queryByRole("textbox", { name: "Prompt" }));

    await userEvent.click(within(panel).getByRole("button", { name: "Edit prompt" }));
    const editor = (await within(panel).findByRole("textbox", { name: "Prompt" })) as HTMLTextAreaElement;

    expect([beforeEdit, editor.value]).toEqual([null, "Work {ticket}.\n"]);
  });

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

  it("writes 'Work {ticket}.' joined with ' edited' over the disk version when 'Keep my edits' is chosen and the prompt is saved", async () => {
    const { dir, editor } = await openPromptEditor();

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(await screen.findByRole("button", { name: "Keep my edits" }));
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Work {ticket}. edited")));
  });
});

describe("App prompt unwrapping on edit", () => {
  it("writes 'Work on {ticket} now. please' without the soft break when ' please' is appended to 'Work on\\n{ticket} now.' and saved", async () => {
    const wrappedCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work on\n{ticket} now.") }];
    const { dir } = await openPage(wrappedCollection, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Edit prompt" }));
    const editor = await within(panel).findByRole("textbox", { name: "Prompt" });

    await userEvent.type(editor, " please");
    await userEvent.click(within(panel).getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Work on {ticket} now. please")));
  });

  it("opens the Prompt editor with 'Work on {ticket} now.\n' when the prompt is 'Work on\n{ticket} now.'", async () => {
    const wrappedCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work on\n{ticket} now.") }];
    await openPage(wrappedCollection, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Edit prompt" }));
    const editor = (await within(panel).findByRole("textbox", { name: "Prompt" })) as HTMLTextAreaElement;

    expect(editor.value).toEqual("Work on {ticket} now.\n");
  });
});

describe("App extra prompt editing", () => {
  it("shows 'Work {ticket}.' in Prompt and 'Also check the tests.' in Extra prompt when the agent has both worker.md and worker.extra.md", async () => {
    const extraCollection = [...WORKER_COLLECTION, { path: "flow/agents/worker.extra.md", text: "Also check the tests.\n" }];
    await openPage(extraCollection, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Edit prompt" }));
    await userEvent.click(await within(panel).findByRole("button", { name: "Edit extra prompt" }));
    const promptEditor = (await within(panel).findByRole("textbox", { name: "Prompt" })) as HTMLTextAreaElement;
    const extraEditor = (await within(panel).findByRole("textbox", { name: "Extra prompt" })) as HTMLTextAreaElement;

    expect([promptEditor.value, extraEditor.value]).toEqual(["Work {ticket}.\n", "Also check the tests.\n"]);
  });

  it("writes 'Also check the docs.' to the extra file when the extra prompt is edited and saved", async () => {
    const extraCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.extra.md", text: "Also check the tests.\n" }];
    const { dir } = await openPage(extraCollection, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Edit extra prompt" }));
    const extraEditor = await within(panel).findByRole("textbox", { name: "Extra prompt" });

    await userEvent.clear(extraEditor);
    await userEvent.type(extraEditor, "Also check the docs.{Enter}");
    await userEvent.click(within(panel).getByRole("button", { name: "Save extra prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.extra.md"), "utf8")).toBe("Also check the docs.\n"));
  });
});

describe("App settings editing", () => {
  it("shows the nested config setting as the YAML text 'extras:\\n  LOG: debug\\n'", async () => {
    const configCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work {ticket}.", "config:\n  extras:\n    LOG: debug\n") }];
    await openPage(configCollection, { hash: "&line=flow&node=work&tab=Other" });
    const panel = await screen.findByRole("tabpanel", { name: "Other" });

    expect((await within(panel).findByRole("textbox", { name: "config" }) as HTMLTextAreaElement).value).toBe("extras:\n  LOG: debug\n");
  });

  it("writes the nested config 'extras: LOG: info' as nested YAML when the config setting is edited and saved", async () => {
    const configCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work {ticket}.", "config:\n  extras:\n    LOG: debug\n") }];
    const { dir } = await openPage(configCollection, { hash: "&line=flow&node=work&tab=Other" });
    const panel = await screen.findByRole("tabpanel", { name: "Other" });
    const configField = await within(panel).findByRole("textbox", { name: "config" });

    await userEvent.clear(configField);
    await userEvent.type(configField, "extras:{Enter}  LOG: info{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Work {ticket}.", "config:\n  extras:\n    LOG: info\n")));
  });

  it("alerts naming config and keeps the file unchanged when the nested config setting is saved as invalid YAML 'extras: [unclosed'", async () => {
    const original = agentMarkdown("Work {ticket}.", "config:\n  extras:\n    LOG: debug\n");
    const configCollection = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: original }];
    const { dir } = await openPage(configCollection, { hash: "&line=flow&node=work&tab=Other" });
    const panel = await screen.findByRole("tabpanel", { name: "Other" });
    const configField = await within(panel).findByRole("textbox", { name: "config" });

    await userEvent.clear(configField);
    await userEvent.type(configField, "extras: [[unclosed");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect([(await within(panel).findByRole("alert")).textContent, readFileSync(join(dir, "flow/agents/worker.md"), "utf8")]).toEqual([
      expect.stringMatching(/config/),
      original,
    ]);
  });

  it("writes image 'acme/agent:3' to the agent's file when the image setting is edited and saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Pod" });
    const panel = await screen.findByRole("tabpanel", { name: "Pod" });
    const imageField = await within(panel).findByRole("textbox", { name: "image" });

    await userEvent.clear(imageField);
    await userEvent.type(imageField, "acme/agent:3");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:3\ntimeout_minutes: 10\n---\nWork {ticket}.\n"));
  });

  it("writes image 'acme/agent:3' over the disk version 'acme/agent:9' when 'Keep my edits' is chosen and settings are saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Pod" });
    const panel = await screen.findByRole("tabpanel", { name: "Pod" });
    const imageField = await within(panel).findByRole("textbox", { name: "image" });

    await userEvent.clear(imageField);
    await userEvent.type(imageField, "acme/agent:3");
    writeFileSync(join(dir, "flow/agents/worker.md"), "---\nimage: acme/agent:9\ntimeout_minutes: 10\n---\nWork {ticket}.\n");
    await userEvent.click(await screen.findByRole("button", { name: "Keep my edits" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:3\ntimeout_minutes: 10\n---\nWork {ticket}.\n"));
  });

  it("shows image 'acme/agent:9' in the Settings form when the agent file changes on disk without unsaved edits", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Pod" });
    const panel = await screen.findByRole("tabpanel", { name: "Pod" });
    await within(panel).findByRole("textbox", { name: "image" });

    writeFileSync(join(dir, "flow/agents/worker.md"), "---\nimage: acme/agent:9\ntimeout_minutes: 10\n---\nWork {ticket}.\n");

    expect((await within(panel).findByDisplayValue("acme/agent:9")).getAttribute("aria-label")).toBe("image");
  });

  it("writes timeout_minutes 30 as a number when the numeric setting is edited and saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Pod" });
    const panel = await screen.findByRole("tabpanel", { name: "Pod" });
    const timeoutField = await within(panel).findByRole("textbox", { name: "timeout_minutes" });

    await userEvent.clear(timeoutField);
    await userEvent.type(timeoutField, "30");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:2\ntimeout_minutes: 30\n---\nWork {ticket}.\n"));
  });

  it("alerts naming timeout_minutes and keeps the file unchanged when the numeric setting is saved as 'abc'", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Pod" });
    const panel = await screen.findByRole("tabpanel", { name: "Pod" });
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
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Pod" });
    const panel = await screen.findByRole("tabpanel", { name: "Pod" });
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
