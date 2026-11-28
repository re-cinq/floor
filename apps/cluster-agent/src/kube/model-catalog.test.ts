import { describe, expect, it } from "vitest";
import { readModelCatalog, type CatalogReader, type ModelCatalogStatus } from "./model-catalog.js";

describe("readModelCatalog", () => {
  it("reads the status of ModelCatalog default, refreshed 2026-11-28T09:00:00Z with gemini-2.5-flash, out of ai-agents", async () => {
    const status: ModelCatalogStatus = {
      refreshedAt: "2026-11-28T09:00:00Z",
      vendors: [
        {
          vendor: "gemini",
          provider: "vertex",
          secretRefs: ["GEMINI_API_KEY"],
          error: "",
          models: [{ id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }],
        },
      ],
    };
    const asked: Parameters<CatalogReader["getNamespacedCustomObject"]>[0][] = [];
    const reader: CatalogReader = {
      getNamespacedCustomObject: (args) => {
        asked.push(args);

        return Promise.resolve({ status });
      },
    };

    expect({ read: await readModelCatalog(reader, "ai-agents"), asked }).toEqual({
      read: status,
      asked: [{ group: "agents.re-cinq.com", version: "v1beta1", namespace: "ai-agents", plural: "modelcatalogs", name: "default" }],
    });
  });
});
