// zod mirrors of packages/store's definition body types (the pipeline file and agent file specifications, website/src/content/docs/specs), for POST/PUT validation.
import { z } from "zod";
import { isValidCron, isValidTimezone } from "@floor/store";
import { agentConfigSchema } from "@re-cinq/floor-pipeline/agent-config";

const whenValue = z.union([z.string(), z.number(), z.boolean()]);

const when = z.record(z.string(), whenValue).describe("Payload fields that must equal these values. Each is a top-level field of the event's payload, compared as text. A field the payload lacks does not match.");

const lineStart = z.object({
  on: z.array(z.string()).describe("Names of the events that start a run of this line. A name matches exactly."),
  when: when.optional(),
  args: z.record(z.string(), z.string()).describe("Argument name to a template, filled from the top-level fields of the event's payload, such as `{pr_url}`."),
});

const lineNodeReport = z.object({
  on: z.string().describe("Name of the event that answers a visit waiting at this node."),
  when: when.optional(),
  outcome: z.string().describe("The outcome the visit reports when the event arrives."),
});

const lineNode = z.object({
  id: z.string().describe("The node's name, unique in the line."),
  station: z.string().describe("The station this node runs. A node with no station is a marker and reports `success` at once. `name@hash` pins one version of the station.").optional(),
  start: z.string().describe("Name of the event that opens this node in a run. Defaults to `node.<id>.start`.").optional(),
  bind: z.record(z.string(), z.string()).describe("Need name to bag item name, for a need the bag holds under another name.").optional(),
  reports: z.array(lineNodeReport).describe("Events that answer a visit waiting at this node, in place of a report from the station's worker.").optional(),
  fanout: z
    .object({
      over: z.string().describe("The value this node's station produces that holds the list, a JSON array of strings."),
      to: z.string().describe("The node that runs once for each entry of the list, with the entry as its `item` need."),
    })
    .describe("Runs another node once for each entry of a list this node produces. The walk goes on past that node when every branch has reported.")
    .optional(),
});

const lineEdge = z.object({
  from: z.string().describe("The node the edge leaves."),
  to: z.string().describe("The node the edge enters."),
  on: z.string().describe("The outcome that takes this edge, or `always` for any outcome. An edge on the exact outcome wins over `always`."),
  iterationMax: z.number().int().positive().describe("How many times one run may take this edge. A run that needs it once more halts.").optional(),
});

const itemKind = z.enum(["value", "file", "git"]);

const lineArgSpec = z.object({
  kind: itemKind.describe("The kind of item a start gives for this argument."),
  subject: z.boolean().describe("Marks the argument whose value names what the run is about. One open run exists for a repo and a subject. A second start with the same value joins that run.").optional(),
});

export const lineBodySchema = z.object({
  entry: z.string().describe("The node a run starts at."),
  exit: z.string().describe("The node that ends a run as `success`."),
  fail: z.string().describe("The node that ends a run as `failed`. With none, no node can.").optional(),
  start: lineStart.describe("The events that start a run of this line, and how their payload fills its arguments. With none, a run starts only by `POST /assembly-lines/{id}/start`.").optional(),
  args: z.record(z.string(), lineArgSpec).describe("The arguments a start gives, by name. Each becomes an item of the run's bag under that name."),
  files: z.record(z.string(), z.string()).describe("Files put in the bag of every run at its start, by item name.").optional(),
  nodes: z.array(lineNode).describe("The nodes of the line."),
  edges: z.array(lineEdge).describe("Which node follows which, by outcome."),
});

const needSpec = z.object({
  name: z.string().describe("The need's name. The bag item of the same name fills it, unless the node's `bind` names another."),
  kind: itemKind.describe("The kind of item the need takes."),
  path: z.string().describe("Agent stations only. Where the item is put in the pod, relative to `/workspace`.").optional(),
  access: z.enum(["read", "write"]).describe("`git` needs only. `write` lets the visit push to the repository. Defaults to `read`.").optional(),
  optional: z.boolean().describe("The visit opens without the item when the bag does not hold it.").optional(),
  collect: z.string().describe("`value` needs only. The name of an item the body of a fan-out produces. The need is filled with a JSON array of what each branch produced, in branch order.").optional(),
});

const produceSpec = z
  .object({
    name: z.string().describe("The name of the bag item the station writes."),
    kind: z.enum(["value", "file"]).describe("The kind of item written."),
    path: z.string().describe("Agent stations only. The file the agent writes, relative to `/workspace`.").optional(),
    from: z.literal("output").describe("Agent stations only. The file is everything the agent said last. For kind `file`, and with no `path`.").optional(),
  })
  .refine((produce) => !produce.from || (produce.kind === "file" && !produce.path), { message: "from: output is for a file, and takes no path" });

