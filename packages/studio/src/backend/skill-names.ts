// The skills a collection holds: one markdown file each under `skills/`, or one folder each under `agent-skills/skills/` with a SKILL.md.
import { access, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

export async function skillNamesIn(dir: string): Promise<string[]> {
  const files = await readdir(join(dir, "skills")).catch(() => []);
  const fileNames = files.filter((file) => file.endsWith(".md")).map((file) => basename(file, ".md"));
  const folderNames = await folderSkillNamesIn(dir);

  return [...new Set([...fileNames, ...folderNames])].sort();
}

async function folderSkillNamesIn(dir: string): Promise<string[]> {
  const root = join(dir, "agent-skills", "skills");
  const folders = await readdir(root).catch(() => []);
  const found = await Promise.all(folders.map((folder) => access(join(root, folder, "SKILL.md")).then(() => folder, () => undefined)));

  return found.filter((folder) => folder !== undefined);
}
