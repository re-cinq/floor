import { describe, expect, it } from "vitest";
import { modelSecretKeyFor, parseKeyByFamily } from "./model-secret.js";

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

  it("names what the cluster holds instead, when told", () => {
    expect(modelSecretKeyFor("claude-sonnet-5", { claude: "CLAUDE_CODE_OAUTH_TOKEN" })).toBe("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("keeps the other families' keys when one is overridden", () => {
    expect(modelSecretKeyFor("gemini-2.5-pro", { claude: "CLAUDE_CODE_OAUTH_TOKEN" })).toBe("GEMINI_API_KEY");
  });
});

describe("parseKeyByFamily", () => {
  it("reads a list of family=key pairs", () => {
    expect(parseKeyByFamily("claude=CLAUDE_CODE_OAUTH_TOKEN, gemini=GEMINI_API_KEY")).toEqual({ claude: "CLAUDE_CODE_OAUTH_TOKEN", gemini: "GEMINI_API_KEY" });
  });

  it("reads nothing from an unset variable", () => {
    expect(parseKeyByFamily(undefined)).toEqual({});
  });

  it("skips an entry with no key", () => {
    expect(parseKeyByFamily("claude=,gemini=GEMINI_API_KEY")).toEqual({ gemini: "GEMINI_API_KEY" });
  });
});
