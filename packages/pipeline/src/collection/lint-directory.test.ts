import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { pipelineYaml } from "./collection.fixtures.js";
import { lintCollectionDirectory, printCollectionLint } from "./lint-directory.js";

const PIPELINE_YAML = pipelineYaml("acme-flow", "acme-worker");

const NEW_AGENT = "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nWork the ticket.\n";

function collectionOnDisk(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "collection-lint-"));

  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }

  return root;
}

function collected() {
  const lines: string[] = [];

  return { lines, out: (line: string) => lines.push(line) };
}

describe("lintCollectionDirectory", () => {
  it("refuses nothing in a collection with a new line folder and its new agent", async () => {
    const root = collectionOnDisk({ "acme-flow/pipeline.yaml": PIPELINE_YAML, "acme-flow/agents/acme-worker.md": NEW_AGENT });

    expect(await lintCollectionDirectory(root)).toMatchObject({ refused: [], counts: { agents: 1, pipelines: 1, extensions: 0 } });
  });

  it("reads a collection named as the directory it is run in, with a path of . and of ./", async () => {
    const root = collectionOnDisk({ "acme-flow/pipeline.yaml": PIPELINE_YAML, "acme-flow/agents/acme-worker.md": NEW_AGENT });
    const startedIn = process.cwd();

    process.chdir(root);
    const counted = await Promise.all([".", "./"].map(async (written) => (await lintCollectionDirectory(written)).counts)).finally(() => process.chdir(startedIn));

    expect(counted).toEqual([
      { agents: 1, pipelines: 1, extensions: 0 },
      { agents: 1, pipelines: 1, extensions: 0 },
    ]);
  });

  it("refuses an extension of an agent nothing ships, naming its path", async () => {
    const root = collectionOnDisk({ "triage/agents/ghost.extra.md": "Be careful." });

    const report = await lintCollectionDirectory(root);

    expect(report.refused.map((refusal) => refusal.path)).toEqual(["triage/agents/ghost.extra.md"]);
  });

  it("refuses a malformed agent file and a pipeline that is not a pipeline, keeping the good file", async () => {
    const root = collectionOnDisk({
      "acme-flow/agents/acme-worker.md": NEW_AGENT,
      "acme-flow/agents/broken.md": "no frontmatter at all",
      "other/pipeline.yaml": "not: a pipeline",
    });

    const { refused, counts } = await lintCollectionDirectory(root);

    expect({ refused: refused.map((refusal) => refusal.path).sort(), agents: counts.agents }).toEqual({
      refused: ["acme-flow/agents/broken.md", "other/pipeline.yaml"],
      agents: 1,
    });
  });

  it("ignores files of the repository that are not collection files", async () => {
    const root = collectionOnDisk({
      "README.md": "# acme collection",
      ".github/workflows/lint.yml": "name: lint",
      "acme-flow/agents/acme-worker.md": NEW_AGENT,
    });

    expect((await lintCollectionDirectory(root)).refused).toEqual([]);
  });

  it("fills an environment variable an agent names, since the install's environment is not the linter's", async () => {
    const root = collectionOnDisk({ "acme-flow/agents/acme-worker.md": "---\nimage: ${ACME_AGENT_IMAGE}\ntimeout_minutes: 10\n---\nWork.\n" });

    expect((await lintCollectionDirectory(root)).refused).toEqual([]);
  });

  it("refuses a misspelt file name with the path a collection reads", async () => {
    const root = collectionOnDisk({ "acme-flow/pipeline.yml": PIPELINE_YAML });

    expect((await lintCollectionDirectory(root)).refused).toEqual([
      {
        path: "acme-flow/pipeline.yml",
        reason: "a collection does not read this path: a line folder holds pipeline.yaml, agents/<agent>.md and agents/<agent>.extra.md",
      },
    ]);
  });

  it("accepts a host key in an agent file when it is named, and refuses it when it is not", async () => {
    const root = collectionOnDisk({ "acme-flow/agents/acme-worker.md": "---\nimage: acme/agent:2\ntimeout_minutes: 10\nexecution_mode: station\n---\nWork.\n" });

    expect({
      named: (await lintCollectionDirectory(root, ["execution_mode"])).refused,
      unnamed: (await lintCollectionDirectory(root)).refused.map((refusal) => refusal.path),
    }).toEqual({ named: [], unnamed: ["acme-flow/agents/acme-worker.md"] });
  });
});

describe("printCollectionLint", () => {
  it("prints each refused file with its reason and exits 1", async () => {
    const root = collectionOnDisk({ "triage/agents/ghost.extra.md": "Be careful." });
    const { lines, out } = collected();

    const code = await printCollectionLint(root, [], out);

    expect({ code, lines }).toEqual({
      code: 1,
      lines: ["triage/agents/ghost.extra.md: an extension needs a shipped agent, and nothing ships ghost"],
    });
  });

  it("prints what the collection supplies and exits 0 when nothing is refused", async () => {
    const root = collectionOnDisk({ "acme-flow/pipeline.yaml": PIPELINE_YAML, "acme-flow/agents/acme-worker.md": NEW_AGENT });
    const { lines, out } = collected();

    const code = await printCollectionLint(root, [], out);

    expect({ code, lines }).toEqual({ code: 0, lines: ["collection ok: 1 agents, 1 pipelines, 0 extensions"] });
  });

  it("exits 0 for an agent file with the host key execution_mode when the key is named", async () => {
    const root = collectionOnDisk({ "acme-flow/agents/acme-worker.md": "---\nimage: acme/agent:2\ntimeout_minutes: 10\nexecution_mode: station\n---\nWork.\n" });
    const { lines, out } = collected();

    const code = await printCollectionLint(root, ["execution_mode"], out);

    expect({ code, lines }).toEqual({ code: 0, lines: ["collection ok: 1 agents, 0 pipelines, 0 extensions"] });
  });
});
