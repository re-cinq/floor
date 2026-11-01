// Pure: an agent definition's recipes as pushed before any visit, marked with the version they came from, and the floor body read back out of what kube holds, a hand edit included.

import type { AgentDefinitionBody, AgentRecipes, AgentSettings } from "@re-cinq/floor-contracts";
import { buildRecipe, type Recipe } from "./agent-triple.js";
import { modelSecretKeyFor, type KeyByFamily } from "./model-secret.js";

/** The agent definition a pushed recipe holds; the sweep keeps the newest of each variant. */
export const DEFINITION_LABEL = "floor.re-cinq.com/definition";
export const HASH_ANNOTATION = "floor.re-cinq.com/definition-hash";
/** The repository whose variant this recipe runs; empty for the base. */
export const VARIANT_ANNOTATION = "floor.re-cinq.com/variant";
/** The whole floor body the recipe was pushed from, so what kube holds can be read back as a body the floor hashes. */
export const BODY_ANNOTATION = "floor.re-cinq.com/body";

/** The fields a person edits on a recipe in kube and the floor takes back: the prompt and the pod's values. */
const HELD_FIELDS = ["model", "prompt", "image", "timeoutMinutes"] as const;

type HeldField = (typeof HELD_FIELDS)[number];

export interface HeldRecipe {
  hash: string;
  variant: string | null;
  body: AgentDefinitionBody;
  createdAt: string;
  spec: Partial<Pick<AgentSettings, HeldField>>;
}

export function pushedRecipes(recipes: AgentRecipes<AgentDefinitionBody>, modelSecretKeys: KeyByFamily | undefined): Recipe[] {
  return recipes.recipes.map(({ variant, settings, modelSecretKey }) => {
    const recipe = buildRecipe({ settings, floorBaseUrl: recipes.floorBaseUrl, modelSecretKey: modelSecretKey ?? modelSecretKeyFor(settings.model, modelSecretKeys) });
    const marked = marking(recipes, variant);

    return {
      name: recipe.name,
      agentDefinition: { ...recipe.agentDefinition, metadata: withMarking(recipe.agentDefinition.metadata, marked) },
      station: { ...recipe.station, metadata: withMarking(recipe.station.metadata, marked) },
    };
  });
}

interface Marking {
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

function marking(recipes: AgentRecipes<AgentDefinitionBody>, variant: string | null): Marking {
  return {
    labels: { [DEFINITION_LABEL]: recipes.id },
    annotations: { [HASH_ANNOTATION]: recipes.hash, [VARIANT_ANNOTATION]: variant ?? "", [BODY_ANNOTATION]: JSON.stringify(recipes.body) },
  };
}

function withMarking<Metadata extends { labels?: Record<string, string>; annotations?: Record<string, string> }>(metadata: Metadata | undefined, marked: Marking): Metadata {
  const base = (metadata ?? {}) as Metadata;

  return { ...base, labels: { ...base.labels, ...marked.labels }, annotations: { ...base.annotations, ...marked.annotations } };
}

/** The newest pushed version's body, with every field edited in kube written back where it came from: the base recipe's into `settings`, a variant's into that variant. Null when kube holds no recipe of it. */
export function heldBody(held: readonly HeldRecipe[]): AgentDefinitionBody | null {
  const newest = [...held].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).at(0);

  if (!newest) return null;

  return held.filter((recipe) => recipe.hash === newest.hash).reduce(withEdits, structuredClone(newest.body));
}

function withEdits(body: AgentDefinitionBody, recipe: HeldRecipe): AgentDefinitionBody {
  const { settings, variants } = recipe.body;
  const pushed = recipe.variant ? { ...settings, ...variants?.[recipe.variant] } : settings;
  const edits = Object.fromEntries(
    HELD_FIELDS.filter((field) => recipe.spec[field] !== undefined && recipe.spec[field] !== pushed[field]).map((field) => [field, recipe.spec[field]]),
  );

  if (Object.keys(edits).length === 0) return body;
  if (!recipe.variant) return { ...body, settings: { ...body.settings, ...edits } };

  return { ...body, variants: { ...body.variants, [recipe.variant]: { ...body.variants?.[recipe.variant], ...edits } } };
}