export const stationBodySchema = z.object({
  kind: z.enum(["agent", "service", "human"]).describe("Who does the work. `agent` is a model in a pod, `service` is a worker that claims visits, `human` is a person."),
  description: z.string().describe("What the station does, for a person reading the line. The floor does not act on it, and changing it makes no new version.").optional(),
  agentDefinition: z.string().describe("Agent stations only. The id of the agent definition the station runs.").optional(),
  conversation: z.enum(["new", "continue"]).describe("Agent stations only. `continue` resumes the conversation of this node's last visit in the run that did not fail.").optional(),
  conversationKey: z.string().describe("With `conversation: continue`. The name of a bag item. The conversation resumed is one from a run on the same repo that holds the same value under that name.").optional(),
  outcomes: z.array(z.string()).describe("The outcomes the station reports. `failed` can be reported whether it is listed or not."),
  mustChange: z.boolean().describe("Accepted and not acted on.").optional(),
  resultRequired: z.boolean().describe("Agent stations only. An agent that ends without stating a result has `failed`. Without it, silence is read as `success`.").optional(),
  needs: z.array(needSpec).describe("The bag items a visit is given."),
  produces: z.array(produceSpec).describe("The bag items a visit writes."),
  url: z.string().describe("Accepted and not acted on.").optional(),
  route: z.string().describe("Human stations only. Kept for the page a person acts through. The floor does not read it.").optional(),
});

const perMillion = z.number().nonnegative();

const modelPrice = z.object({
  inputPerMillion: perMillion.describe("US dollars for a million input tokens."),
  outputPerMillion: perMillion.describe("US dollars for a million output tokens."),
  cacheReadPerMillion: perMillion.describe("US dollars for a million tokens read from the cache. The input price when not stated.").optional(),
  cacheWritePerMillion: perMillion.describe("US dollars for a million tokens written to the cache. The input price when not stated.").optional(),
});

const agentSettings = z.object({
  model: z.string().describe("The model the agent runs on.").optional(),
  prompt: z.string().describe("What the agent is told. `{name}` placeholders are filled when a visit opens."),
  image: z.string().describe("The container image the agent runs in."),
  timeoutMinutes: z.number().int().positive().describe("How long a visit may run, in minutes. A visit past its deadline has `failed`."),
  tags: z.array(z.string()).describe("Which cluster agents may run it. A cluster agent claims a visit only when it offers every tag.").optional(),
  config: agentConfigSchema.describe("Settings for the agent's pod. A key the floor does not know is kept and not acted on.").optional(),
  prices: z.record(z.string(), modelPrice).describe("Model name to what it costs, for a model that reports tokens and no cost. The floor holds no price of its own.").optional(),
});

export const agentDefinitionBodySchema = z.object({
  settings: agentSettings.describe("The settings of the agent on every repository."),
  variants: z.record(z.string(), agentSettings.partial()).describe("`host/owner/name` to settings laid over `settings` for runs on that repository, by field, by key of `config` and by model of `prices`.").optional(),
});

const startItem = z.object({ kind: itemKind, ref: z.string(), by: z.string(), sha: z.string().optional() });

export const startRunSchema = z.object({
  repo: z.string().min(1).optional().transform((repo) => repo ?? null),
  startItems: z.record(z.string(), startItem),
  entry: z.string().optional(),
  lineHash: z.string().optional(),
});

const coercedDate = z.coerce.date();

export const enqueueEventSchema = z.object({
  name: z.string(),
  payload: z.record(z.string(), z.unknown()),
  dedupeKey: z.string().optional(),
  availableAt: coercedDate.optional(),
  runId: z.string().optional(),
});

const subsystemVersionsSchema = z.object({ version: z.string(), clis: z.record(z.string(), z.string()) });

export const registerClusterSchema = z.object({ tags: z.array(z.string()), build: z.string().optional(), subsystem: subsystemVersionsSchema.nullable().optional() });

export const claimEventsSchema = z.object({ tags: z.array(z.string()), limit: z.number().int().positive() });

export const failEventSchema = z.object({ error: z.string(), permanent: z.boolean() });

export const scheduleBodySchema = z.object({
  cron: z.string().refine(isValidCron, { message: "invalid cron expression" }).describe("When the schedule ticks, as a cron expression."),
  timezone: z.string().refine(isValidTimezone, { message: "invalid timezone" }).describe("The timezone the expression is read in. Defaults to UTC.").optional(),
  payload: z.record(z.string(), z.unknown()).describe("The payload of each `schedule.<name>.tick` event. The floor adds `scheduledFor`."),
});

export const recordKindSchema = z.enum(["log", "turn", "llm_call"]);

export const createRecordsSchema = z.object({
  records: z.array(z.object({ kind: recordKindSchema, body: z.unknown(), occurredAt: coercedDate })).min(1),
});
