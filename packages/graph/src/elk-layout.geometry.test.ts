import { describe, it, expect } from "vitest";
import { layoutWithElk } from "./elk-layout";
import { linesOverLabels, linesThroughStations, tinyTurns } from "./layout-geometry";
import { codeReviewDefinition, implementationDefinition, featurePlanningDefinition } from "./definition.fixtures";

const realDefinitions = [
  { name: "codeReviewDefinition", definition: codeReviewDefinition },
  { name: "implementationDefinition", definition: implementationDefinition },
  { name: "featurePlanningDefinition", definition: featurePlanningDefinition },
];

describe("layoutWithElk geometry", () => {
  it.each(realDefinitions)("routes no line of $name through a station", async ({ definition }) => {
    expect(linesThroughStations(await layoutWithElk(definition))).toEqual([]);
  });

  it.each(realDefinitions)("draws no line of $name over a label", async ({ definition }) => {
    expect(linesOverLabels(await layoutWithElk(definition))).toEqual([]);
  });

  it.each(realDefinitions)("makes no turn under 16 px in $name", async ({ definition }) => {
    expect(tinyTurns(await layoutWithElk(definition), 16)).toEqual([]);
  });

  it.each(realDefinitions)("puts the entry of $name in the first column", async ({ definition }) => {
    const { nodes } = await layoutWithElk(definition);
    const centreXs = nodes.map((node) => node.x);
    const entry = nodes.find((node) => node.id === definition.entry);

    expect(entry && entry.x).toEqual(Math.min(...centreXs));
  });

  it.each(realDefinitions)("lays out $name the same on every run", async ({ definition }) => {
    expect(await layoutWithElk(definition)).toEqual(await layoutWithElk(definition));
  });
});
