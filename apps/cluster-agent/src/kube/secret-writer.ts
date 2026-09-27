// Adds or removes a single key in a Kubernetes Secret without disturbing
// its other keys — how a visit's git token or model API key lands in
// `agent-secrets` before the Agent CR references it, and how it is removed
// once the visit reports. Ported from lore's `@re-cinq/lore-cluster-agent`
// (outbound/kube-token-provisioner.ts, `KubeSecretKeyWriter`); the token
// itself is minted elsewhere (the git-credential exchange is an HTTP concern
// on the Floor, docs/api_sketch.md — this is only the Kubernetes write).

import { isConflict } from "../lib/k8s-errors.js";
import { agentsNamespace, coreApi } from "./clients.js";

export interface SecretKeyWriter {
  setKey(secret: string, key: string, value: string): Promise<void>;
  deleteKey(secret: string, key: string): Promise<void>;
}

/** The two Secret calls the writer makes; `metadata` carries `resourceVersion`, which is how the apiserver decides the optimistic-concurrency race. */
export interface SecretMutation {
  metadata?: { resourceVersion?: string };
  data?: Record<string, string>;
}

export interface NamespacedName {
  name: string;
  namespace: string;
}

export interface SecretReplacement extends NamespacedName {
  body: SecretMutation;
}

export interface SecretClient {
  readNamespacedSecret(args: NamespacedName): Promise<SecretMutation>;
  replaceNamespacedSecret(args: SecretReplacement): Promise<unknown>;
}

export type SecretClientFactory = () => SecretClient;

export class KubeSecretKeyWriter implements SecretKeyWriter {
  constructor(
    private readonly namespace: string = agentsNamespace(),
    private readonly core: SecretClientFactory = coreApi as unknown as SecretClientFactory,
  ) {}

  setKey(secret: string, key: string, value: string): Promise<void> {
    return this.mutate(secret, (entries) => {
      entries[key] = Buffer.from(value, "utf8").toString("base64");
    });
  }

  deleteKey(secret: string, key: string): Promise<void> {
    return this.mutate(secret, (entries) => {
      delete entries[key];
    });
  }

  // One read-modify-replace. Rereads every time it is called, which is the
  // point: a concurrent write bumps resourceVersion, the replace 409s, and
  // retrying against a stale copy would drop whichever key the other writer
  // had just added.
  private async mutateOnce(
    secret: string,
    change: (data: Record<string, string>) => void,
  ): Promise<void> {
    const core = this.core();
    const current = await core.readNamespacedSecret({
      name: secret,
      namespace: this.namespace,
    });
    const entries = (current.data ?? {}) as Record<string, string>;

    change(entries);
    current.data = entries;

    await core.replaceNamespacedSecret({
      name: secret,
      namespace: this.namespace,
      body: current,
    });
  }

  private async mutate(
    secret: string,
    change: (data: Record<string, string>) => void,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.mutateOnce(secret, change);

        return;
      } catch (err) {
        if (isConflict(err) && attempt < 4) {
          continue;
        }
        throw err;
      }
    }
  }
}
