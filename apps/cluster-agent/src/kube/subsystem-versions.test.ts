import { describe, expect, it } from "vitest";
import { readSubsystemVersions, type ConfigMapReader } from "./subsystem-versions.js";

function holding(entries: Record<string, string>): ConfigMapReader {
  return { readNamespacedConfigMap: () => Promise.resolve({ data: entries }) };
}

const refusing: ConfigMapReader = { readNamespacedConfigMap: () => Promise.reject(Object.assign(new Error("forbidden"), { code: 403 })) };

describe("readSubsystemVersions", () => {
  it("reads version 0.19.0 and each vendor's CLI pin out of agent-subsystem-versions", async () => {
    const reader = holding({ version: "0.19.0", "claude-cli": "2.1.311", "codex-cli": "0.167.1", "gemini-cli": "0.62.0", "opencode-cli": "1.2.0" });

    expect(await readSubsystemVersions(reader, "ai-agents")).toEqual({
      version: "0.19.0",
      clis: { claude: "2.1.311", codex: "0.167.1", gemini: "0.62.0", opencode: "1.2.0" },
    });
  });

  it("answers null when the ConfigMap cannot be read", async () => {
    expect(await readSubsystemVersions(refusing, "ai-agents")).toBeNull();
  });

  it("answers null for a ConfigMap with no version", async () => {
    expect(await readSubsystemVersions(holding({ "claude-cli": "2.1.311" }), "ai-agents")).toBeNull();
  });
});
