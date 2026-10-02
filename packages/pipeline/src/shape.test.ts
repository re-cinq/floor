import { describe, expect, it } from "vitest";
import { readPipelineFile, writePipelineFile } from "./file.js";
import { fileOf, pipelineOf } from "./shape.js";

const CODE_REVIEW = `
line:
  id: code-review
  entry: review
  exit: done
  args:
    pr_url: { kind: value, subject: true }
  files:
    checklist: |
      - read the spec
      - read the diff
  nodes:
    - { id: review, station: code-review }
    - { id: done }
  edges:
    - { from: review, to: done, on: success }
    - { from: review, to: review, on: failed, iteration_max: 1 }
stations:
  code-review:
    kind: agent
    agent_definition: reviewer
    conversation_key: pr_url
    outcomes: [success, failed]
    needs: [{ name: pr_url, kind: value }]
    produces: []
agent_definitions:
  reviewer:
    settings:
      model: gemini-3.1-pro-preview
      image: node:22-bookworm
      timeout_minutes: 25
      prompt: |
        Review {pr_url}.

        Then output REVIEW_RESULT:APPROVED
      prices:
        gemini-3.1-pro-preview: { input_per_million: 2, output_per_million: 12, cache_read_per_million: 0.2 }
      config:
        skills_source: http://gateway.test/skills
        env: { LORE_TEST_POLICY: none }
    variants:
      github.com/re-cinq/lore:
        timeout_minutes: 40
schedules:
  nightly:
    cron: "0 3 * * *"
    payload: { pr_url: https://pr/1 }
`;

function codeReview() {
  return pipelineOf(readPipelineFile(CODE_REVIEW));
}

function lineOf() {
  const { line } = codeReview();

  return line!.body;
}

function reviewerOf() {
  const [reviewer] = codeReview().agentDefinitions;

  return reviewer!.body;
}

describe("pipelineOf", () => {
  it("spells an edge's budget as the floor does", () => {
    expect(lineOf().edges).toContainEqual({ from: "review", to: "review", on: "failed", iterationMax: 1 });
  });

  it("spells a station's fields as the floor does", () => {
    expect(codeReview().stations).toMatchObject([{ id: "code-review", body: { agentDefinition: "reviewer", conversationKey: "pr_url" } }]);
  });

  it("spells an agent's timeout and its prices as the floor does", () => {
    expect(reviewerOf().settings).toMatchObject({
      timeoutMinutes: 25,
      prices: { "gemini-3.1-pro-preview": { inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2 } },
    });
  });

  it("leaves the names a person chose as they are: a key of config, and of env", () => {
    expect(reviewerOf().settings).toMatchObject({ config: { skills_source: "http://gateway.test/skills", env: { LORE_TEST_POLICY: "none" } } });
  });

  it("spells a repository's variant as the floor does, under the repository's own name", () => {
    expect(reviewerOf().variants).toEqual({ "github.com/re-cinq/lore": { timeoutMinutes: 40 } });
  });

  it("keeps a prompt's line breaks", () => {
    expect(reviewerOf().settings).toMatchObject({ prompt: "Review {pr_url}.\n\nThen output REVIEW_RESULT:APPROVED\n" });
  });

  it("takes a file's content out of the line, as bytes", () => {
    const { checklist } = codeReview().files;

    expect(String(checklist)).toBe("- read the spec\n- read the diff\n");
  });

  it("leaves the line without its files, which the floor keeps by their hash", () => {
    expect(lineOf()).not.toHaveProperty("files");
  });

  it("reads a file that is no text from its base64", () => {
    const pipeline = pipelineOf(readPipelineFile("line:\n  id: icons\n  files:\n    logo: { base64: /9j/4A== }\n"));

    expect(pipeline.files.logo).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  });

  it("reads what a file takes away", () => {
    const pipeline = pipelineOf(readPipelineFile("archive:\n  lines: [gap-fill]\n  agent_definitions: [gap-filler]\n"));

    expect(pipeline.archive).toEqual({ lines: ["gap-fill"], stations: [], agentDefinitions: ["gap-filler"], schedules: [] });
  });
});

describe("fileOf", () => {
  it("writes a pipeline back as the file it was read from", () => {
    expect(fileOf(codeReview())).toEqual(readPipelineFile(CODE_REVIEW));
  });

  it("writes a file that is no text as base64", () => {
    const written = fileOf({ ...codeReview(), files: { logo: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) } });

    expect(written.line?.files).toEqual({ logo: { base64: "/9j/4A==" } });
  });

  it("writes a line's fields in the order a person reads them, whatever order the floor gave them in", () => {
    const { line } = codeReview();
    const alphabetical = Object.fromEntries(Object.entries(line!.body).sort());
    const written = fileOf({ ...codeReview(), line: { id: "code-review", body: alphabetical } });

    expect(Object.keys(written.line!)).toEqual(["id", "entry", "exit", "args", "files", "nodes", "edges"]);
  });

  it("writes a line's fail right after its exit, whatever order the floor gave the fields in", () => {
    const { line } = codeReview();
    const alphabetical = Object.fromEntries(Object.entries({ ...line!.body, fail: "abandon" }).sort());
    const written = fileOf({ ...codeReview(), line: { id: "code-review", body: alphabetical } });

    expect(Object.keys(written.line!)).toEqual(["id", "entry", "exit", "fail", "args", "files", "nodes", "edges"]);
  });

  it("writes an agent's prompt last, after the model it is for", () => {
    const written = fileOf(codeReview());
    const { reviewer } = written.agent_definitions!;

    expect(Object.keys(reviewer!.settings as object)).toEqual(["model", "image", "timeout_minutes", "prices", "config", "prompt"]);
  });

  it("leaves out what a pipeline does not have", () => {
    const { line } = codeReview();

    expect(Object.keys(fileOf({ line, files: {}, stations: [], agentDefinitions: [], schedules: [], archive: { lines: [], stations: [], agentDefinitions: [], schedules: [] } }))).toEqual(["line"]);
  });
});

describe("writePipelineFile", () => {
  it("writes a prompt as the block it is, its lines unfolded", () => {
    const long = `Review the pull request with care, and say what a reader of this code a year from now would wish had been said today.\nThen stop.\n`;
    const written = writePipelineFile({ agent_definitions: { reviewer: { settings: { prompt: long } } } });

    expect(written).toContain("prompt: |\n        Review the pull request with care, and say what a reader of this code a year from now would wish had been said today.\n        Then stop.\n");
  });
});

describe("readPipelineFile", () => {
  it("refuses a file with a part it does not know, by name", () => {
    expect(() => readPipelineFile("pipelines: {}\n")).toThrow(/not a pipeline file: .*pipelines/);
  });

  it("refuses a line with no id", () => {
    expect(() => readPipelineFile("line:\n  entry: review\n")).toThrow(/not a pipeline file: line.id/);
  });
});
