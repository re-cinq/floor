// Lore's own files, read as lore writes them: a line's YAML, and a recipe's markdown with its settings in front matter. Only what the conversion uses is named; the rest is let through and ignored.
import { parse } from "yaml";
import { z } from "zod";

// snake_case is lore's own spelling in its files.
const loreNode = z.looseObject({
  id: z.string(),
  type: z.string(),
  prompt_ref: z.string().optional(),
  model: z.string().optional(),
  job_ref: z.string().optional(),
  route: z.string().optional(),
  station_ref: z.string().optional(),
  timeout_minutes: z.number().optional(),
  required_tags: z.array(z.string()).optional(),
  continues: z.object({ node: z.string(), key: z.string() }).optional(),
  by_hand: z.boolean().optional(),
});

const loreEdge = z.object({ from: z.string(), to: z.string(), on: z.string(), iteration_max: z.number().optional() });

const loreLine = z.looseObject({
  name: z.string(),
  entry: z.string(),
  exit: z.string(),
  nodes: z.array(loreNode),
  edges: z.array(loreEdge),
});

const recipeSettings = z.looseObject({
  timeout_minutes: z.number().optional(),
  model: z.string().optional(),
  disallowed_tools: z.array(z.string()).optional(),
  test_policy: z.string().optional(),
  repo_workdir: z.boolean().optional(),
});

export type LoreNode = z.infer<typeof loreNode>;
export type LoreEdge = z.infer<typeof loreEdge>;
export type LoreLine = z.infer<typeof loreLine>;
export type RecipeSettings = z.infer<typeof recipeSettings>;

export interface LoreRecipe {
  name: string;
  settings: RecipeSettings;
  prompt: string;
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseLine(yamlText: string): LoreLine {
  return loreLine.parse(parse(yamlText));
}

/** A recipe with no front matter is all prompt. */
export function parseRecipe(name: string, markdown: string): LoreRecipe {
  const parts = FRONT_MATTER.exec(markdown);

  if (!parts) return { name, settings: {}, prompt: markdown.trim() };
  const [, settings, prompt] = parts;

  return { name, settings: recipeSettings.parse(parse(settings) ?? {}), prompt: prompt.trim() };
}
