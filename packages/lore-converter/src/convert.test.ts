import { describe, expect, it } from "vitest";
import { validateLine } from "@floor/store";
import type { LineBody } from "@floor/store";
import { convertLine, type Conversion } from "./convert.js";
import type { ConvertOptions } from "./nodes.js";
import { CODE_REVIEW_LINE, CODE_REVIEW_RECIPE, PLANNING_LINE, PLANNING_RECIPE, REFINE_RECIPE, REPLY_LINE } from "./convert.fixtures.js";
import { parseLine, parseRecipe } from "./lore.js";

const IMAGE: ConvertOptions = { image: "node:22-bookworm" };

function codeReview(options = IMAGE): Conversion {
  return convertLine(parseLine(CODE_REVIEW_LINE), { "code-review": parseRecipe("code-review", CODE_REVIEW_RECIPE) }, options);
}

function planning(): Conversion {
  return convertLine(parseLine(PLANNING_LINE), { "feature-planning": parseRecipe("feature-planning", PLANNING_RECIPE) }, IMAGE);
}

function reply(): Conversion {
  return convertLine(parseLine(REPLY_LINE), { "code-review-refine": parseRecipe("code-review-refine", REFINE_RECIPE) }, IMAGE);
}

function refusalsOf(converted: Conversion): string[] {
  const stations = new Set(converted.stations.map((station) => station.id));

  return validateLine(lineOf(converted), { stations });
}

function promptOf(converted: Conversion): string {
  const [definition] = converted.agentDefinitions;
  const settings = definition!.body.settings;

  return settings.prompt;
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
    expect(refusalsOf(codeReview())).toEqual([]);
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

  it("gives every agent's pod what the cluster needs it to have, beside what the recipe sets", () => {
    const [definition] = codeReview({ ...IMAGE, env: { GOOGLE_VERTEX_BASE_URL: "http://relay.test:8282" }, modelSecretKey: "GOOGLE_API_KEY" }).agentDefinitions;

    expect(definition).toMatchObject({
      body: { settings: { config: { env: { LORE_TEST_POLICY: "none", GOOGLE_VERTEX_BASE_URL: "http://relay.test:8282" }, model_secret_key: "GOOGLE_API_KEY" } } },
    });
  });

  it("states what the models cost on the agent definition, where the floor reads it", () => {
    const prices = { "gemini-3.1-pro-preview": { inputPerMillion: 2, outputPerMillion: 12 } };
    const [definition] = codeReview({ ...IMAGE, prices }).agentDefinitions;

    expect(definition).toMatchObject({ body: { settings: { prices } } });
  });

  it("keeps the prompt as lore wrote it", () => {
    expect(promptOf(codeReview())).toMatch(/^\{description\}\n\nThe PR branch[\s\S]*<one-line summary>$/);
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

  it("routes the review through that station, which has nowhere to go when it fails", () => {
    expect(lineOf(codeReview()).edges).toEqual([
      { from: "review", to: "review", on: "failed", iterationMax: 1 },
      { from: "review", to: "post-review", on: "success" },
      { from: "review", to: "post-review", on: "changes_requested" },
      { from: "post-review", to: "done", on: "success" },
    ]);
  });

  it("starts on a pull request opening, or when the router asks for it, where lore started it from code", () => {
    expect(lineOf(codeReview()).start).toMatchObject({ on: ["github.pull_request.opened", "review.full.requested"], when: { draft: false } });
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

describe("convertLine: lore's code-review-reply", () => {
  it("is a line this floor accepts, against the stations it comes with", () => {
    expect(refusalsOf(reply())).toEqual([]);
  });

  it("enters at read-review, which lore's floor did in code before the line began", () => {
    expect(lineOf(reply()).entry).toBe("read-review");
  });

  it("goes from read-review to reply, from reply to post-reply, and on to done", () => {
    expect(lineOf(reply()).edges).toEqual([
      { from: "read-review", to: "reply", on: "success" },
      { from: "reply", to: "done", on: "failed" },
      { from: "reply", to: "post-reply", on: "success" },
      { from: "reply", to: "post-reply", on: "changes_requested" },
      { from: "post-reply", to: "done", on: "success" },
    ]);
  });

  it("gives the agent what read-review wrote as its task", () => {
    expect(nodeNamed(reply(), "reply")).toEqual({ id: "reply", station: "code-review-refine", bind: { target: "repo", description: "review_feedback" } });
  });

  it("lets the agent write to the repository, though lore's recipe says it works outside it", () => {
    expect(stationNamed(reply(), "code-review-refine")?.needs).toContainEqual({ name: "target", kind: "git", path: "target", access: "write" });
  });

  it("keeps lore's prompt and tells the agent, after it, to push", () => {
    expect(promptOf(reply())).toMatch(/^\{description\}[\s\S]*let Lore post your reply\.\n\nOne thing above is different here[\s\S]*git -C \/workspace\/target push origin HEAD/);
  });

  it("is started by a review asking for changes, from a person who may write to the repository", () => {
    expect(lineOf(reply()).start).toMatchObject({ on: ["github.pull_request_review.submitted"], when: { review_state: "changes_requested", sender_type: "User", sender_trusted: true } });
  });

  it("has nothing left to say", () => {
    expect(reply().notes).toEqual([]);
  });
});
