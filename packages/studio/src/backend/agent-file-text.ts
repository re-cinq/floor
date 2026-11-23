// The text of an agent file: YAML frontmatter between `---` lines, then the prompt.
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { enforce } from "@re-cinq/floor-assembly-lines";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/** The agent file with its body replaced by `prompt`, the frontmatter kept byte for byte. */
export function withPrompt(text: string, prompt: string): string {
  const frontmatter = FRONTMATTER.exec(text);

  enforce(frontmatter, "the agent file has no frontmatter");

  return `${frontmatter[0]}${prompt.endsWith("\n") ? prompt : `${prompt}\n`}`;
}

/** The agent file with `settings` set in its frontmatter, comments and key order kept, the body byte for byte. */
export function withSettings(text: string, settings: Record<string, unknown>): string {
  const frontmatter = FRONTMATTER.exec(text);

  enforce(frontmatter, "the agent file has no frontmatter");

  const document = parseDocument(frontmatter[0].replace(/^---\r?\n|---\r?\n$/g, ""));

  const droppedKeys = Object.keys(document.toJS() ?? {}).filter((key) => !(key in settings));

  for (const key of droppedKeys) document.delete(key);
  for (const [key, value] of Object.entries(settings)) document.set(key, value);

  return `---\n${document.toString()}---\n${text.slice(frontmatter[0].length)}`;
}

/** A rewrite of one agent file, refused unless `version` is still the version of the file. */
export interface AgentEdit {
  prompt: string;
  settings?: Record<string, unknown>;
  version: string;
}

/** The text `current` of the agent file at `file` with `edit` applied: its settings, if any, then its prompt. */
export function editedAgentText(file: string, current: string, { prompt, settings, version }: AgentEdit): string {
  enforce(version === textVersion(current), `${file} changed on disk since it was read`);

  return withPrompt(settings ? withSettings(current, settings) : current, prompt);
}

/** The version of an agent file: a hash of its text as read. */
export function textVersion(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
