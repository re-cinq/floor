import { describe, expect, it } from "vitest";
import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { textVersion } from "./agent-file-text.js";
import { collectionView } from "./collection-view.js";
import { PLAN_WRITE_COLLECTION, TYPO_COLLECTION, WORKER_COLLECTION, WRITE_REVIEW_COLLECTION, agentMarkdown, lineYaml } from "./collection-view.fixtures.js";

const [FLOW_LINE, WORKER_AGENT] = WORKER_COLLECTION;

function onlyLine(files: CollectionFile[], hostKeys: string[] = []) {
  return collectionView(files, hostKeys).lines[0];
}

describe("collectionView", () => {
  it("shows one line with its entry, exit, nodes and edges for a collection of one line and its agent", () => {
    expect(onlyLine(WORKER_COLLECTION)).toMatchObject({
      id: "flow",
      file: "flow/assembly-line.yaml",
      entry: "work",
      exit: "done",
      args: { ticket: { kind: "value" } },
      nodes: [{ id: "work" }, { id: "done", outcomes: [] }],
      edges: [{ from: "work", to: "done", on: "success" }],
      problems: [],
    });
  });

  it("shows a station's kind, description, outcomes and produces on its node", () => {
    expect(onlyLine(WORKER_COLLECTION).nodes[0]).toMatchObject({
      id: "work",
      station: "work",
      kind: "agent",
      description: "Works the ticket.",
      outcomes: ["success"],
      produces: [],
      agentDefinition: "worker",
    });
  });

  it("names node review as a reader of the draft that node write produces", () => {
    const [write] = onlyLine(WRITE_REVIEW_COLLECTION).nodes;

    expect(write.produces).toEqual([{ name: "draft", kind: "value", readBy: ["review"] }]);
  });

  it("leaves readBy empty for the draft that node write produces when only upstream node plan needs draft", () => {
    const [, write] = onlyLine(PLAN_WRITE_COLLECTION).nodes;

    expect(write.produces).toEqual([{ name: "draft", kind: "value", readBy: [] }]);
  });

  it("marks the need ticket of node work seeded when ticket is a line argument", () => {
    const [work] = onlyLine(WORKER_COLLECTION).nodes;

    expect(work.needs).toEqual([{ name: "ticket", kind: "value", coverage: { kind: "seeded" } }]);
  });

  it("gives an agent node its agent and the state of each placeholder of its prompt", () => {
    expect(onlyLine(TYPO_COLLECTION).nodes[0]).toMatchObject({
      agent: { name: "worker", file: "flow/agents/worker.md" },
      placeholders: { placeholders: [{ name: "ticket", state: "seeded" }, { name: "typo", state: "unsupplied" }], unused: [] },
      events: { startedBy: [{ event: "node.work.start", origin: "line-start" }] },
    });
  });

  it("carries the prompt Work {ticket}. of agent worker on node work", () => {
    const [work] = onlyLine(WORKER_COLLECTION).nodes;

    expect(work.agent).toEqual({ name: "worker", file: "flow/agents/worker.md", version: textVersion(WORKER_COLLECTION.find((file) => file.path === "flow/agents/worker.md")?.text ?? ""), prompt: "Work {ticket}.\n", settings: { image: "acme/agent:2", timeout_minutes: 10 } });
  });

  it("carries the sha256 version of flow/agents/worker.md as read on agent worker of node work", () => {
    const [work] = onlyLine(WORKER_COLLECTION).nodes;
    const workerFile = WORKER_COLLECTION.find((file) => file.path === "flow/agents/worker.md");

    expect(work.agent).toMatchObject({ version: textVersion(workerFile?.text ?? "") });
  });

  it("carries flow/agents/worker.extra.md with its version as extra of node work when no worker.md exists", () => {
    const extraText = "Also check the tests.\n";
    const files = [FLOW_LINE, { path: "flow/agents/worker.extra.md", text: extraText }];

    const [work] = onlyLine(files).nodes;

    expect(work.extra).toEqual({ file: "flow/agents/worker.extra.md", text: extraText, version: textVersion(extraText) });
  });

  it("carries stock/flow/agents/worker.extra.md with its version as extra of node work for a line in group stock", () => {
    const extraText = "Also check the tests.\n";
    const files = [{ ...FLOW_LINE, path: "stock/flow/assembly-line.yaml" }, { path: "stock/flow/agents/worker.extra.md", text: extraText }];

    const [work] = onlyLine(files).nodes;

    expect(work.extra).toEqual({ file: "stock/flow/agents/worker.extra.md", text: extraText, version: textVersion(extraText) });
  });

  it("marks the node whose line names a fanout with that fanout", () => {
    const fanning = FLOW_LINE.text.replace("    - id: work\n      station: work\n", "    - id: work\n      station: work\n      fanout:\n        over: tickets\n        to: done\n");

    expect(onlyLine([{ ...FLOW_LINE, text: fanning }, WORKER_AGENT]).nodes[0]).toMatchObject({ id: "work", fanout: { over: "tickets", to: "done" } });
  });

  it("gives a marker node no station and no agent", () => {
    expect(onlyLine(WORKER_COLLECTION).nodes[1]).toEqual({ id: "done", outcomes: [], needs: [], produces: [], events: expect.objectContaining({ answeredBy: [] }) });
  });

  it("lists an agent with its settings, its prompt and the nodes that use it", () => {
    expect(collectionView(WORKER_COLLECTION, []).agents).toEqual([
      {
        name: "worker",
        file: "flow/agents/worker.md",
        source: "collection-new",
        settings: { image: "acme/agent:2", timeout_minutes: 10 },
        prompt: "Work {ticket}.\n",
        usedBy: [{ line: "flow", node: "work" }],
      },
    ]);
  });

  it("shows ${NAME} in an agent's settings as written, not filled from any environment", () => {
    const files = [FLOW_LINE, { path: "flow/agents/worker.md", text: agentMarkdown("Go.", "config:\n  token: ${SECRET_TOKEN}\n") }];

    expect(collectionView(files, []).agents).toMatchObject([{ settings: { config: { token: "${SECRET_TOKEN}" } } }]);
  });

  it("keeps a line whose agent no file defines, with the problem against its file", () => {
    expect(collectionView([FLOW_LINE], [])).toMatchObject({
      lines: [{ id: "flow", nodes: [{ id: "work", kind: "agent" }, { id: "done" }], problems: [{ rule: "undeclared-agent", message: expect.stringContaining('names agent definition "worker"') }] }],
      refused: [],
    });
  });

  it("shows a prompt's unsupplied placeholder as a problem of its node, and keeps the line", () => {
    expect(onlyLine(TYPO_COLLECTION)).toMatchObject({ id: "flow", problems: [{ rule: "unsupplied-input", node: "work", message: expect.stringContaining("reads typo") }] });
  });

  it("says a dangling edge once, as the lint's rule, and not again as the line check's wording", () => {
    const files = [{ path: "flow/assembly-line.yaml", text: lineYaml("flow", "worker").replace("to: done", "to: nowhere") }, WORKER_AGENT];
    const rules = onlyLine(files).problems.map((problem) => problem.rule);

    expect(rules.filter((rule) => rule === "dangling-edge" || rule === "line-validation")).toEqual(["dangling-edge"]);
  });

  it("keeps a line check's problem that the lint has no rule for", () => {
    const text = lineYaml("flow", "worker").replace("station: work\n    - id: done", "station: unknown-station\n    - id: done");

    expect(onlyLine([{ path: "flow/assembly-line.yaml", text }, WORKER_AGENT]).problems).toContainEqual({ rule: "line-validation", message: 'node "work" names unknown station "unknown-station"' });
  });

  it("refuses a line file that is not YAML at all, on its path, and still shows the other lines", () => {
    const files = [...WORKER_COLLECTION, { path: "broken/assembly-line.yaml", text: "line: [unclosed" }];

    expect(collectionView(files, [])).toMatchObject({ lines: [{ id: "flow" }], refused: [{ path: "broken/assembly-line.yaml" }] });
  });

  it("refuses an agent file with no frontmatter on its path and leaves the node without an agent", () => {
    const { refused, lines } = collectionView([FLOW_LINE, { path: "flow/agents/worker.md", text: "no frontmatter" }], []);
    const [work] = lines[0].nodes;

    expect({ refused, agent: work.agent }).toEqual({ refused: [{ path: "flow/agents/worker.md", reason: "worker.md: missing the --- frontmatter block" }], agent: undefined });
  });

  it("refuses the former pipeline.yaml of a folder that also holds assembly-line.yaml", () => {
    const files = [...WORKER_COLLECTION, { path: "flow/pipeline.yaml", text: lineYaml("flow", "worker") }];

    expect(collectionView(files, [])).toMatchObject({ lines: [{ file: "flow/assembly-line.yaml" }], refused: [{ path: "flow/pipeline.yaml", reason: expect.stringContaining("holds its line twice") }] });
  });

  it("shows ours/flow and refuses stock/flow as already set when both group folders hold the line flow", () => {
    const files = [{ ...FLOW_LINE, path: "ours/flow/assembly-line.yaml" }, { ...FLOW_LINE, path: "stock/flow/assembly-line.yaml" }, { ...WORKER_AGENT, path: "ours/flow/agents/worker.md" }];

    expect(collectionView(files, [])).toMatchObject({ lines: [{ id: "flow", file: "ours/flow/assembly-line.yaml" }], refused: [{ path: "stock/flow/assembly-line.yaml", reason: "flow is already set by ours/flow/assembly-line.yaml" }] });
  });


  it("shows ours/flow/pipeline.yaml and refuses stock/flow/assembly-line.yaml as already set, hiding neither file", () => {
    const files = [{ ...FLOW_LINE, path: "ours/flow/pipeline.yaml" }, { ...FLOW_LINE, path: "stock/flow/assembly-line.yaml" }];

    expect(collectionView(files, [])).toMatchObject({ lines: [{ file: "ours/flow/pipeline.yaml" }], refused: [{ path: "stock/flow/assembly-line.yaml", reason: "flow is already set by ours/flow/pipeline.yaml" }] });
  });

  it("shows the line stock and refuses stock/flow/assembly-line.yaml below it as not in a group", () => {
    const files = [{ path: "stock/assembly-line.yaml", text: lineYaml("stock", "worker") }, { ...FLOW_LINE, path: "stock/flow/assembly-line.yaml" }];

    expect(collectionView(files, [])).toMatchObject({ lines: [{ id: "stock" }], refused: [{ path: "stock/flow/assembly-line.yaml", reason: "the folder stock holds a line, so it is not a group: move flow out of it" }] });
  });

  it("gives the agent worker the file ours/flow/agents/worker.md when ours is listed after stock", () => {
    const files = [{ ...FLOW_LINE, path: "ours/flow/assembly-line.yaml" }, { ...WORKER_AGENT, path: "ours/flow/agents/worker.md" }, { ...WORKER_AGENT, path: "stock/flow/agents/worker.md" }];

    expect(collectionView(files, [], ["stock", "ours"])).toMatchObject({ agents: [{ name: "worker", file: "ours/flow/agents/worker.md" }], refused: [] });
  });

  it("keeps a line whose id is not its folder's name, with a folder-name problem", () => {
    const files = [{ path: "other/assembly-line.yaml", text: lineYaml("flow", "worker") }, { path: "other/agents/worker.md", text: agentMarkdown("Work {ticket}.") }];

    expect(onlyLine(files)).toMatchObject({ id: "flow", file: "other/assembly-line.yaml", problems: [{ rule: "folder-name", message: "the folder other must hold the line of that name, and its line is flow" }] });
  });

  it("accepts a host key in an agent file without putting it in the settings", () => {
    const files = [FLOW_LINE, { path: "flow/agents/worker.md", text: agentMarkdown("Go.", "review_required: true\n") }];
    const { agents, refused } = collectionView(files, ["review_required"]);

    expect({ refused, settings: agents[0]?.settings }).toEqual({ refused: [], settings: { image: "acme/agent:2", timeout_minutes: 10 } });
  });

  it("refuses ../outside/assembly-line.yaml and flow/agents/../../x.md as unread paths and shows only the flow line", () => {
    const files = [...WORKER_COLLECTION, { path: "../outside/assembly-line.yaml", text: lineYaml("outside", "worker") }, { path: "flow/agents/../../x.md", text: agentMarkdown("Go.") }];
    const { lines, refused } = collectionView(files, []);

    expect({ lines: lines.map((line) => line.file), refused: refused.map((file) => file.path) }).toEqual({ lines: ["flow/assembly-line.yaml"], refused: ["../outside/assembly-line.yaml", "flow/agents/../../x.md"] });
  });

  it("counts lines, agents, refused files and problems", () => {
    const files = [...TYPO_COLLECTION, { path: "flow/notes.yaml", text: "a: 1" }];

    expect(collectionView(files, []).counts).toEqual({ lines: 1, agents: 1, refused: 1, problems: 1 });
  });

  it("answers JSON that survives a round trip unchanged", () => {
    const view = collectionView([...WORKER_COLLECTION, { path: "broken/assembly-line.yaml", text: "line: [x" }], []);

    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
