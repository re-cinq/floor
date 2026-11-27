// A visit whose agent definition asks for a gateway token, for the suites of a floor that can sign one and of a floor that cannot.
import type { LineBody, StationBody } from "@floor/store";
import type { Deps } from "./deps.js";
import type { FloorLoop } from "./engine/loop.js";

const ASK_LINE: LineBody = {
  entry: "ask",
  exit: "done",
  args: {},
  nodes: [{ id: "ask", station: "ask" }, { id: "done" }],
  edges: [{ from: "ask", to: "done", on: "success" }],
};

const ASK_STATION: StationBody = { kind: "agent", agentDefinition: "asker", outcomes: ["success"], needs: [], produces: [] };

/** Asks the floor for a token: audience `search`, two scopes. */
export const SEARCH_MCP = { name: "search", transport: "http", url: "http://search.test/mcp", visit_token: { audience: "search", scopes: ["context:read", "memory:write"] } };

/** Brings its own header, kept in a secret. */
export const FILES_MCP = { name: "files", transport: "http", url: "http://files.test/mcp", headers_secret: "files-auth" };

/** A run on `repo` with one agent visit dispatched, its definition naming these MCP servers. */
export async function askDispatched(floor: { deps: Deps; loop: FloorLoop }, repo: string, mcpServers: unknown[] = [SEARCH_MCP, FILES_MCP]): Promise<{ runId: string; visitId: string }> {
  const { definitions, runs } = floor.deps;

  await definitions.put("line", "ask", ASK_LINE);
  await definitions.put("station", "ask", ASK_STATION);
  await definitions.put("agent_definition", "asker", { settings: { prompt: "Ask.", image: "img:1", timeoutMinutes: 20, config: { mcp_servers: mcpServers } } });
  const { run } = await runs.start({ lineId: "ask", repo, startItems: {} });

  await floor.loop.pass();
  const visits = await runs.visits(run.id);

  return { runId: run.id, visitId: visits.find((visit) => !visit.report)!.id };
}
