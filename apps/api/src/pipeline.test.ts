import { beforeAll, describe, expect, it } from "vitest";
import { exportPipeline, fileOf, importPipeline, migrate, pipelineOf, readPipelineFile, writePipelineFile, type Floor } from "@floor/pipeline";
import type { AgentDefinitionBody, LineBody, StationBody } from "@floor/store";
import { SERVICE_TOKEN, VISIT_TOKEN_SECRET, injectJson, setupTestServer } from "./test-server.js";
import { mintVisitToken } from "./visit-token.js";

const { server, deps, pool } = setupTestServer();

const NIGHTLY_REVIEW = `
line:
  id: nightly-review
  entry: review
  exit: done
  start:
    on: [schedule.nightly.tick]
    args: { pr_url: "{pr_url}" }
  args:
    pr_url: { kind: value, subject: true }
  files:
    checklist: |
      - read the spec
      - read the diff
  nodes:
    - { id: review, station: reviewing }
    - { id: done }
  edges:
    - { from: review, to: done, on: success }
    - { from: review, to: review, on: failed, iteration_max: 1 }
stations:
  reviewing:
    kind: agent
    agent_definition: reviewer
    outcomes: [success, failed]
    needs:
      - { name: pr_url, kind: value }
      - { name: checklist, kind: file }
    produces: []
agent_definitions:
  reviewer:
    settings:
      model: gemini-3.1-pro-preview
      image: node:22-bookworm
      timeout_minutes: 25
      prompt: |
        Review {pr_url}, by the checklist at {checklist_path}.

        Then output REVIEW_RESULT:APPROVED
      prices:
        gemini-3.1-pro-preview: { input_per_million: 2, output_per_million: 12 }
      config:
        env: { LORE_TEST_POLICY: none }
schedules:
  nightly:
    cron: 0 3 * * *
    payload: { pr_url: https://pr/1 }
`;

const REMOVAL = "archive:\n  lines: [nightly-review]\n  schedules: [nightly]\n";
const DEADLINE = new Date("2026-01-01T01:00:00Z");

let floor: Floor;

beforeAll(async () => {
  await server().start();
  floor = { url: `http://localhost:${server().info.port}`, token: SERVICE_TOKEN };
});

function imported() {
  return importPipeline(floor, pipelineOf(readPipelineFile(NIGHTLY_REVIEW)));
}

async function hashes(): Promise<string[]> {
  const { rows } = await pool().query("select kind, id, hash from definitions where kind <> 'migration' order by kind, id");

  return rows.map((row: { kind: string; id: string; hash: string }) => `${row.kind}/${row.id}@${row.hash}`);
}

describe("importPipeline", () => {
  it("puts the line, what it names, and its schedule", async () => {
    const put = await imported();

    expect(put.map((each) => `${each.kind}/${each.id}`)).toEqual(["agent-definitions/reviewer", "stations/reviewing", "assembly-lines/nightly-review", "schedules/nightly"]);
  });

  it("gives the floor an agent definition spelled as the floor spells it, its prompt whole", async () => {
    await imported();
    const reviewer = await deps().definitions.latest<AgentDefinitionBody>("agent_definition", "reviewer");

    expect(reviewer?.body.settings).toMatchObject({
      timeoutMinutes: 25,
      prompt: "Review {pr_url}, by the checklist at {checklist_path}.\n\nThen output REVIEW_RESULT:APPROVED\n",
      prices: { "gemini-3.1-pro-preview": { inputPerMillion: 2, outputPerMillion: 12 } },
      config: { env: { LORE_TEST_POLICY: "none" } },
    });
  });

  it("gives the floor a station that names its agent definition", async () => {
    await imported();
    const reviewing = await deps().definitions.latest<StationBody>("station", "reviewing");

    expect(reviewing?.body.agentDefinition).toBe("reviewer");
  });

  it("stores a file's content, and names it on the line by its hash", async () => {
    await imported();
    const line = await deps().definitions.latest<LineBody>("line", "nightly-review");
    const { checklist: hash = "" } = line!.body.files!;
    const checklist = await deps().blobs.get(hash);

    expect(checklist!.bytes.toString()).toBe("- read the spec\n- read the diff\n");
  });

  it("changes nothing when the same file is put again", async () => {
    await imported();
    const again = await imported();

    expect(again.filter((each) => each.changed)).toEqual([]);
  });

  it("is refused in the floor's own words for a line naming a station nobody has", async () => {
    const orphan = pipelineOf(readPipelineFile("line:\n  id: orphan\n  entry: work\n  exit: done\n  args: {}\n  nodes: [{ id: work, station: nobody }, { id: done }]\n  edges: [{ from: work, to: done, on: success }]\n"));

    await expect(importPipeline(floor, orphan)).rejects.toThrow(/the floor refused POST \/assembly-lines with 400/);
  });
});

