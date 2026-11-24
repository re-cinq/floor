import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const STYLESHEETS = ["run-graph.module.css", "viewport.module.css"];

function impureSelectorsOf(file: string): string[] {
  const css = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
  const rules: Rule[] = [];

  postcss.parse(css).walkRules((rule) => {
    rules.push(rule);
  });

  return rules
    .filter((rule) => !isKeyframeStep(rule))
    .flatMap((rule) => rule.selectors)
    .filter((selector) => !/\.[A-Za-z_-]/.test(selector));
}

function isKeyframeStep(rule: Rule): boolean {
  return rule.parent?.type === "atrule" && /keyframes$/.test((rule.parent as { name: string }).name);
}

describe("the package's CSS modules", () => {
  it("name a class of their own in every selector of run-graph.module.css and viewport.module.css", () => {
    expect(STYLESHEETS.flatMap(impureSelectorsOf)).toEqual([]);
  });
});
