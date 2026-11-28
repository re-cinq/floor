// The model catalog this cluster publishes as `ModelCatalog default`; a catalog the agent cannot read is no answer, never an error.

import type { ModelCatalogStatus } from "@re-cinq/floor-contracts";
import { customObjectsApi } from "./clients.js";

export type { ModelCatalogStatus };

export interface CatalogReader {
  getNamespacedCustomObject(args: { group: string; version: string; namespace: string; plural: string; name: string }): Promise<unknown>;
}

export async function readModelCatalog(reader: CatalogReader, namespace: string): Promise<ModelCatalogStatus | null> {
  const catalog = await reader
    .getNamespacedCustomObject({ group: "agents.re-cinq.com", version: "v1beta1", namespace, plural: "modelcatalogs", name: "default" })
    .catch(() => null);

  return (catalog as { status?: ModelCatalogStatus } | null)?.status ?? null;
}

/** Reads the catalog from the namespace the subsystem runs in, through the process's one kube client. */
export function catalogReader(namespace: string): () => Promise<ModelCatalogStatus | null> {
  return () => readModelCatalog(customObjectsApi() as unknown as CatalogReader, namespace);
}
