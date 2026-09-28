import { describe, it, expect } from "vitest";
import { buildAgentTriple, type DispatchBrief } from "./agent-triple.js";

function brief(overrides: Partial<DispatchBrief> = {}): DispatchBrief {
  return {
    visitId: "abc-123",
    floorBaseUrl: "http://host.minikube.internal:8080",
    tokenSecretKey: "visit-abc-123-token",
    secretName: "agent-secrets",
    deadlineMinutes: 20,
    settings: {
      model: "claude-sonnet-4-6",
      prompt: "Review the diff on {pr_url}.",
      image: "ghcr.io/re-cinq/floor-station:1.0",
    },
    needs: [],
    produces: [],
    conversation: { mode: "new" },
    ...overrides,
  };
}

describe("buildAgentTriple", () => {
  it("names all three resources identically, after the visit", () => {
    const { agentDefinition, station, agent } = buildAgentTriple(brief());

    expect({
      agentDefinition: agentDefinition.metadata?.name,
      station: station.metadata?.name,
      agent: agent.metadata?.name,
    }).toEqual({
      agentDefinition: "floor-abc-123",
      station: "floor-abc-123",
      agent: "floor-abc-123",
    });
  });

  it("points the Agent at the Station, and the Station at the AgentDefinition", () => {
    const { station, agent } = buildAgentTriple(brief());

    expect({ stationRef: agent.spec?.stationRef, agentDefRef: station.spec?.agentDefRef }).toEqual({
      stationRef: "floor-abc-123",
      agentDefRef: "floor-abc-123",
    });
  });

  it("carries the model and the unrendered prompt template onto the AgentDefinition, never rendering it twice", () => {
    const { agentDefinition } = buildAgentTriple(brief());

    expect({ model: agentDefinition.spec?.model, prompt: agentDefinition.spec?.prompt }).toEqual({
      model: "claude-sonnet-4-6",
      prompt: "Review the diff on {pr_url}.",
    });
  });

  it("turns a git need into a repo the AgentDefinition clones, at its branch, with its token secret", () => {
    const { agentDefinition } = buildAgentTriple(
      brief({
        needs: [
          {
            name: "workspace",
            kind: "git",
            path: "repo",
            repoUrl: "https://github.com/re-cinq/lore.git",
            ref: "main",
            tokenSecret: "GH_TOKEN_abc123",
          },
        ],
      }),
    );
    const resources = agentDefinition.spec?.resources;

    expect(resources?.repos).toEqual([
      {
        name: "workspace",
        url: "https://github.com/re-cinq/lore.git",
        ref: "main",
        path: "repo",
        token_secret: "GH_TOKEN_abc123",
      },
    ]);
  });

  it("turns a file need into a file the Agent downloads before it starts", () => {
    const { agent } = buildAgentTriple(
      brief({
        needs: [
          {
            name: "spec",
            kind: "file",
            path: "spec.md",
            url: "http://host.minikube.internal:8080/blobs/44aa",
          },
        ],
      }),
    );

    expect(agent.spec?.files).toEqual([
      {
        path: "spec.md",
        url: "http://host.minikube.internal:8080/blobs/44aa",
        headers_secret: "visit-abc-123-token",
      },
    ]);
  });

  it("turns a value need into a parameter that fills the prompt's placeholder", () => {
    const { agent } = buildAgentTriple(
      brief({
        needs: [{ name: "pr_url", kind: "value", value: "https://github.com/re-cinq/lore/pull/412" }],
      }),
    );

    expect(agent.spec?.parameters).toEqual({
      pr_url: "https://github.com/re-cinq/lore/pull/412",
    });
  });

  it("watches a file produce and uploads it to the blob store", () => {
    const { agentDefinition } = buildAgentTriple(
      brief({ produces: [{ name: "patch", kind: "file", path: "out/patch.diff" }] }),
    );
    const output = agentDefinition.spec?.output;

    expect(output?.watch).toEqual([
      {
        event: "produced.patch",
        path: "out/patch.diff",
        upload: {
          url: "http://host.minikube.internal:8080/blobs",
          headers_secret: "visit-abc-123-token",
        },
      },
    ]);
  });

  it("never watches a value produce, since it is read from the agent's own result line, not a file", () => {
    const { agentDefinition } = buildAgentTriple(
      brief({ produces: [{ name: "pr_number", kind: "value" }] }),
    );
    const output = agentDefinition.spec?.output;

    expect(output?.watch).toEqual([]);
  });

  it("streams turns, cost and the result to this visit's sink, authenticated by its own token", () => {
    const { agentDefinition } = buildAgentTriple(brief());
    const output = agentDefinition.spec?.output;

    expect(output?.sinks).toEqual([
      {
        type: "http",
        url: "http://host.minikube.internal:8080/station-runs/abc-123/sink",
        headers_secret: "visit-abc-123-token",
      },
    ]);
  });

  it("names the floor as where the pod fetches the agent's settings, though the visit has no skills", () => {
    const { agentDefinition } = buildAgentTriple(brief({}));
    const resources = agentDefinition.spec?.resources;

    expect(resources?.skills_source).toBe("http://host.minikube.internal:8080/skills");
  });

  it("names the definition's own skill registry when it has one", () => {
    const { agentDefinition } = buildAgentTriple(brief({ settings: { prompt: "p", image: "i", skillsSource: "http://registry.test/skills" } }));
    const resources = agentDefinition.spec?.resources;

    expect(resources?.skills_source).toBe("http://registry.test/skills");
  });

  it("gives the agent the MCP servers the definition names, each with the secret that opens it", () => {
    const lore = { name: "lore", transport: "http" as const, url: "http://gateway.test/mcp", headersSecret: "lore-mcp-auth" };
    const { agentDefinition } = buildAgentTriple(brief({ settings: { prompt: "p", image: "i", mcpServers: [lore] } }));
    const resources = agentDefinition.spec?.resources;

    expect(resources?.mcp_servers).toEqual([{ name: "lore", transport: "http", url: "http://gateway.test/mcp", headers_secret: "lore-mcp-auth" }]);
  });

  it("lets the agent use its tools unasked, a pod having nobody to ask", () => {
    const { agentDefinition } = buildAgentTriple(brief({}));

    expect(agentDefinition.spec?.permission_mode).toBe("bypass");
  });

  it("keeps the permission mode and turn limit the definition sets", () => {
    const { agentDefinition } = buildAgentTriple(brief({ settings: { prompt: "p", image: "i", permissionMode: "auto", maxTurns: 12 } }));

    expect(agentDefinition.spec).toMatchObject({ permission_mode: "auto", max_turns: 12 });
  });

  it("omits conversation entirely on a fresh visit", () => {
    const { agentDefinition } = buildAgentTriple(brief({ conversation: { mode: "new" } }));
    const resources = agentDefinition.spec?.resources;

    expect(resources?.conversation).toBeUndefined();
  });

  it("restores the earlier visit's session and saves this one under the visit's own id", () => {
    const { agentDefinition } = buildAgentTriple(
      brief({ conversation: { mode: "continue", sessionRef: "earlier-visit" } }),
    );
    const resources = agentDefinition.spec?.resources;

    expect(resources?.conversation).toEqual({
      source: "http://host.minikube.internal:8080/conversations",
      id: "earlier-visit",
      pin: "abc-123",
      headers_secret: "visit-abc-123-token",
    });
  });

  it("saves the first round of a station that continues, with nothing to restore", () => {
    const { agentDefinition } = buildAgentTriple(brief({ conversation: { mode: "new", save: true } }));
    const resources = agentDefinition.spec?.resources;

    expect(resources?.conversation).toEqual({
      source: "http://host.minikube.internal:8080/conversations",
      id: undefined,
      pin: "abc-123",
      headers_secret: "visit-abc-123-token",
    });
  });

  it("names the model's secret so the subsystem injects it, when one is given", () => {
    const { agentDefinition } = buildAgentTriple(brief({ modelSecretKey: "ANTHROPIC_API_KEY" }));
    const resources = agentDefinition.spec?.resources;

    expect(resources?.secrets).toEqual([{ name: "ANTHROPIC_API_KEY", ref: "ANTHROPIC_API_KEY" }]);
  });

  it("names no secret when the visit carries no model secret key", () => {
    const { agentDefinition } = buildAgentTriple(brief());
    const resources = agentDefinition.spec?.resources;

    expect(resources?.secrets).toBeUndefined();
  });

  it("carries the deadline onto the Station as its wall-clock limit", () => {
    const { station } = buildAgentTriple(brief({ deadlineMinutes: 45 }));

    expect(station.spec?.deadlineMinutes).toBe(45);
  });

  it("keeps the finished Agent until the visit's abort deletes it, since a limit of 0 makes the controller run the job twice", () => {
    const { station } = buildAgentTriple(brief());

    expect({
      succeeded: station.spec?.successfulRunsHistoryLimit,
      failed: station.spec?.failedRunsHistoryLimit,
    }).toEqual({ succeeded: 1, failed: 1 });
  });

  it("carries the visit id onto the Agent as its correlation id", () => {
    const { agent } = buildAgentTriple(brief());

    expect(agent.spec?.taskId).toBe("abc-123");
  });

  it("derives targetRepo as owner/name from the git need's clone url, for operators reading the CR", () => {
    const { agent } = buildAgentTriple(
      brief({
        needs: [
          {
            name: "workspace",
            kind: "git",
            path: "repo",
            repoUrl: "https://github.com/re-cinq/lore.git",
            ref: "main",
          },
        ],
      }),
    );

    expect({ targetRepo: agent.spec?.targetRepo, branch: agent.spec?.branch }).toEqual({
      targetRepo: "re-cinq/lore",
      branch: "main",
    });
  });
});
