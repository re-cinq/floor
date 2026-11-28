// Pure: whether a model is offered by the clusters, from what each cluster's model catalog last reported.

import type { CatalogVendor, ModelCatalogStatus } from "@re-cinq/floor-contracts";

type Availability = true | false | "unverified";

const OPENAI_PREFIXES = ["gpt", "o1", "o3", "o4"];

export function modelAvailability(model: string, catalogs: (ModelCatalogStatus | null)[]): Availability {
  const vendor = vendorOf(model);
  if (vendor === null) return "unverified";
  const answers = catalogs.map((catalog) => availabilityInCatalog(model, vendor, catalog));
  if (answers.some((answer) => answer === true)) return true;
  if (answers.length > 0 && answers.every((answer) => answer === false)) return false;

  return "unverified";
}

function availabilityInCatalog(model: string, vendor: string, catalog: ModelCatalogStatus | null): Availability {
  const entries = decidingEntries((catalog?.vendors ?? []).filter((entry) => entry.vendor === vendor));
  if (entries.length === 0) return "unverified";
  if (entries.some((entry) => entry.models.some((listed) => listed.id === model))) return true;
  if (entries.some((entry) => entry.error !== "")) return "unverified";

  return false;
}

// A cluster with AGENT_PROVIDER=foundry runs the vendor's CLI on Foundry, so its foundry entries alone say what it can run.
function decidingEntries(entries: CatalogVendor[]): CatalogVendor[] {
  const onFoundry = entries.filter((entry) => entry.provider === "foundry");

  return onFoundry.length > 0 ? onFoundry : entries;
}

function vendorOf(model: string): string | null {
  if (model.includes("gemini")) return "gemini";
  if (model.includes("codex") || OPENAI_PREFIXES.some((prefix) => model.startsWith(prefix))) return "codex";
  if (model.startsWith("claude")) return "claude";

  return null;
}
