import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss, { type AtRule, type Declaration, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const OPEN_BOX = '.node[data-open="true"] .box';

function openBoxDeclarations(): Record<string, string> {
  const declarations: Record<string, string> = {};

  stylesheet().walkRules((rule: Rule) => {
    if (rule.selector !== OPEN_BOX || rule.parent?.type === "atrule") return;
    rule.walkDecls((declaration: Declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });

  return declarations;
}

function keyframeOffsets(name: string): string[] {
  const offsets: string[] = [];

  stylesheet().walkAtRules("keyframes", (keyframes: AtRule) => {
    if (keyframes.params !== name) return;
    keyframes.walkDecls("stroke-dashoffset", (declaration) => {
      offsets.push(declaration.value);
    });
  });

  return offsets;
}

describe("an open station's border", () => {
  it("marches its 6 4 dashes one period, -10, around the box on every beat", () => {
    const { "stroke-dasharray": dasharray, animation = "" } = openBoxDeclarations();
    const [name] = animation.split(" ");

    expect({ dasharray, offsets: keyframeOffsets(name) }).toEqual({ dasharray: "6 4", offsets: ["-10"] });
  });
});

function stylesheet() {
  return postcss.parse(readFileSync(fileURLToPath(new URL("./run-graph.module.css", import.meta.url)), "utf8"));
}
