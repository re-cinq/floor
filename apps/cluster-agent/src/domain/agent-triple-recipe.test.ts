import { describe, it, expect } from "vitest";
import { buildAgentTriple, type AgentTriple } from "./agent-triple.js";
import { brief } from "./agent-triple.fixture.js";

function recipeOf({ agentDefinition }: AgentTriple): string | undefined {
  return agentDefinition.metadata?.name;
}

function stationOf({ station }: AgentTriple): string | undefined {
  return station.metadata?.name;
}

function runEnvNames({ agent }: AgentTriple): string[] | undefined {
  const env = agent.spec?.env;

  return env?.map((variable) => variable.name);
}

function recipeEnv({ agentDefinition }: AgentTriple): unknown {
  const resources = agentDefinition.spec?.resources;

  return resources?.env;
}

describe("buildAgentTriple: one recipe per settings", () => {
  it("gives visits abc-123 and def-456 of the same settings, on other repos and conversations, one recipe", () => {
    const first = buildAgentTriple(brief());
    const second = buildAgentTriple(
      brief({
        visitId: "def-456",
        tokenSecretKey: "visit-def-456-token",
        needs: [{ name: "workspace", kind: "git", path: "repo", repoUrl: "https://github.com/re-cinq/otto", ref: "main", access: "write" }],
        conversation: { mode: "continue", sessionRef: "earlier-visit" },
        produces: [{ name: "patch", kind: "file", path: "out/patch.diff" }],
      }),
    );

    expect(second.agentDefinition).toEqual(first.agentDefinition);
  });

  it("gives a visit whose prompt changed another recipe name", () => {
    const first = buildAgentTriple(brief());
    const changed = buildAgentTriple(brief({ settings: { ...brief().settings, prompt: "Review it again." } }));

    expect(recipeOf(changed)).not.toBe(recipeOf(first));
  });

  it("gives a visit whose image changed another recipe name, the Station being part of it", () => {
    const first = buildAgentTriple(brief());
    const changed = buildAgentTriple(brief({ settings: { ...brief().settings, image: "ghcr.io/re-cinq/floor-station:2.0" } }));

    expect(stationOf(changed)).not.toBe(stationOf(first));
  });

  it("labels the Agent with its Station and AgentDefinition, as the subsystem's controller would", () => {
    const { agentDefinition, agent } = buildAgentTriple(brief());
    const recipe = agentDefinition.metadata?.name;

    expect(agent.metadata?.labels).toEqual({
      "agents.re-cinq.com/station": recipe,
      "agents.re-cinq.com/agent-definition": recipe,
    });
  });

  it("marks the recipe as the floor's, so the sweep removes only what it made", () => {
    const { agentDefinition, station } = buildAgentTriple(brief());

    expect([agentDefinition.metadata?.labels, station.metadata?.labels]).toEqual([
      { "floor.re-cinq.com/recipe": "true" },
      { "floor.re-cinq.com/recipe": "true" },
    ]);
  });

  it("tells the Agent the floor's git identity for a visit that writes, leaving the recipe without it", () => {
    const workspace = { name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/re-cinq/lore", ref: "main", access: "write" as const };
    const triple = buildAgentTriple(brief({ needs: [workspace] }));

    expect({ agent: runEnvNames(triple), recipe: recipeEnv(triple) }).toEqual({
      agent: ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"],
      recipe: undefined,
    });
  });

  it("lets a GIT_AUTHOR_NAME the definition sets win over the floor's identity", () => {
    const workspace = { name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/re-cinq/lore", ref: "main", access: "write" as const };
    const triple = buildAgentTriple(
      brief({ needs: [workspace], settings: { ...brief().settings, env: { GIT_AUTHOR_NAME: "Reviewer" } } }),
    );

    expect({ agent: runEnvNames(triple), recipe: recipeEnv(triple) }).toEqual({
      agent: ["GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"],
      recipe: [{ name: "GIT_AUTHOR_NAME", value: "Reviewer" }],
    });
  });
});
