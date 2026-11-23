// @vitest-environment jsdom
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { basename } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { TYPO_COLLECTION, WORKER_COLLECTION, agentMarkdown, lineYaml } from "../../../src/backend/collection-view.fixtures";
import { collectionOnDisk } from "../../../src/backend/studio.fixtures";
import { startStudio, type Studio } from "../../../src/backend/start-studio";
import App from "./App";

const running: Studio[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
  window.location.hash = "";
});

interface OpenedPage {
  dir: string;
  studio: Studio;
}

async function openPage(files: CollectionFile[], options: { token?: string; hash?: string } = {}): Promise<OpenedPage> {
  const dir = collectionOnDisk(files);
  const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [] });

  running.push(studio);
  window.location.hash = `#${new URLSearchParams({ socket: studio.url, token: options.token ?? studio.token }).toString()}${options.hash ?? ""}`;
  render(<App />);

  return { dir, studio };
}

const BROKEN_LINE: CollectionFile = { path: "broken/assembly-line.yaml", text: "line: [unclosed" };

describe("App without an address", () => {
  it("says the page was not told where the studio is, and what to do", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "This page was not told where the studio is" })).toBeTruthy();
  });
});

describe("App against the real backend", () => {
  it("lists the collection's folder, its lines with their node counts, and shows it connected", async () => {
    const { dir } = await openPage(WORKER_COLLECTION);

    const lines = await screen.findByRole("navigation", { name: "Assembly lines" });

    expect({
      folder: screen.getByText(basename(dir)).textContent,
      lines: within(lines).getAllByRole("link").map((link) => link.textContent),
      connection: screen.getByRole("status").textContent,
    }).toEqual({ folder: basename(dir), lines: ["flow2 nodes"], connection: "Connected to the studio" });
  });

  it("shows a count of problems beside a line that has some", async () => {
    await openPage(TYPO_COLLECTION);

    const link = await screen.findByRole("link", { name: /flow/ });

    expect(within(link).getByLabelText(/problems$/).textContent).toBe("1");
  });

  it("lists a refused file with its path and why, and still draws the others", async () => {
    await openPage([...WORKER_COLLECTION, BROKEN_LINE]);

    const refused = await screen.findByRole("region", { name: "Refused files" });

    expect(refused.textContent).toMatch(/^refused filesbroken\/assembly-line\.yaml\S.+/);
  });

  it("still lists the lines that can be read beside a refused file", async () => {
    await openPage([...WORKER_COLLECTION, BROKEN_LINE]);

    expect(await screen.findByRole("link", { name: /flow/ })).toBeTruthy();
  });

  it("says so when the folder holds no assembly line", async () => {
    await openPage([]);

    expect(await screen.findByRole("heading", { name: "This folder holds no assembly line" })).toBeTruthy();
  });

  it("says the studio refused the page when the token is not the one it started with", async () => {
    await openPage(WORKER_COLLECTION, { token: "not-the-token" });

    expect(await screen.findByRole("heading", { name: "The studio refused this page" })).toBeTruthy();
  });

  it("says it cannot connect when nothing answers at the address, and keeps trying", async () => {
    const dir = collectionOnDisk(WORKER_COLLECTION);
    const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [] });

    await studio.close();
    window.location.hash = `#${new URLSearchParams({ socket: studio.url, token: studio.token }).toString()}`;
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Cannot connect to the studio" })).toBeTruthy();
  });

  it("says the studio could not be read, with the reason, instead of Connecting, when the folder is gone", async () => {
    const dir = collectionOnDisk(WORKER_COLLECTION);
    const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [] });

    running.push(studio);
    rmSync(dir, { recursive: true });
    window.location.hash = `#${new URLSearchParams({ socket: studio.url, token: studio.token }).toString()}`;
    render(<App />);

    const unreadable = (await screen.findByRole("heading", { name: "The studio could not be read" })).parentElement;

    expect({ reason: unreadable?.textContent, connecting: screen.queryByRole("heading", { name: "Connecting to the studio" }) }).toMatchObject({
      reason: expect.stringMatching(/ENOENT/),
      connecting: null,
    });
  });

  it("replaces the lines with 'The studio could not be read' and ENOENT when the folder is deleted after loading", async () => {
    const { dir } = await openPage(WORKER_COLLECTION);

    await screen.findByRole("link", { name: /flow/ });
    rmSync(dir, { recursive: true });

    const unreadable = (await screen.findByRole("heading", { name: "The studio could not be read" })).parentElement;

    expect({ reason: unreadable?.textContent, staleLine: screen.queryByRole("link", { name: /flow/ }) }).toMatchObject({
      reason: expect.stringMatching(/ENOENT/),
      staleLine: null,
    });
  });

  it("asks for a line to be chosen until one is", async () => {
    await openPage(WORKER_COLLECTION);

    expect(await screen.findByRole("heading", { name: "Choose an assembly line" })).toBeTruthy();
  });
});

