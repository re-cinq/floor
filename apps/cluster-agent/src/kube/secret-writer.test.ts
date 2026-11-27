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

describe("KubeSecretKeyWriter.replaceKeys", () => {
  async function replaced(held: Record<string, string>, entries: Record<string, string>): Promise<{ sent: Record<string, string> | undefined; writes: number }> {
    let sent: Record<string, string> | undefined;
    let writes = 0;
    const core = fakeCore({
      readNamespacedSecret: () => Promise.resolve({ data: { ...held } }),
      replaceNamespacedSecret: (args) => {
        sent = args.body.data;
        writes += 1;

        return Promise.resolve({});
      },
    });

    await new KubeSecretKeyWriter("floor-agents", () => core).replaceKeys("agent-secrets", "visit-v1-gateway-token.", entries);

    return { sent, writes };
  }

  const HELD = { "visit-v1-token": "a2VlcA==", "visit-v2-gateway-token.search": "a2VlcA==", "visit-v1-gateway-token.search": "b2xk", "visit-v1-gateway-token.gone": "b2xk" };

  it("sets the new entries base64-encoded and drops every other key under the prefix, in one write that leaves the rest untouched", async () => {
    const outcome = await replaced(HELD, { "visit-v1-gateway-token.search": "Bearer jwt-new" });

    expect(outcome).toEqual({
      sent: { "visit-v1-token": "a2VlcA==", "visit-v2-gateway-token.search": "a2VlcA==", "visit-v1-gateway-token.search": Buffer.from("Bearer jwt-new", "utf8").toString("base64") },
      writes: 1,
    });
  });

  it("only removes the keys under the prefix when given no entries", async () => {
    const outcome = await replaced(HELD, {});

    expect(outcome.sent).toEqual({ "visit-v1-token": "a2VlcA==", "visit-v2-gateway-token.search": "a2VlcA==" });
  });
});
