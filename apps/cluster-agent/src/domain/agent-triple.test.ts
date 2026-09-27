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

    expect(agentDefinition.metadata?.name).toBe("floor-abc-123");
    expect(station.metadata?.name).toBe("floor-abc-123");
    expect(agent.metadata?.name).toBe("floor-abc-123");
  });

  it("points the Agent at the Station, and the Station at the AgentDefinition", () => {
    const { station, agent } = buildAgentTriple(brief());

    expect(agent.spec?.stationRef).toBe("floor-abc-123");
    expect(station.spec?.agentDefRef).toBe("floor-abc-123");
  });

  it("carries the model and the unrendered prompt template onto the AgentDefinition, never rendering it twice", () => {
    const { agentDefinition } = buildAgentTriple(brief());

    expect(agentDefinition.spec?.model).toBe("claude-sonnet-4-6");
    expect(agentDefinition.spec?.prompt).toBe("Review the diff on {pr_url}.");
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

    expect(agentDefinition.spec?.resources?.repos).toEqual([
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
            headersSecret: "visit-abc-123-token",
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

    expect(agentDefinition.spec?.output?.watch).toEqual([
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

    expect(agentDefinition.spec?.output?.watch).toEqual([]);
  });

  it("streams turns, cost and the result to this visit's sink, authenticated by its own token", () => {
    const { agentDefinition } = buildAgentTriple(brief());

    expect(agentDefinition.spec?.output?.sinks).toEqual([
      {
        type: "http",
        url: "http://host.minikube.internal:8080/station-runs/abc-123/sink",
        headers_secret: "visit-abc-123-token",
      },
    ]);
  });

  it("omits conversation entirely on a fresh visit", () => {
    const { agentDefinition } = buildAgentTriple(brief({ conversation: { mode: "new" } }));

    expect(agentDefinition.spec?.resources?.conversation).toBeUndefined();
  });

  it("restores the previous session and pins this run's own state to continue", () => {
    const { agentDefinition } = buildAgentTriple(
      brief({ conversation: { mode: "continue", sessionRef: "sha256-deadbeef" } }),
    );

    expect(agentDefinition.spec?.resources?.conversation).toEqual({
      source: "http://host.minikube.internal:8080/api/conversations",
      id: "sha256-deadbeef",
      pin: "floor-abc-123",
      headers_secret: "visit-abc-123-token",
    });
  });

  it("names the model's secret so the subsystem injects it, only when one is given", () => {
    expect(
      buildAgentTriple(brief({ modelSecretKey: "ANTHROPIC_API_KEY" })).agentDefinition.spec
        ?.resources?.secrets,
    ).toEqual([{ name: "ANTHROPIC_API_KEY", ref: "ANTHROPIC_API_KEY" }]);
    expect(buildAgentTriple(brief()).agentDefinition.spec?.resources?.secrets).toBeUndefined();
  });

  it("carries the deadline onto the Station as its wall-clock limit", () => {
    const { station } = buildAgentTriple(brief({ deadlineMinutes: 45 }));

    expect(station.spec?.deadlineMinutes).toBe(45);
  });

  it("keeps no run history, since a triple is minted per visit and is noise the moment it reports", () => {
    const { station } = buildAgentTriple(brief());

    expect(station.spec?.successfulRunsHistoryLimit).toBe(0);
    expect(station.spec?.failedRunsHistoryLimit).toBe(0);
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

    expect(agent.spec?.targetRepo).toBe("re-cinq/lore");
    expect(agent.spec?.branch).toBe("main");
  });
});