describe("exportPipeline", () => {
  it("writes a pipeline back as the file it was imported from", async () => {
    await imported();
    const exported = fileOf(await exportPipeline(floor, "nightly-review"));

    expect(exported).toEqual(readPipelineFile(NIGHTLY_REVIEW));
  });

  it("is a backup: a floor that lost everything has the same versions again, from the file alone", async () => {
    await imported();
    const before = await hashes();
    const backup = writePipelineFile(fileOf(await exportPipeline(floor, "nightly-review")));

    await pool().query("truncate definitions, blobs, events");
    await importPipeline(floor, pipelineOf(readPipelineFile(backup)));

    expect(await hashes()).toEqual(before);
  });

  it("says which line the floor does not have", async () => {
    await expect(exportPipeline(floor, "nobody")).rejects.toThrow('the floor has no assembly-lines "nobody"');
  });
});

describe("migrate", () => {
  const FILES = [
    { name: "0002-remove-nightly-review.yaml", text: REMOVAL },
    { name: "0001-nightly-review.yaml", text: NIGHTLY_REVIEW },
  ];

  it("runs the files in the order of their names", async () => {
    const migrated = await migrate(floor, FILES);

    expect(migrated.map((each) => `${each.name}: ${each.ran}`)).toEqual(["0001-nightly-review.yaml: true", "0002-remove-nightly-review.yaml: true"]);
  });

  it("takes away what a later file archives", async () => {
    await migrate(floor, FILES);

    expect(await deps().definitions.latest("line", "nightly-review")).toBeNull();
  });

  it("runs each file once: a second time, none runs", async () => {
    await migrate(floor, FILES);
    const again = await migrate(floor, FILES);

    expect(again.filter((each) => each.ran)).toEqual([]);
  });

  it("runs only the file that is new", async () => {
    await migrate(floor, [FILES[1]!]);
    const next = await migrate(floor, FILES);

    expect(next.filter((each) => each.ran).map((each) => each.name)).toEqual(["0002-remove-nightly-review.yaml"]);
  });

  it("leaves what a person changed over HTTP since, as a file that ran is not run again", async () => {
    await migrate(floor, [FILES[1]!]);
    await deps().schedules.put("nightly", { cron: "0 5 * * *", payload: {} });
    await migrate(floor, [FILES[1]!]);
    const nightly = await deps().definitions.latest<{ cron: string }>("schedule", "nightly");

    expect(nightly?.body.cron).toBe("0 5 * * *");
  });

  it("refuses a file that ran and was changed since", async () => {
    await migrate(floor, [FILES[1]!]);
    const changed = { name: "0001-nightly-review.yaml", text: NIGHTLY_REVIEW.replace("0 3 * * *", "0 4 * * *") };

    await expect(migrate(floor, [changed])).rejects.toThrow('"0001-nightly-review.yaml" has run, and has been changed since');
  });

  it("does not remember a file the floor refused, so it runs when it is mended", async () => {
    const broken = { name: "0001-broken.yaml", text: "stations:\n  reviewing: { kind: nonsense }\n" };

    await migrate(floor, [broken]).catch(() => undefined);

    expect(await deps().definitions.latest("migration", "0001-broken.yaml")).toBeNull();
  });
});

describe("PUT /migrations/:name", () => {
  const SHA = "a".repeat(64);
  const OTHER = "b".repeat(64);

  function told(sha256: string, headers = { authorization: `Bearer ${SERVICE_TOKEN}` }) {
    return injectJson(server(), { method: "PUT", url: "/migrations/0001-code-review.yaml", headers, payload: { sha256 } });
  }

  it("remembers a file that ran", async () => {
    const response = await told(SHA);

    expect(response.statusCode).toBe(201);
  });

  it("answers 409 to the same name with other content", async () => {
    await told(SHA);
    const response = await told(OTHER);

    expect(response.statusCode).toBe(409);
  });

  it("stolen token: a visit's token is refused", async () => {
    const token = mintVisitToken("11111111-2222-3333-4444-555555555555", DEADLINE, VISIT_TOKEN_SECRET);
    const response = await told(SHA, { authorization: `Bearer ${token}` });

    expect(response.statusCode).toBe(403);
  });
});
