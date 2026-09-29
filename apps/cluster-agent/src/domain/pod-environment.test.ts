import { describe, expect, it } from "vitest";
import type { BriefNeed } from "./need.js";
import { environmentOf } from "./pod-environment.js";

const WRITES: BriefNeed = { name: "target", kind: "git", path: "target", repoUrl: "https://github.com/re-cinq/floor", ref: "main", access: "write" };
const TOPIC: BriefNeed = { name: "topic", kind: "value", value: "girders" };

describe("environmentOf", () => {
  it("tells a gemini-3.1-pro-preview pod to trust its workspace", () => {
    expect(environmentOf({ needs: [TOPIC], model: "gemini-3.1-pro-preview" })).toEqual({ GEMINI_CLI_TRUST_WORKSPACE: "true" });
  });

  it("tells a claude-sonnet-4-6 pod nothing of Gemini", () => {
    expect(environmentOf({ needs: [TOPIC], model: "claude-sonnet-4-6" })).toBeUndefined();
  });

  it("names Floor Agent as author and committer for a visit that may write to a repository", () => {
    expect(environmentOf({ needs: [TOPIC, WRITES], model: "claude-sonnet-4-6" })).toEqual({
      GIT_AUTHOR_NAME: "Floor Agent",
      GIT_AUTHOR_EMAIL: "floor-agent@re-cinq.com",
      GIT_COMMITTER_NAME: "Floor Agent",
      GIT_COMMITTER_EMAIL: "floor-agent@re-cinq.com",
    });
  });

  it("names nobody for a visit that only reads", () => {
    expect(environmentOf({ needs: [{ ...WRITES, access: "read" }], model: "claude-sonnet-4-6" })).toBeUndefined();
  });

  it("keeps what the definition sets beside what it is told", () => {
    const told = environmentOf({ needs: [WRITES], model: "gemini-3.1-pro-preview", defined: { LORE_TEST_POLICY: "none" } });

    expect(told).toMatchObject({ LORE_TEST_POLICY: "none", GIT_AUTHOR_NAME: "Floor Agent", GEMINI_CLI_TRUST_WORKSPACE: "true" });
  });

  it("lets the definition name someone else", () => {
    expect(environmentOf({ needs: [WRITES], defined: { GIT_AUTHOR_NAME: "Bender" } })).toMatchObject({ GIT_AUTHOR_NAME: "Bender", GIT_COMMITTER_NAME: "Floor Agent" });
  });

  it("sets nothing for a visit with no repository, no model and no environment", () => {
    expect(environmentOf({ needs: [TOPIC] })).toBeUndefined();
  });
});
