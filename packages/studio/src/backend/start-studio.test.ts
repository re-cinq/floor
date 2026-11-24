import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../protocol.js";
import { textVersion } from "./agent-file-text.js";
import { agentMarkdown, lineYaml, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { collectionOnDisk, openClient, refusalStatus } from "./studio.fixtures.js";
import { startStudio, type Studio } from "./start-studio.js";

const PAGE = "http://127.0.0.1:4173";
const running: Studio[] = [];

async function started(origins: string[] = []): Promise<Studio> {
  const studio = await startStudio({ dir: collectionOnDisk(WORKER_COLLECTION), port: 0, hostKeys: [], origins });

  running.push(studio);

  return studio;
}

const EXTRA_TEXT = "Also check the tests.\n";

async function connectedTo(files: typeof WORKER_COLLECTION) {
  const dir = collectionOnDisk(files);
  const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [] });

  running.push(studio);

  return { dir, client: await openClient(studio.url, { token: studio.token }) };
}

const connectedToWorkerCollection = () => connectedTo(WORKER_COLLECTION);
const connectedToExtraCollection = () => connectedTo([WORKER_COLLECTION[0], { path: "flow/agents/worker.extra.md", text: EXTRA_TEXT }]);

afterEach(async () => {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
});

describe("startStudio", () => {
  it("reports a ws url on 127.0.0.1 with the real port, and a token of at least 128 bits in hex", async () => {
    const { url, token } = await started();

    expect({ url: url.replace(/:\d+$/, ":PORT"), port: Number(url.split(":").pop()) > 0, token: /^[0-9a-f]{32,}$/.test(token) }).toEqual({ url: "ws://127.0.0.1:PORT", port: true, token: true });
  });

  it("sends the hello frame with the protocol version when a socket opens", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    expect(await client.next()).toEqual({ type: "hello", version: PROTOCOL_VERSION });
  });

  it("answers collection.read with the view of the collection, under the request's id", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    client.send({ id: "r1", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ id: "r1", result: { counts: { lines: 1, agents: 1, refused: 0, problems: 0 }, lines: [{ id: "flow" }] } });
  });

  it("answers collection.read with environment LORE_AGENT_IMAGE used by flow/agents/worker.md, when its image is ${LORE_AGENT_IMAGE}", async () => {
    const workerText = "---\nimage: ${LORE_AGENT_IMAGE}\ntimeout_minutes: 10\n---\nWork {ticket}.\n";
    const { client } = await connectedTo([WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: workerText }]);

    client.send({ id: "r1", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ result: { environment: [{ name: "LORE_AGENT_IMAGE", files: ["flow/agents/worker.md"] }] } });
  });

  it("names the collection's folder in the view it answers with", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    client.send({ id: "r1", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ result: { folder: basename(dir) } });
  });

  it("answers collection.read with skills api-design and tdd-start, sorted, when skills/ holds tdd-start.md and api-design.md", async () => {
    const { client } = await connectedTo([...WORKER_COLLECTION, { path: "skills/tdd-start.md", text: "Start with a test.\n" }, { path: "skills/api-design.md", text: "Design the API.\n" }]);

    client.send({ id: "r1", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ result: { skills: ["api-design", "tdd-start"] } });
  });

  it("answers collection.read with skills lore-context and tdd-start, sorted, when agent-skills/skills/lore-context/SKILL.md joins skills/tdd-start.md", async () => {
    const { client } = await connectedTo([...WORKER_COLLECTION, { path: "skills/tdd-start.md", text: "Start with a test.\n" }, { path: "agent-skills/skills/lore-context/SKILL.md", text: "Read the context.\n" }]);

    client.send({ id: "r1", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ result: { skills: ["lore-context", "tdd-start"] } });
  });

  it("answers collection.read with no refused files when skills/tdd-start.md and agent-skills/skills/lore-context/SKILL.md are the extras", async () => {
    const skillFiles = [{ path: "skills/tdd-start.md", text: "Start with a test.\n" }, { path: "agent-skills/skills/lore-context/SKILL.md", text: "Read the context.\n" }];
    const { client } = await connectedTo(WORKER_COLLECTION.concat(skillFiles));

    client.send({ id: "refusals", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ result: { refused: [], counts: { refused: 0 } } });
  });

  it("refuses with 401 a socket that carries no token", async () => {
    const { url } = await started();

    expect(await refusalStatus(url, {})).toBe(401);
  });

  it("refuses with 401 a socket whose token is wrong", async () => {
    const { url } = await started();

    expect(await refusalStatus(url, { token: "0".repeat(32) })).toBe(401);
  });

  it("refuses with 403 a socket from a foreign origin, the token right", async () => {
    const { url, token } = await started([PAGE]);

    expect(await refusalStatus(url, { token, origin: "https://evil.example" })).toBe(403);
  });

  it("accepts a socket from an allowed origin with the token", async () => {
    const { url, token } = await started([PAGE]);
    const client = await openClient(url, { token, origin: PAGE });

    expect(await client.next()).toMatchObject({ type: "hello" });
  });

  it("refuses a malformed frame with the reason and keeps the socket open for the next request", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    client.socket.send("{broken");
    client.send({ id: "r2", type: "collection.read" });

    expect([await client.nextOfType("refused"), (await client.nextOfType("result")).id]).toEqual([{ type: "refused", reason: "the frame is not JSON" }, "r2"]);
  });

  it("refuses a request of an unknown type with its id", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    client.send({ id: "r3", type: "run.start" });

    expect(await client.nextOfType("refused")).toMatchObject({ id: "r3", reason: expect.stringContaining('unknown request type "run.start"') });
  });

  it("closes the socket with code 1009 when a frame is 4 MiB plus one byte", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });
    const closeCode = new Promise((resolve) => client.socket.once("close", resolve));

    client.socket.send("a".repeat(4 * 1024 * 1024 + 1));

    await expect(closeCode).resolves.toBe(1009);
  });

  it("closes every open socket when it is closed", async () => {
    const studio = await started();
    const client = await openClient(studio.url, { token: studio.token });
    const closed = new Promise((resolve) => client.socket.once("close", resolve));

    await studio.close();

    await expect(closed).resolves.toBeDefined();
  });

  it("answers agent.write with a result and rewrites the agent's prompt under its frontmatter", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "w1", type: "agent.write", line: "flow", agent: "worker", prompt: "Work on {ticket} carefully.\n", version: textVersion(agentMarkdown("Work {ticket}.")) });
    const answer = await client.next();

    expect({ answer: answer.type, file: readFileSync(join(dir, "flow/agents/worker.md"), "utf8") }).toEqual({ answer: "result", file: agentMarkdown("Work on {ticket} carefully.") });
  });

  it.each([
    { sent: "Also check the docs.\n", case: "rewrites worker.extra.md to the sent text" },
    { sent: "Also check the docs.", case: "ends worker.extra.md in one newline when the sent text has none" },
  ])("answers extra.write with a result and $case", async ({ sent }) => {
    const { dir, client } = await connectedToExtraCollection();

    await client.next();
    client.send({ id: "x1", type: "extra.write", line: "flow", agent: "worker", text: sent, version: textVersion(EXTRA_TEXT) });
    const answer = await client.next();

    expect({ answer: answer.type, file: readFileSync(join(dir, "flow/agents/worker.extra.md"), "utf8") }).toEqual({ answer: "result", file: "Also check the docs.\n" });
  });

  it("refuses extra.write as changed on disk and keeps worker.extra.md when the version is stale", async () => {
    const { dir, client } = await connectedToExtraCollection();

    await client.next();
    client.send({ id: "x2", type: "extra.write", line: "flow", agent: "worker", text: "Also check the docs.\n", version: "not-the-version" });
    const answer = await client.next();

    expect({ answer, file: readFileSync(join(dir, "flow/agents/worker.extra.md"), "utf8") }).toMatchObject({
      answer: { type: "refused", reason: expect.stringMatching(/changed on disk/) },
      file: "Also check the tests.\n",
    });
  });

  it("refuses extra.write and writes nothing when the agent is the path ../../outside", async () => {
    const { dir, client } = await connectedToExtraCollection();

    await client.next();
    client.send({ id: "x3", type: "extra.write", line: "flow", agent: "../../outside", text: "x\n", version: "v" });
    const answer = await client.next();

    expect({ answer, outside: existsSync(join(dir, "..", "outside.extra.md")), file: readFileSync(join(dir, "flow/agents/worker.extra.md"), "utf8") }).toMatchObject({
      answer: { type: "refused", reason: expect.stringMatching(/has no extra file/) },
      outside: false,
      file: EXTRA_TEXT,
    });
  });

  it("answers agent.write with a result and rewrites the frontmatter to image acme/agent:3 when settings carry it", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    await client.next();
    client.send({
      id: "w4",
      type: "agent.write",
      line: "flow",
      agent: "worker",
      prompt: "Work {ticket}.\n",
      settings: { image: "acme/agent:3", timeout_minutes: 10 },
      version: textVersion(agentMarkdown("Work {ticket}.")),
    });
    const answer = await client.next();

    expect({ answer: answer.type, file: readFileSync(join(dir, "flow/agents/worker.md"), "utf8") }).toEqual({
      answer: "result",
      file: "---\nimage: acme/agent:3\ntimeout_minutes: 10\n---\nWork {ticket}.\n",
    });
  });

  it("refuses agent.write as changed and leaves the file untouched when version is not the file's current hash", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "w2", type: "agent.write", line: "flow", agent: "worker", prompt: "New.\n", version: "not-the-version" });
    const answer = await client.next();

    expect({ answer, file: readFileSync(join(dir, "flow/agents/worker.md"), "utf8") }).toMatchObject({
      answer: { type: "refused", reason: expect.stringMatching(/changed/) },
      file: agentMarkdown("Work {ticket}."),
    });
  });

  it("refuses agent.write mentioning version and leaves the file untouched when version is missing", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "w3", type: "agent.write", line: "flow", agent: "worker", prompt: "New.\n" });
    const answer = await client.next();

    expect({ answer, file: readFileSync(join(dir, "flow/agents/worker.md"), "utf8") }).toMatchObject({
      answer: { type: "refused", reason: expect.stringMatching(/version/) },
      file: agentMarkdown("Work {ticket}."),
    });
  });

  it("refuses agent.write as having no agent and writes nothing when the agent is the path-like ../../outside", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "w5", type: "agent.write", line: "flow", agent: "../../outside", prompt: "x\n", version: "v" });
    const answer = await client.next();

    expect({ answer, outside: existsSync(join(dir, "..", "outside.md")), file: readFileSync(join(dir, "flow/agents/worker.md"), "utf8") }).toMatchObject({
      answer: { type: "refused", reason: expect.stringMatching(/has no agent/) },
      outside: false,
      file: agentMarkdown("Work {ticket}."),
    });
  });

  it("refuses agent.write naming timeout_minutes and leaves the file untouched when timeout_minutes is the string \"30\"", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    await client.next();
    client.send({
      id: "w6",
      type: "agent.write",
      line: "flow",
      agent: "worker",
      prompt: "Work {ticket}.\n",
      settings: { image: "acme/agent:2", timeout_minutes: "30" },
      version: textVersion(agentMarkdown("Work {ticket}.")),
    });
    const answer = await client.next();

    expect({ answer, file: readFileSync(join(dir, "flow/agents/worker.md"), "utf8") }).toMatchObject({
      answer: { type: "refused", reason: expect.stringMatching(/timeout_minutes/) },
      file: agentMarkdown("Work {ticket}."),
    });
  });

  it("answers fixture.read with the needs ticket ENG-1 that fixture.write saved for flow/work", async () => {
    const { client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "f1", type: "fixture.write", line: "flow", node: "work", needs: { ticket: "ENG-1" } });
    await client.next();
    client.send({ id: "f2", type: "fixture.read", line: "flow", node: "work" });
    const answer = await client.next();

    expect(answer).toMatchObject({ type: "result", result: { needs: { ticket: "ENG-1" } } });
  });

  it("answers run.preview with the prompt Work ENG-1. and no blockers for flow/work with ticket ENG-1", async () => {
    const { client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "p1", type: "run.preview", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder: "/tmp/run-1", permission: "acceptEdits" });
    const answer = await client.next();

    expect(answer).toMatchObject({ type: "result", result: { prompt: "Work ENG-1.", blockers: [] } });
  });

  it('answers run.preview with the blocker "plan": /no/such/plan.md is not on disk, for file need plan fixtured to /no/such/plan.md', async () => {
    const fileNeedLine = lineYaml("flow", "worker").replace("name: ticket\n        kind: value", "name: plan\n        kind: file\n        path: plan.md");
    const { client } = await connectedTo([{ path: "flow/assembly-line.yaml", text: fileNeedLine }, WORKER_COLLECTION[1]]);

    await client.next();
    client.send({ id: "p2", type: "run.preview", line: "flow", node: "work", fixture: { plan: "/no/such/plan.md" }, folder: "/tmp/run-1", permission: "acceptEdits" });
    const answer = await client.next();

    expect(answer).toMatchObject({ type: "result", result: { blockers: ['"plan": /no/such/plan.md is not on disk'] } });
  });

  it("refuses to start on a directory that does not exist", async () => {
    await expect(startStudio({ dir: "/no/such/collection", port: 0, hostKeys: [] })).rejects.toThrow(new Error("/no/such/collection is not a directory"));
  });
});