describe("App line view", () => {
  it("shows the line's id, file, entry, exit, how it starts and its args when a line is chosen", async () => {
    await openPage(WORKER_COLLECTION);

    await userEvent.click(await screen.findByRole("link", { name: /flow/ }));

    const facts = (await screen.findByRole("heading", { name: "flow", level: 1 })).parentElement as HTMLElement;

    expect(facts.textContent).toBe("flowflow/assembly-line.yamlentrywork" + "exitdone" + "startsby API" + "argsticket (value), the subject");
  });

  it("draws the line's graph under a name a screen reader reads", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow" });

    expect(await screen.findByRole("img", { name: "Assembly line graph: flow" })).toBeTruthy();
  });

  it("says the line is gone when the address names one the collection does not have", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=gone" });

    expect(await screen.findByRole("heading", { name: "That assembly line is not in the collection" })).toBeTruthy();
  });

  it("selects a node on click, shows it in the inspector and keeps socket, token, line and node in the address", async () => {
    const { studio } = await openPage(WORKER_COLLECTION, { hash: "&line=flow" });

    await userEvent.click(await screen.findByRole("button", { name: /^work, agent/ }));

    const inspector = screen.getByRole("complementary", { name: "Node inspector" });

    expect({ inspected: inspector.textContent, address: Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))) }).toEqual({
      inspected: expect.stringContaining("nodework" + "station work"),
      address: { socket: studio.url, token: studio.token, line: "flow", node: "work" },
    });
  });

  it("keeps the place on a reload: the node in the address is selected", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work" });

    const node = await screen.findByRole("button", { name: /^work, agent/ });

    expect(node.getAttribute("aria-pressed")).toBe("true");
  });

  it("selects the Events tab on a reload when the address names tab=Events", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Events" });

    expect(await screen.findByRole("tab", { name: "Events", selected: true })).toBeTruthy();
  });

  it("selects the Station tab when the address names tab=Bogus", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Bogus" });

    expect(await screen.findByRole("tab", { name: "Station", selected: true })).toBeTruthy();
  });

  it("keeps tab=Events in the address after a click on the Events tab", async () => {
    const { studio } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work" });

    await userEvent.click(await screen.findByRole("tab", { name: "Events" }));

    expect(Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))).toEqual({ socket: studio.url, token: studio.token, line: "flow", node: "work", tab: "Events" });
  });

  it("clears the node on Escape and leaves the line", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work" });

    await screen.findByRole("button", { name: /^work, agent/, pressed: true });
    await userEvent.keyboard("{Escape}");

    await screen.findByRole("button", { name: /^work, agent/, pressed: false });
    expect(Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))).toMatchObject({ line: "flow" });
  });

  it("keeps tab=Events in the address when another node is clicked", async () => {
    const { studio } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Events" });

    await userEvent.click(await screen.findByRole("button", { name: /^done, / }));

    await screen.findByRole("button", { name: /^done, /, pressed: true });
    expect(Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))).toEqual({ socket: studio.url, token: studio.token, line: "flow", node: "done", tab: "Events" });
  });

  it("clears the tab with the node on Escape", async () => {
    const { studio } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Events" });

    await screen.findByRole("button", { name: /^work, agent/, pressed: true });
    await userEvent.keyboard("{Escape}");

    await screen.findByRole("button", { name: /^work, agent/, pressed: false });
    expect(Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))).toEqual({ socket: studio.url, token: studio.token, line: "flow" });
  });

  it("lists a line's problems by rule, node and message, and selects the node a problem names", async () => {
    await openPage(TYPO_COLLECTION, { hash: "&line=flow" });

    const problems = await screen.findByRole("region", { name: /Problems/ });
    const [, row] = within(problems).getAllByRole("row");
    const [rule] = within(row).getAllByRole("cell");

    await userEvent.click(within(row).getByRole("button", { name: "work" }));

    expect({ rule: rule.textContent, selected: screen.getByRole("button", { name: /^work, agent/ }).getAttribute("aria-pressed") }).toEqual({ rule: "unsupplied-input", selected: "true" });
  });

  it("updates the graph in place when a line file changes on disk, keeping the selection", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work" });
    const countEdges = () => document.querySelectorAll("[data-edge]").length;

    await screen.findByRole("img", { name: "Assembly line graph: flow" });
    const before = countEdges();
    const grown = lineYaml("flow", "worker").replace("    - id: done\n", "    - id: done\n    - id: extra\n").replace("      on: success\n", "      on: success\n    - from: work\n      to: extra\n      on: failed\n");

    writeFileSync(join(dir, "flow", "assembly-line.yaml"), grown);

    await waitFor(() => expect(countEdges()).toBe(before + 1));
    await screen.findByRole("button", { name: /^work, agent/, pressed: true });
  });
});

