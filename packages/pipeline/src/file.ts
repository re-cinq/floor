// A pipeline as one file, as a person writes it: YAML, in snake_case, with every prompt and every file's content in it. Only the file's own outline is checked here; what a line, a station or an agent definition may hold is the floor's to say, and it says so when the file is imported.
import { parse, stringify } from "yaml";
import { z } from "zod";

const fields = z.record(z.string(), z.unknown());
const named = z.record(z.string(), fields);
const names = z.array(z.string());

/** Text as it is; anything else as base64. */
const content = z.union([z.string(), z.strictObject({ base64: z.string() })]);

const pipelineFile = z.strictObject({
  line: z.looseObject({ id: z.string().min(1), files: z.record(z.string(), content).optional() }).optional(),
  stations: named.optional(),
  agent_definitions: named.optional(),
  schedules: named.optional(),
  /** What this file takes away: a pipeline that is no longer wanted leaves by a file, as it came. */
  archive: z.strictObject({ lines: names.optional(), stations: names.optional(), agent_definitions: names.optional(), schedules: names.optional() }).optional(),
});

export type PipelineFile = z.infer<typeof pipelineFile>;
export type FileContent = z.infer<typeof content>;

export function readPipelineFile(text: string): PipelineFile {
  const read = pipelineFile.safeParse(parse(text));

  if (read.success) return read.data;
  const { issues } = read.error;
  const problems = issues.map((issue) => `${issue.path.join(".") || "the file"}: ${issue.message}`);

  throw new Error(`not a pipeline file: ${problems.join("; ")}`);
}

/** A prompt is written as the block it is, and no line is folded: a prompt's line breaks are the prompt's. */
export function writePipelineFile(file: PipelineFile): string {
  return stringify(file, { lineWidth: 0, blockQuote: "literal" });
}
