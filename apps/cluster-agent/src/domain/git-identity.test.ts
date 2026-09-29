import { describe, expect, it } from "vitest";
import { environmentOf } from "./git-identity.js";
import type { BriefNeed } from "./need.js";

const WRITES: BriefNeed = { name: "target", kind: "git", path: "target", repoUrl: "https://github.com/re-cinq/floor", ref: "main", access: "write" };
const READS: BriefNeed = { ...WRITES, access: "read" };
const TOPIC: BriefNeed = { name: "topic", kind: "value", value: "girders" };

describe("environmentOf", () => {
  it("names Floor Agent as author and committer for a visit that may write to a repository", () => {
    expect(environmentOf([TOPIC, WRITES], undefined)).toEqual({
      GIT_AUTHOR_NAME: "Floor Agent",
      GIT_AUTHOR_EMAIL: "floor-agent@re-cinq.com",
      GIT_COMMITTER_NAME: "Floor Agent",
      GIT_COMMITTER_EMAIL: "floor-agent@re-cinq.com",
    });
  });

  it("keeps what the definition sets beside it", () => {
    expect(environmentOf([WRITES], { LORE_TEST_POLICY: "none" })).toMatchObject({ LORE_TEST_POLICY: "none", GIT_AUTHOR_NAME: "Floor Agent" });
  });

  it("lets the definition name someone else", () => {
    expect(environmentOf([WRITES], { GIT_AUTHOR_NAME: "Bender" })).toMatchObject({ GIT_AUTHOR_NAME: "Bender", GIT_COMMITTER_NAME: "Floor Agent" });
  });

  it("names nobody for a visit that only reads", () => {
    expect(environmentOf([READS], { LORE_TEST_POLICY: "none" })).toEqual({ LORE_TEST_POLICY: "none" });
  });

  it("sets nothing for a visit with no repository and no environment", () => {
    expect(environmentOf([TOPIC], undefined)).toBeUndefined();
  });
});