describe("App prompt editing", () => {
  it("writes 'Work on {ticket} carefully.' to the agent's file when the prompt is edited and saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });

    const editor = await within(await screen.findByRole("tabpanel", { name: "Prompt" })).findByRole("textbox", { name: "Prompt" });

    await userEvent.clear(editor);
    await userEvent.type(editor, "Work on {{ticket} carefully.{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Work on {ticket} carefully.")));
  });

  it("keeps the unsaved ' edited' in the Prompt textbox when the line file changes on disk", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const editor = await within(await screen.findByRole("tabpanel", { name: "Prompt" })).findByRole("textbox", { name: "Prompt" });
    const grown = lineYaml("flow", "worker").replace("    - id: done\n", "    - id: done\n    - id: extra\n").replace("      on: success\n", "      on: success\n    - from: work\n      to: extra\n      on: failed\n");

    await userEvent.type(editor, " edited");
    writeFileSync(join(dir, "flow", "assembly-line.yaml"), grown);
    await screen.findAllByRole("button", { name: /^extra\b/ });

    expect((screen.getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement).value).toMatch(/ edited$/);
  });

  it("shows 'Changed elsewhere.' in the Prompt textbox when the agent file changes on disk without unsaved edits", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    await within(panel).findByRole("textbox", { name: "Prompt" });

    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));

    await waitFor(() => expect((screen.getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement).value).toBe("Changed elsewhere.\n"));
  });

  it("shows 'Changed elsewhere.' in the Prompt textbox when 'Take the version on disk' is chosen over unsaved ' edited'", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "Prompt" }), " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(await screen.findByRole("button", { name: "Take the version on disk" }));

    expect(await screen.findByDisplayValue("Changed elsewhere.")).toBeDefined();
  });

  it("writes 'Then more.' to the agent's file when saved after the prompt changed on disk to 'Changed elsewhere.'", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });
    await within(panel).findByRole("textbox", { name: "Prompt" });

    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    const editor = await screen.findByDisplayValue("Changed elsewhere.");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Then more.{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Then more.")));
  });

  it("alerts 'changed on disk' and keeps the file as 'Changed elsewhere.' when the file changed after the page read it", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "Prompt" }), " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    expect([(await within(panel).findByRole("alert")).textContent, readFileSync(join(dir, "flow/agents/worker.md"), "utf8")]).toEqual([
      expect.stringMatching(/changed on disk/),
      agentMarkdown("Changed elsewhere."),
    ]);
  });

  it("keeps the file as 'Changed elsewhere.' when Save is pressed after the disk change was pushed, before choosing a version", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "Prompt" }), " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await screen.findByRole("button", { name: "Take the version on disk" });
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    await within(panel).findByRole("alert").catch(() => new Promise((settle) => setTimeout(settle, 500)));

    expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe(agentMarkdown("Changed elsewhere."));
  });

  it("writes 'Work {ticket}.' followed by ' edited' over the disk version when 'Keep my edits' is chosen and the prompt is saved", async () => {
    const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
    const panel = await screen.findByRole("tabpanel", { name: "Prompt" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "Prompt" }), " edited");
    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Changed elsewhere."));
    await userEvent.click(await screen.findByRole("button", { name: "Keep my edits" }));
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() => expect(readFileSync(join(dir, "flow/agents/worker.md"), "utf8")).toBe("---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nWork {ticket}.\n edited"));
  });
});

describe("App theme switch", () => {
  it("puts the chosen scheme on the page", async () => {
    await openPage(WORKER_COLLECTION);

    await userEvent.click(await screen.findByRole("radio", { name: "dark" }));

    expect([document.documentElement.getAttribute("data-color-scheme"), (screen.getByRole("radio", { name: "dark" }) as HTMLInputElement).checked]).toEqual(["dark", true]);
  });
});
