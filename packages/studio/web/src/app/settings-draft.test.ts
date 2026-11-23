import { describe, expect, it } from "vitest";
import { settingsDraft } from "./settings-draft";

const ORIGINAL = { settings: { image: "acme/agent:2", timeout_minutes: 10 }, version: "v1" };

describe("hasEdits", () => {
  it("is false when timeout_minutes 10 is edited to '11' and back to '10'", () => {
    const started = settingsDraft.startDraft(ORIGINAL);
    const changed = settingsDraft.edit(started, { ...started.text, timeout_minutes: "11" });
    const restored = settingsDraft.edit(changed, { ...changed.text, timeout_minutes: "10" });

    expect(settingsDraft.hasEdits(restored)).toBe(false);
  });
});

describe("hasDiskVersion", () => {
  it("is false when the same nested config arrives again in a fresh object", () => {
    const started = settingsDraft.startDraft({
      settings: { image: "acme/agent:2", config: { env: { LOG: "debug" } } },
      version: "v1",
    });
    const edited = settingsDraft.edit(started, { ...started.text, image: "acme/agent:3" });
    const received = settingsDraft.receive(edited, {
      settings: { image: "acme/agent:2", config: { env: { LOG: "debug" } } },
      version: "v1",
    });

    expect(settingsDraft.hasDiskVersion(received)).toBe(false);
  });
});
