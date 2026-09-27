// One Kubernetes client per process, not one per call, and the namespace
// every custom resource and secret lives in. Ported and trimmed from lore's
// `@re-cinq/lore-cluster-agent` (outbound/kube-clients.ts): lore's
// `loadKube` picks between in-cluster config, a named kubeconfig file, and
// the default kubeconfig, by environment variable; kept as-is, since a dev
// machine (docs/dev_loop.md) and a real cluster need exactly that choice.

import {
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";

export function agentsNamespace(env: NodeJS.ProcessEnv = process.env): string {
  return env.FLOOR_AGENTS_NAMESPACE ?? "floor-agents";
}

export function loadKube(
  kc: Pick<KubeConfig, "loadFromCluster" | "loadFromFile" | "loadFromDefault">,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.FLOOR_KUBE_IN_CLUSTER === "1") {
    kc.loadFromCluster();

    return;
  }

  if (env.FLOOR_KUBECONFIG) {
    kc.loadFromFile(env.FLOOR_KUBECONFIG);

    return;
  }

  kc.loadFromDefault();
}

let config: KubeConfig | undefined;
let core: CoreV1Api | undefined;
let customObjects: CustomObjectsApi | undefined;

export function kubeConfig(): KubeConfig {
  if (!config) {
    config = new KubeConfig();
    loadKube(config);
  }

  return config;
}

export function coreApi(): CoreV1Api {
  return (core ??= kubeConfig().makeApiClient(CoreV1Api));
}

export function customObjectsApi(): CustomObjectsApi {
  return (customObjects ??= kubeConfig().makeApiClient(CustomObjectsApi));
}
