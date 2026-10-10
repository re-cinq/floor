// Pure: a pipeline as the file spells it, and as the floor takes it. The floor's own fields change spelling, `timeout_minutes` to `timeoutMinutes`. Names a person chose do not: a model's name, a repository's, a key of `config` or of `env`.
import type { FileContent, PipelineFile } from "./file.js";

export type Fields = Record<string, unknown>;

export interface Named {
  id: string;
  body: Fields;
}

export interface Archive {
  lines: string[];
  stations: string[];
  agentDefinitions: string[];
  schedules: string[];
}

export interface Pipeline {
  /** Without its files, which the floor keeps by their hash and the file by their content. */
  line?: Named;
  files: Record<string, Buffer>;
  stations: Named[];
  agentDefinitions: Named[];
  schedules: Named[];
  archive: Archive;
}

type Spelling = Record<string, string>;

interface Spellings {
  edge: Spelling;
  station: Spelling;
  settings: Spelling;
  price: Spelling;
}

const AS_THE_FLOOR_SPELLS: Spellings = {
  edge: { iteration_max: "iterationMax" },
  station: { agent_definition: "agentDefinition", conversation_key: "conversationKey", must_change: "mustChange" },
  settings: { timeout_minutes: "timeoutMinutes" },
  price: { input_per_million: "inputPerMillion", output_per_million: "outputPerMillion", cache_read_per_million: "cacheReadPerMillion", cache_write_per_million: "cacheWritePerMillion" },
};

const AS_THE_FILE_SPELLS: Spellings = {
  edge: turned(AS_THE_FLOOR_SPELLS.edge),
  station: turned(AS_THE_FLOOR_SPELLS.station),
  settings: turned(AS_THE_FLOOR_SPELLS.settings),
  price: turned(AS_THE_FLOOR_SPELLS.price),
};

export function pipelineOf(file: PipelineFile): Pipeline {
  return {
    ...lineOf(file.line),
    stations: namedIn(file.stations, (body) => respelled(body, AS_THE_FLOOR_SPELLS.station)),
    agentDefinitions: namedIn(file.agent_definitions, (body) => agentDefinitionBody(body, AS_THE_FLOOR_SPELLS)),
    schedules: namedIn(file.schedules, (body) => body),
    archive: archiveOf(file.archive),
  };
}

function lineOf(written: PipelineFile["line"]): Pick<Pipeline, "line" | "files"> {
  if (!written) return { files: {} };
  const { id, files = {}, ...line } = written;

  return { line: { id, body: lineBody(line, AS_THE_FLOOR_SPELLS) }, files: valuesOf(files, bytesOf) };
}

function archiveOf(written: PipelineFile["archive"]): Archive {
  const { agent_definitions: agentDefinitions, ...taken } = { lines: [], stations: [], schedules: [], agent_definitions: [], ...written };

  return { ...taken, agentDefinitions };
}

/** The order a person reads in: where a line begins before what it is given, a prompt after the model it is for. A floor hands its fields back in the alphabet's. */
const READ_IN_ORDER = {
  line: ["id", "entry", "exit", "fail", "start", "args", "files", "nodes", "edges"],
  station: ["kind", "description", "agent_definition", "conversation", "conversation_key", "url", "route", "outcomes", "must_change", "needs", "produces"],
  settings: ["model", "image", "timeout_minutes", "tags", "prices", "config", "prompt"],
  schedule: ["cron", "timezone", "payload"],
};

/** What is empty is left out: a file says what a pipeline has. */
export function fileOf(pipeline: Pipeline): PipelineFile {
  const line = pipeline.line;
  const written = {
    line: line && inOrder({ id: line.id, ...lineBody(line.body, AS_THE_FILE_SPELLS), ...filled("files", valuesOf(pipeline.files, contentOf)) }, READ_IN_ORDER.line),
    stations: byId(pipeline.stations, (body) => inOrder(respelled(body, AS_THE_FILE_SPELLS.station), READ_IN_ORDER.station)),
    agent_definitions: byId(pipeline.agentDefinitions, (body) => agentDefinitionBody(body, AS_THE_FILE_SPELLS)),
    schedules: byId(pipeline.schedules, (body) => inOrder(body, READ_IN_ORDER.schedule)),
  };

  return Object.fromEntries(Object.entries(written).filter(([, held]) => isFilled(held))) as PipelineFile;
}

// The fields named, in the order named, then any other as it came.
function inOrder(given: Fields, order: string[]): Fields {
  const named = order.filter((name) => name in given);
  const others = Object.keys(given).filter((name) => !order.includes(name));

  return Object.fromEntries([...named, ...others].map((name) => [name, given[name]]));
}

function lineBody(line: Fields, spellings: Spellings): Fields {
  return { ...line, ...filled("edges", listOf(line.edges).map((edge) => respelled(edge, spellings.edge))) };
}

function agentDefinitionBody(body: Fields, spellings: Spellings): Fields {
  const variants = valuesOf(fieldsOf(body.variants), (variant) => settingsOf(fieldsOf(variant), spellings));

  return { ...body, settings: settingsOf(fieldsOf(body.settings), spellings), ...filled("variants", variants) };
}

function settingsOf(settings: Fields, spellings: Spellings): Fields {
  const prices = valuesOf(fieldsOf(settings.prices), (price) => respelled(fieldsOf(price), spellings.price));

  return inOrder({ ...respelled(settings, spellings.settings), ...filled("prices", prices) }, READ_IN_ORDER.settings);
}

function respelled(given: Fields, spelling: Spelling): Fields {
  return Object.fromEntries(Object.entries(given).map(([name, held]) => [spelling[name] ?? name, held]));
}

function turned(spelling: Spelling): Spelling {
  return Object.fromEntries(Object.entries(spelling).map(([file, floor]) => [floor, file]));
}

function namedIn(byName: Record<string, Fields> | undefined, bodyOf: (body: Fields) => Fields): Named[] {
  return Object.entries(byName ?? {}).map(([id, body]) => ({ id, body: bodyOf(body) }));
}

function byId(named: Named[], bodyOf: (body: Fields) => Fields): Record<string, Fields> {
  return Object.fromEntries(named.map((each) => [each.id, bodyOf(each.body)]));
}

function bytesOf(written: FileContent): Buffer {
  return typeof written === "string" ? Buffer.from(written) : Buffer.from(written.base64, "base64");
}

// Text only when it comes back the same: bytes that are no text would be written as something else.
function contentOf(bytes: Buffer): FileContent {
  const text = bytes.toString("utf8");

  return Buffer.from(text).equals(bytes) ? text : { base64: bytes.toString("base64") };
}

function valuesOf<Held, Made>(byName: Record<string, Held>, made: (held: Held) => Made): Record<string, Made> {
  return Object.fromEntries(Object.entries(byName).map(([name, held]) => [name, made(held)]));
}

function filled(name: string, held: unknown): Fields {
  return isFilled(held) ? { [name]: held } : {};
}

function isFilled(held: unknown): boolean {
  if (held === undefined) return false;

  return typeof held === "object" && held !== null ? Object.keys(held).length > 0 : true;
}

function fieldsOf(held: unknown): Fields {
  return typeof held === "object" && held !== null && !Array.isArray(held) ? (held as Fields) : {};
}

function listOf(held: unknown): Fields[] {
  return Array.isArray(held) ? held.map(fieldsOf) : [];
}
