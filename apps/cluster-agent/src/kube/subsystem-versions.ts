// What agent subsystem this cluster runs, read from the `agent-subsystem-versions` ConfigMap its chart publishes; a ConfigMap the agent cannot read is no answer, never an error, so registering never waits on it.

import { coreApi } from "./clients.js";
import type { SubsystemVersions } from "@re-cinq/floor-contracts";

export const SUBSYSTEM_VERSIONS_CONFIGMAP = "agent-subsystem-versions";

const CLI_VENDORS = ["claude", "codex", "gemini", "opencode"];

export interface ConfigMapReader {
  readNamespacedConfigMap(args: { name: string; namespace: string }): Promise<{ data?: Record<string, string> }>;
}

export async function readSubsystemVersions(reader: ConfigMapReader, namespace: string): Promise<SubsystemVersions | null> {
  const entries = await reader
    .readNamespacedConfigMap({ name: SUBSYSTEM_VERSIONS_CONFIGMAP, namespace })
    .then((configMap) => configMap.data ?? {})
    .catch(() => ({}) as Record<string, string>);

  if (!entries.version) return null;
  const pinned = CLI_VENDORS.filter((vendor) => entries[`${vendor}-cli`]);

  return { version: entries.version, clis: Object.fromEntries(pinned.map((vendor) => [vendor, entries[`${vendor}-cli`]])) };
}

/** Reads the ConfigMap from the namespace the subsystem runs in, through the process's one kube client. */
export function subsystemReader(namespace: string): () => Promise<SubsystemVersions | null> {
  return () => readSubsystemVersions(coreApi() as unknown as ConfigMapReader, namespace);
}
