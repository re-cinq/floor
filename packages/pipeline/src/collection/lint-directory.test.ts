import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { pipelineYaml } from "./collection.fixtures.js";
import { lintCollectionDirectory, lintCommand, printCollectionLint, shippedCatalogIn } from "./lint-directory.js";

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
        reason: "a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md",
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

describe("shippedCatalogIn", () => {
  it("names the line folders and the agents of a directory laid out as a collection", async () => {
    const root = collectionOnDisk({ "code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"), "code-review/agents/reviewer.md": NEW_AGENT });

    const catalog = await shippedCatalogIn(root);

    expect({ pipelines: catalog.pipelines, agents: [...catalog.agents.keys()] }).toEqual({ pipelines: ["code-review"], agents: ["reviewer"] });
  });

  it("refuses a directory whose agent file is malformed, naming the file", async () => {
    const root = collectionOnDisk({ "code-review/agents/reviewer.md": "no frontmatter" });

    await expect(shippedCatalogIn(root)).rejects.toThrow(/code-review\/agents\/reviewer\.md/);
  });
});

describe("lintCollectionDirectory with a shipped catalog", () => {
  const SHIPPED_ROOT_FILES = { "code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"), "code-review/agents/reviewer.md": NEW_AGENT };

  it("refuses nothing for an extension of an agent the shipped directory defines", async () => {
    const shipped = await shippedCatalogIn(collectionOnDisk(SHIPPED_ROOT_FILES));
    const root = collectionOnDisk({ "code-review/agents/reviewer.extra.md": "Be careful." });

    expect(await lintCollectionDirectory(root, [], shipped)).toMatchObject({ refused: [], counts: { agents: 1, pipelines: 0, extensions: 1 } });
  });

  it("refuses nothing for a pipeline naming a shipped agent it does not define", async () => {
    const shipped = await shippedCatalogIn(collectionOnDisk(SHIPPED_ROOT_FILES));
    const root = collectionOnDisk({ "acme-flow/assembly-line.yaml": pipelineYaml("acme-flow", "reviewer") });

    expect(await lintCollectionDirectory(root, [], shipped)).toMatchObject({ refused: [], counts: { agents: 0, pipelines: 1, extensions: 0 } });
  });

  it("refuses the extension and the pipeline when nothing is shipped", async () => {
    const root = collectionOnDisk({ "code-review/agents/reviewer.extra.md": "Be careful.", "acme-flow/assembly-line.yaml": pipelineYaml("acme-flow", "reviewer") });

    const { refused } = await lintCollectionDirectory(root);

    expect(refused.map(({ path }) => path)).toEqual(["acme-flow/assembly-line.yaml", "code-review/agents/reviewer.extra.md"]);
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

describe("lintCommand", () => {
  const USAGE = "floor-pipeline lint <dir>";

  function outputs() {
    const out: string[] = [];
    const err: string[] = [];

    return { out, err, writers: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) } };
  }

  it("prints the usage to the error output and exits 2 when no directory is given", async () => {
    const { out, err, writers } = outputs();

    const code = await lintCommand({ hostKeys: [] }, USAGE, writers);

    expect({ code, out, err }).toEqual({ code: 2, out: [], err: [USAGE] });
  });

  it("exits 0 for an extension of an agent the --shipped directory defines", async () => {
    const shippedDirectory = collectionOnDisk({ "code-review/agents/reviewer.md": NEW_AGENT });
    const directory = collectionOnDisk({ "code-review/agents/reviewer.extra.md": "Be careful." });
    const { out, err, writers } = outputs();

    const code = await lintCommand({ directory, hostKeys: [], shippedDirectory }, USAGE, writers);

    expect({ code, out, err }).toEqual({ code: 0, out: ["collection ok: 1 agents, 0 pipelines, 1 extensions"], err: [] });
  });

  it("exits 1 for the same extension when no --shipped directory is given", async () => {
    const directory = collectionOnDisk({ "code-review/agents/reviewer.extra.md": "Be careful." });
    const { out, writers } = outputs();

    const code = await lintCommand({ directory, hostKeys: [] }, USAGE, writers);

    expect({ code, out }).toEqual({ code: 1, out: ["code-review/agents/reviewer.extra.md: an extension needs a shipped agent, and nothing ships reviewer"] });
  });

  it("reads a host key in the --shipped directory when it is named", async () => {
    const shippedDirectory = collectionOnDisk({ "code-review/agents/reviewer.md": "---\nimage: acme/agent:2\ntimeout_minutes: 10\nexecution_mode: station\n---\nWork.\n" });
    const directory = collectionOnDisk({ "code-review/agents/reviewer.extra.md": "Be careful." });
    const { out, writers } = outputs();

    const code = await lintCommand({ directory, hostKeys: ["execution_mode"], shippedDirectory }, USAGE, writers);

    expect({ code, out }).toEqual({ code: 0, out: ["collection ok: 1 agents, 0 pipelines, 1 extensions"] });
  });
});
