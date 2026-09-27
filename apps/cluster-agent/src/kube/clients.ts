// One Kubernetes client per process, and the namespace every resource lives in; trimmed from lore's kube-clients.ts. See ../../README.md.

import {
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";

export function agentsNamespace(env: NodeJS.ProcessEnv = process.env): string {
  return env.FLOOR_AGENTS_NAMESPACE ?? "floor-agents";
}

export function loadKube(
  kubeConfigLoader: Pick<KubeConfig, "loadFromCluster" | "loadFromFile" | "loadFromDefault">,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.FLOOR_KUBE_IN_CLUSTER === "1") {
    kubeConfigLoader.loadFromCluster();

    return;
  }

  if (env.FLOOR_KUBECONFIG) {
    kubeConfigLoader.loadFromFile(env.FLOOR_KUBECONFIG);

    return;
  }

  kubeConfigLoader.loadFromDefault();
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
