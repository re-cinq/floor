import { describe, expect, it } from "vitest";
import { modelSecretKeyFor } from "./model-secret.js";

describe("modelSecretKeyFor", () => {
  it("names the Anthropic key for a claude model", () => {
    expect(modelSecretKeyFor("claude-sonnet-5")).toBe("ANTHROPIC_API_KEY");
  });

  it("names the Gemini key for a gemini model", () => {
    expect(modelSecretKeyFor("gemini-2.5-pro")).toBe("GEMINI_API_KEY");
  });

  it("names no key for a family it does not know", () => {
    expect(modelSecretKeyFor("llama-4")).toBeUndefined();
  });

  it("names no key when the definition names no model", () => {
    expect(modelSecretKeyFor(undefined)).toBeUndefined();
  });
});
