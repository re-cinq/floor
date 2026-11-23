import { describe, it, expect } from "vitest";
import type { NodeNeed } from "@protocol";
import { coverageSentence } from "./need-coverage-wording";

describe("coverageSentence", () => {
  it.each<{ title: string; coverage: NodeNeed["coverage"]; sentence: string }>([
    {
      title: "words a filled need by its producers",
      coverage: { kind: "filled", producedBy: ["triage", "plan"] },
      sentence: "filled by triage, plan",
    },
    { title: "words a seeded need as given at run start", coverage: { kind: "seeded" }, sentence: "given when the run starts" },
    {
      title: "words a sometimes-empty need by its producers and the path without them",
      coverage: { kind: "sometimes-empty", producedBy: ["triage"], pathWithout: ["start", "skip", "join"] },
      sentence: "filled by triage, but empty on the path start > skip > join",
    },
    {
      title: "words a never-filled need as produced by nothing before the node",
      coverage: { kind: "never-filled" },
      sentence: "never filled: nothing before this node produces it",
    },
    {
      title: "words an own-start need as given when the node starts on its own",
      coverage: { kind: "own-start" },
      sentence: "must be given when this node is started on its own",
    },
    {
      title: "words a git-unseeded need as a checkout no line argument provides",
      coverage: { kind: "git-unseeded" },
      sentence: "a git checkout no line argument provides",
    },
    { title: "words an optional need as optional", coverage: { kind: "optional" }, sentence: "optional" },
    {
      title: "words a floor-filled need as filled by floor on a retry or fan-out",
      coverage: { kind: "floor-filled" },
      sentence: "filled by floor on a retry or fan-out",
    },
    {
      title: "words a collected need as collected from the fan-out branches",
      coverage: { kind: "collected" },
      sentence: "collected from the fan-out branches",
    },
  ])("$title", ({ coverage, sentence }) => {
    expect(coverageSentence(coverage)).toBe(sentence);
  });
});
