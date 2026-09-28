import { describe, expect, it } from "vitest";
import { validateLine } from "@floor/store";
import type { LineBody } from "@floor/store";
import { convertLine, type Conversion } from "./convert.js";
import type { ConvertOptions } from "./nodes.js";
import { CODE_REVIEW_LINE, CODE_REVIEW_RECIPE, PLANNING_LINE, PLANNING_RECIPE } from "./convert.fixtures.js";
import { parseLine, parseRecipe } from "./lore.js";

const IMAGE: ConvertOptions = { image: "node:22-bookworm" };

function codeReview(options = IMAGE): Conversion {
  return convertLine(parseLine(CODE_REVIEW_LINE), { "code-review": parseRecipe("code-review", CODE_REVIEW_RECIPE) }, options);
}

function planning(): Conversion {
  return convertLine(parseLine(PLANNING_LINE), { "feature-planning": parseRecipe("feature-planning", PLANNING_RECIPE) }, IMAGE);
}

function stationNamed(conversion: Conversion, id: string) {
  const found = conversion.stations.find((station) => station.id === id);

  return found?.body;
}

function lineOf(conversion: Conversion): LineBody {
  const line = conversion.line;

  return line.body;
}

function nodeNamed(conversion: Conversion, id: string) {
  return lineOf(conversion).nodes.find((node) => node.id === id);
}

describe("convertLine: lore's code-review", () => {
  it("is a line this floor accepts, against the stations it comes with", () => {
    const converted = codeReview();
    const stations = new Set(converted.stations.map((station) => station.id));

    expect(validateLine(lineOf(converted), { stations })).toEqual([]);
  });

  it("turns the terminal retrospective into a marker", () => {
    expect(nodeNamed(codeReview(), "done")).toEqual({ id: "done" });
  });

  it("gives the agent the repo where lore's prompts look for it", () => {
    expect(nodeNamed(codeReview(), "review")).toEqual({ id: "review", station: "code-review", bind: { target: "repo" } });
  });

  it("reads the agent's settings from the recipe's front matter", () => {
    const [definition] = codeReview().agentDefinitions;

    expect(definition).toMatchObject({
      id: "code-review",
      body: { settings: { model: "gemini-3.1-pro-preview", image: "node:22-bookworm", timeoutMinutes: 25, config: { disallowed_tools: ["Bash(npm:*)", "Bash(sh:*)"], env: { LORE_TEST_POLICY: "none" } } } },
    });
  });

  it("keeps the prompt as lore wrote it", () => {
    const [definition] = codeReview().agentDefinitions;
    const settings = definition!.body.settings;

    expect(settings.prompt).toMatch(/^\{description\}\n\nThe PR branch[\s\S]*<one-line summary>$/);
  });

  it("clones read-only for a recipe that does not work in the repo", () => {
    const needs = stationNamed(codeReview(), "code-review")!.needs;

    expect(needs[0]).toEqual({ name: "target", kind: "git", path: "target", access: "read" });
  });

  it("needs a value for each name the prompt asks for, and none for what the floor fills", () => {
    const needs = stationNamed(codeReview(), "code-review")!.needs;

    expect(needs.slice(1)).toEqual([{ name: "description", kind: "value" }]);
  });

  it("hands on what the agent said, since lore's prompts answer in their output", () => {
    expect(stationNamed(codeReview(), "code-review")!.produces).toEqual([{ name: "review_output", kind: "file", from: "output" }]);
  });

  it("puts a station where lore's floor posted the review from a hook", () => {
    expect(nodeNamed(codeReview(), "post-review")).toEqual({ id: "post-review", station: "post-review", bind: { review_output: "review_output" } });
  });

  it("routes the review through that station, and keeps the retry with its budget", () => {
    expect(lineOf(codeReview()).edges).toEqual([
      { from: "review", to: "review", on: "failed", iterationMax: 1 },
      { from: "review", to: "post-review", on: "success" },
      { from: "review", to: "post-review", on: "changes_requested" },
      { from: "post-review", to: "done", on: "always" },
    ]);
  });

  it("starts on a pull request opening, where lore started it from code", () => {
    expect(lineOf(codeReview()).start).toMatchObject({ on: ["github.pull_request.opened", "github.pull_request.synchronize"], when: { draft: false } });
  });

  it("names the definition after its model when the cluster runs another", () => {
    const converted = codeReview({ ...IMAGE, model: "claude-sonnet-4-6" });

    expect(converted.agentDefinitions.map((definition) => definition.id)).toEqual(["code-review--claude-sonnet-4-6"]);
  });

  it("has nothing left for a person to decide", () => {
    expect(codeReview().notes).toEqual([]);
  });
});

describe("convertLine: what lore's planning line uses", () => {
  it("continues a conversation by the bag item lore's key names", () => {
    expect(stationNamed(planning(), "feature-planning")).toMatchObject({ conversation: "continue", conversationKey: "plan_id" });
  });

  it("makes a person's station of a review node, its route naming needs", () => {
    expect(stationNamed(planning(), "feature_review")).toEqual({
      kind: "human",
      route: "/repos/{repo}/plans/{plan_id}",
      outcomes: ["success", "changes_requested", "failed"],
      needs: [{ name: "repo", kind: "value" }, { name: "plan_id", kind: "value" }],
      produces: [],
    });
  });

  it("makes a service station of a job lore ran itself", () => {
    expect(nodeNamed(planning(), "issues")).toEqual({ id: "issues", station: "issues" });
  });

  it("says what it could not read, for each thing", () => {
    expect(planning().notes).toEqual([
      'node "validate": recipe "missing-recipe" was not found, so the node is a marker',
      'node "issues": service station "issues" has no needs or produces yet; what lore\'s job read and wrote is in its code, not in the line',
      'line "feature-planning": nothing is known of what starts it or what lore\'s floor did around it; it has the default arguments and no start event',
    ]);
  });
});

describe("parseRecipe", () => {
  it("takes a recipe with no front matter as all prompt", () => {
    expect(parseRecipe("plain", "Just do it.\n")).toEqual({ name: "plain", settings: {}, prompt: "Just do it." });
  });
});
