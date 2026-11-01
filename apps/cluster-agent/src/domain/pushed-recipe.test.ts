import { describe, expect, it } from "vitest";
import type { AgentDefinitionBody, AgentRecipes } from "@re-cinq/floor-contracts";
import { buildRecipe } from "./agent-triple.js";
import { modelSecretKeyFor } from "./model-secret.js";
import { BODY_ANNOTATION, DEFINITION_LABEL, HASH_ANNOTATION, VARIANT_ANNOTATION, heldBody, pushedRecipes, type HeldRecipe } from "./pushed-recipe.js";

const BODY: AgentDefinitionBody = {
  settings: { model: "claude-sonnet-4-6", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 },
  variants: { "github.com/re-cinq/otto": { model: "gemini-3.1-pro-preview" } },
};

const RECIPES: AgentRecipes<AgentDefinitionBody> = {
  id: "reviewer",
  hash: "h1",
  body: BODY,
  floorBaseUrl: "http://floor",
  recipes: [
    { variant: null, settings: { model: "claude-sonnet-4-6", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 } },
    { variant: "github.com/re-cinq/otto", settings: { model: "gemini-3.1-pro-preview", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 } },
  ],
};

function held(variant: string | null, spec: Partial<HeldRecipe["spec"]> = {}, createdAt = "2026-11-01T12:00:00Z"): HeldRecipe {
  const [base, otto] = RECIPES.recipes;
  const { settings } = (variant ? otto : base)!;

  return {
    hash: "h1",
    variant,
    body: BODY,
    createdAt,
    spec: { model: settings.model, prompt: settings.prompt, image: settings.image, timeoutMinutes: settings.timeoutMinutes, ...spec },
  };
}

describe("pushedRecipes", () => {
  it("names each variant's recipe as a visit with the same settings would", () => {
    const names = pushedRecipes(RECIPES, {}).map((recipe) => recipe.name);

    expect(names).toEqual(RECIPES.recipes.map((recipe) => buildRecipe({ settings: recipe.settings, floorBaseUrl: "http://floor", modelSecretKey: modelSecretKeyFor(recipe.settings.model) }).name));
  });

  it("labels the otto variant's AgentDefinition with reviewer and annotates its version, variant and body", () => {
    const otto = pushedRecipes(RECIPES, {})[1]!;

    expect(otto.agentDefinition.metadata).toMatchObject({
      labels: { [DEFINITION_LABEL]: "reviewer" },
      annotations: { [HASH_ANNOTATION]: "h1", [VARIANT_ANNOTATION]: "github.com/re-cinq/otto", [BODY_ANNOTATION]: JSON.stringify(BODY) },
    });
  });
});

describe("heldBody", () => {
  it("answers the pushed body unchanged when kube holds what was pushed", () => {
    expect(heldBody([held(null), held("github.com/re-cinq/otto")])).toEqual(BODY);
  });

  it("puts a prompt edited on the base recipe into settings", () => {
    const body = heldBody([held(null, { prompt: "Review the change, line by line." }), held("github.com/re-cinq/otto")]);

    expect(body?.settings.prompt).toBe("Review the change, line by line.");
  });

  it("puts an image edited on the otto recipe into otto's variant only", () => {
    const body = heldBody([held(null), held("github.com/re-cinq/otto", { image: "agent:2" })]);

    expect(body).toEqual({ ...BODY, variants: { "github.com/re-cinq/otto": { model: "gemini-3.1-pro-preview", image: "agent:2" } } });
  });

  it("reads the newest pushed version when an older one is still in kube", () => {
    const newer = { ...held(null, { prompt: "Newer." }, "2026-11-01T13:00:00Z"), hash: "h2", body: { settings: { ...BODY.settings, prompt: "Newer." } } };

    expect(heldBody([held(null), newer])).toEqual({ settings: { ...BODY.settings, prompt: "Newer." } });
  });

  it("answers null when kube holds no recipe of the definition", () => {
    expect(heldBody([])).toBeNull();
  });
});
