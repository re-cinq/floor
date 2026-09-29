// A line whose one station writes to the repository the run was started on, for the tests of the git credential broker.
import type { LineBody, StationBody } from "@floor/store";
import type { Deps } from "./deps.js";
import type { FloorLoop } from "./engine/loop.js";

const FIX_LINE: LineBody = {
  entry: "fix",
  exit: "done",
  args: { repo: { kind: "git" } },
  nodes: [{ id: "fix", station: "fixer" }, { id: "done" }],
  edges: [{ from: "fix", to: "done", on: "success" }],
};

const FIXER: StationBody = { kind: "agent", agentDefinition: "fixer", outcomes: ["success"], needs: [{ name: "repo", kind: "git", access: "write" }], produces: [] };

const FIXER_SETTINGS = { settings: { model: "claude-sonnet-5", prompt: "Fix it.", image: "img:1", timeoutMinutes: 20 } };

/** Starts a run on `repo`, as `github.com/owner/name`, and returns its one open visit's id. */
export async function fixDispatched(floor: { deps: Deps; loop: FloorLoop }, repo: string): Promise<string> {
  const { definitions, runs } = floor.deps;

  await Promise.all([definitions.put("line", "fix", FIX_LINE), definitions.put("station", "fixer", FIXER), definitions.put("agent_definition", "fixer", FIXER_SETTINGS)]);
  const { run } = await runs.start({ lineId: "fix", repo, startItems: { repo: { kind: "git", ref: `${repo}@main`, by: "start" } } });

  await floor.loop.pass();
  const visits = await runs.visits(run.id);

  return visits[0]!.id;
}
