import { describe, expect, it } from "vitest";
import { overBudget, proseWords } from "./word-budget.js";

const page = ["---", "title: The bag", "wordBudget: 5", "---", "", "## What it holds", "", "A run keeps `items` in [the bag](/floor/concepts/bag/).", "", "```yaml", "needs: [topic]", "```", "", "| Kind | Meaning |", "| --- | --- |", "| value | text |", "", "<!-- generated:fields:edge -->", "", "| a | b |", "", "<!-- /generated -->"].join("\n");

describe("proseWords", () => {
  it("counts the words a person reads, and not the frontmatter, code, tables, marks or link addresses", () => {
    expect(proseWords(page)).toEqual(10);
  });
});

describe("overBudget", () => {
  it("says by how much a page of 10 words is over its budget of 5", () => {
    expect(overBudget(page)).toEqual({ words: 10, budget: 5 });
  });

  it("says nothing for a page within its budget", () => {
    expect(overBudget(page.replace("wordBudget: 5", "wordBudget: 10"))).toBeUndefined();
  });

  it("says nothing for a page that sets no budget", () => {
    expect(overBudget(page.replace("wordBudget: 5\n", ""))).toBeUndefined();
  });
});
