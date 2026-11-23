// A pipeline as one file, as a person writes it: YAML, in snake_case, with every prompt and every file's content in it. Only the file's own outline is checked here; what a line, a station or an agent definition may hold is the floor's to say, and it says so when the file is imported.
import { parse, stringify } from "yaml";
import { z } from "zod";

const fields = z.record(z.string(), z.unknown());
const named = z.record(z.string(), fields);
const names = z.array(z.string());

/** Text as it is; anything else as base64. */
const content = z.union([z.string(), z.strictObject({ base64: z.string().describe("The file's bytes, in base64.") })]);

export const pipelineFileSchema = z.strictObject({
  line: z
    .looseObject({
      id: z.string().min(1).describe("The line's id. In a collection it equals the name of the folder the file is in."),
      files: z.record(z.string(), content).describe("Files put in the bag of every run at its start, by item name. A file is written as its text, or as `{ base64: ... }` for bytes that are not text.").optional(),
    })
    .describe("The assembly line. A file with none carries only stations, agent definitions, schedules or an archive.")
    .optional(),
  stations: named.describe("The stations, by id.").optional(),
  agent_definitions: named.describe("The agent definitions, by id. A collection refuses this block and defines each agent in its own file.").optional(),
  schedules: named.describe("The schedules, by name. Each sends the event `schedule.<name>.tick`.").optional(),
  archive: z
    .strictObject({
      lines: names.describe("Ids of lines to archive.").optional(),
      stations: names.describe("Ids of stations to archive.").optional(),
      agent_definitions: names.describe("Ids of agent definitions to archive.").optional(),
      schedules: names.describe("Names of schedules to archive.").optional(),
    })
    .describe("What importing this file takes away from the floor.")
    .optional(),
});

export type PipelineFile = z.infer<typeof pipelineFileSchema>;
export type FileContent = z.infer<typeof content>;

export function readPipelineFile(text: string): PipelineFile {
  const read = pipelineFileSchema.safeParse(parse(text));

  if (read.success) return read.data;
  const { issues } = read.error;
  const problems = issues.map((issue) => `${issue.path.join(".") || "the file"}: ${issue.message}`);

  throw new Error(`not a pipeline file: ${problems.join("; ")}`);
}

/** A prompt is written as the block it is, and no line is folded: a prompt's line breaks are the prompt's. */
export function writePipelineFile(file: PipelineFile): string {
  return stringify(file, { lineWidth: 0, blockQuote: "literal" });
}
