// Adds or removes one key in a Kubernetes Secret without disturbing its other keys; ported from lore's KubeSecretKeyWriter. See ../../README.md.

import { isConflict } from "../lib/k8s-errors.js";
import { agentsNamespace, coreApi } from "./clients.js";

const MAX_CONFLICT_RETRIES = 4;

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

  // Retries the read-modify-replace on a conflict, so a concurrent writer's key is never dropped.
  private async mutate(
    secret: string,
    change: (data: Record<string, string>) => void,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const done = await this.attemptMutate(secret, change, attempt);

      if (done) return;
    }
  }

  // One read-modify-replace attempt; rereads every time, since a concurrent write bumps resourceVersion and retrying against a stale copy would drop whichever key the other writer had just added.
  private async attemptMutate(
    secret: string,
    change: (data: Record<string, string>) => void,
    attempt: number,
  ): Promise<boolean> {
    try {
      await this.replaceOnce(secret, change);

      return true;
    } catch (err) {
      if (isConflict(err) && attempt < MAX_CONFLICT_RETRIES) return false;
      throw err;
    }
  }

  private async replaceOnce(
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
}
