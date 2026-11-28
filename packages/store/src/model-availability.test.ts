import { describe, expect, it } from "vitest";
import type { ModelCatalogStatus } from "@re-cinq/floor-contracts";
import { modelAvailability } from "./model-availability.js";

function catalogOf(vendor: string, ids: string[], error = ""): ModelCatalogStatus {
  return {
    refreshedAt: "2026-11-28T10:00:00Z",
    vendors: [
      {
        vendor,
        provider: "provider",
        secretRefs: [],
        error,
        models: ids.map((id) => ({ id, displayName: id })),
      },
    ],
  };
}

const claudeHaikuOnly = catalogOf("claude", ["claude-haiku-4-5"]);
const claudeSonnet = catalogOf("claude", ["claude-sonnet-5-5"]);

describe("modelAvailability", () => {
  it("answers false for claude-sonnet-5-5 when the one catalog's claude entry lists only claude-haiku-4-5", () => {
    expect(modelAvailability("claude-sonnet-5-5", [claudeHaikuOnly])).toEqual(false);
  });

  it("answers true for claude-sonnet-5-5 when the claude entry lists it", () => {
    expect(modelAvailability("claude-sonnet-5-5", [claudeSonnet])).toEqual(true);
  });

  it("answers unverified for claude-sonnet-5-5 when the only catalog is null", () => {
    expect(modelAvailability("claude-sonnet-5-5", [null])).toEqual("unverified");
  });

  it("answers unverified for mistral-large, a model of no known vendor", () => {
    expect(modelAvailability("mistral-large", [catalogOf("claude", ["mistral-large"])])).toEqual("unverified");
  });

  it("answers unverified for gemini-3-pro when the catalog has only a claude entry", () => {
    expect(modelAvailability("gemini-3-pro", [claudeHaikuOnly])).toEqual("unverified");
  });

  it("answers unverified for claude-sonnet-5-5 when the claude entry has an error and does not list it", () => {
    expect(modelAvailability("claude-sonnet-5-5", [catalogOf("claude", [], "auth failed")])).toEqual("unverified");
  });

  it.each<[string, string]>([
    ["gemini-3-pro", "gemini"],
    ["gpt-5", "codex"],
    ["o1-preview", "codex"],
    ["o3-mini", "codex"],
    ["o4-mini", "codex"],
    ["gpt-5-codex", "codex"],
    ["codex-mini", "codex"],
  ])("answers true for %s when the %s entry lists it", (model, vendor) => {
    expect(modelAvailability(model, [catalogOf(vendor, [model])])).toEqual(true);
  });

  it("answers true for claude-sonnet-5-5 when one catalog lacks it and another lists it", () => {
    expect(modelAvailability("claude-sonnet-5-5", [claudeHaikuOnly, claudeSonnet])).toEqual(true);
  });

  it("answers false for claude-sonnet-5-5 when two catalogs both lack it", () => {
    expect(modelAvailability("claude-sonnet-5-5", [claudeHaikuOnly, claudeHaikuOnly])).toEqual(false);
  });

  it("answers unverified for claude-sonnet-5-5 when one catalog lacks it and another is null", () => {
    expect(modelAvailability("claude-sonnet-5-5", [claudeHaikuOnly, null])).toEqual("unverified");
  });

  it("answers unverified for claude-sonnet-5-5 when there are no catalogs", () => {
    expect(modelAvailability("claude-sonnet-5-5", [])).toEqual("unverified");
  });

  it("answers false for claude-sonnet-5-5 on a Foundry cluster whose foundry claude entry lacks it, though its anthropic claude entry failed", () => {
    const foundryCluster: ModelCatalogStatus = {
      refreshedAt: "2026-11-28T10:00:00Z",
      vendors: [
        { vendor: "claude", provider: "anthropic", secretRefs: ["ANTHROPIC_API_KEY"], error: "ANTHROPIC_API_KEY: Secret has no key ANTHROPIC_API_KEY", models: [] },
        {
          vendor: "claude",
          provider: "foundry",
          secretRefs: ["ANTHROPIC_FOUNDRY_BASE_URL", "ANTHROPIC_FOUNDRY_API_KEY"],
          error: "",
          models: [{ id: "claude-haiku-4-5", displayName: "claude-haiku-4-5" }],
        },
      ],
    };

    expect(modelAvailability("claude-sonnet-5-5", [foundryCluster])).toEqual(false);
  });

  it("answers unverified for claude-sonnet-5-5 when a working claude entry lacks it beside a failed one, which may be the key that lists it", () => {
    const catalog: ModelCatalogStatus = { refreshedAt: "2026-11-28T10:00:00Z", vendors: [...catalogOf("claude", ["claude-haiku-4-5"]).vendors, ...catalogOf("claude", [], "team-b: HTTP 503").vendors] };

    expect(modelAvailability("claude-sonnet-5-5", [catalog])).toEqual("unverified");
  });
});
