import { describe, expect, it, vi } from "vitest";
import { KubeSecretKeyWriter, type SecretClient } from "./secret-writer.js";

function fakeCore(overrides: Partial<SecretClient> = {}): SecretClient {
  return {
    readNamespacedSecret: vi.fn(() => Promise.resolve({ data: {} })),
    replaceNamespacedSecret: vi.fn(() => Promise.resolve({})),
    ...overrides,
  } as SecretClient;
}

describe("KubeSecretKeyWriter.setKey", () => {
  it("base64-encodes the value into the named key, leaving other keys untouched", async () => {
    let sent: Record<string, string> | undefined;
    const core = fakeCore({
      readNamespacedSecret: () =>
        Promise.resolve({ data: { other: "dW50b3VjaGVk" } }),
      replaceNamespacedSecret: (args) => {
        sent = args.body.data;

        return Promise.resolve({});
      },
    });

    await new KubeSecretKeyWriter("floor-agents", () => core).setKey(
      "agent-secrets",
      "GH_TOKEN_abc",
      "ghs_livetoken",
    );

    expect(sent).toEqual({
      other: "dW50b3VjaGVk",
      GH_TOKEN_abc: Buffer.from("ghs_livetoken", "utf8").toString("base64"),
    });
  });

  it("retries the read-modify-replace on a conflict, so a concurrent writer's key is not dropped", async () => {
    let attempts = 0;
    const core = fakeCore({
      readNamespacedSecret: () => Promise.resolve({ data: {} }),
      replaceNamespacedSecret: () => {
        attempts += 1;

        return attempts < 3 ? Promise.reject({ code: 409 }) : Promise.resolve({});
      },
    });

    await new KubeSecretKeyWriter("floor-agents", () => core).setKey(
      "agent-secrets",
      "k",
      "v",
    );

    expect(attempts).toBe(3);
  });

  it("gives up after five attempts and rethrows the conflict", async () => {
    const core = fakeCore({
      replaceNamespacedSecret: () => Promise.reject({ code: 409 }),
    });

    await expect(
      new KubeSecretKeyWriter("floor-agents", () => core).setKey("agent-secrets", "k", "v"),
    ).rejects.toMatchObject({ code: 409 });
  });

  it("rethrows a non-conflict failure immediately", async () => {
    const core = fakeCore({ replaceNamespacedSecret: () => Promise.reject({ code: 403 }) });

    await expect(
      new KubeSecretKeyWriter("floor-agents", () => core).setKey("agent-secrets", "k", "v"),
    ).rejects.toMatchObject({ code: 403 });
  });

  it("never retries a non-conflict failure", async () => {
    let attempts = 0;
    const core = fakeCore({
      replaceNamespacedSecret: () => {
        attempts += 1;

        return Promise.reject({ code: 403 });
      },
    });

    await new KubeSecretKeyWriter("floor-agents", () => core)
      .setKey("agent-secrets", "k", "v")
      .catch(() => undefined);

    expect(attempts).toBe(1);
  });
});

describe("KubeSecretKeyWriter.deleteKey", () => {
  it("removes only the named key", async () => {
    let sent: Record<string, string> | undefined;
    const core = fakeCore({
      readNamespacedSecret: () =>
        Promise.resolve({ data: { keep: "a2VlcA==", drop: "ZHJvcA==" } }),
      replaceNamespacedSecret: (args) => {
        sent = args.body.data;

        return Promise.resolve({});
      },
    });

    await new KubeSecretKeyWriter("floor-agents", () => core).deleteKey(
      "agent-secrets",
      "drop",
    );

    expect(sent).toEqual({ keep: "a2VlcA==" });
  });
});
