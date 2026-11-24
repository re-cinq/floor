import { describe, it, expect } from "vitest";
import { layoutWithElk } from "./elk-layout";
import { linesOverLabels, linesThroughStations, tinyTurns } from "./layout-geometry";
import { codeReviewDefinition, implementationDefinition, featurePlanningDefinition } from "./definition.fixtures";

const lines = [
  { name: "codeReviewDefinition", definition: codeReviewDefinition },
  { name: "implementationDefinition", definition: implementationDefinition },
  { name: "featurePlanningDefinition", definition: featurePlanningDefinition },
];

const realDefinitions = lines.flatMap(({ name, definition }) => [
  { name, definition, compact: false },
  { name: `${name} compact`, definition, compact: true },
]);

describe("layoutWithElk geometry", () => {
  it.each(realDefinitions)("routes no line of $name through a station", async ({ definition, compact }) => {
    expect(linesThroughStations(await layoutWithElk(definition, undefined, { compactStops: compact }))).toEqual([]);
  });

  it.each(realDefinitions)("draws no line of $name over a label", async ({ definition, compact }) => {
    expect(linesOverLabels(await layoutWithElk(definition, undefined, { compactStops: compact }))).toEqual([]);
  });

  it.each(realDefinitions)("makes no turn under 16 px in $name", async ({ definition, compact }) => {
    expect(tinyTurns(await layoutWithElk(definition, undefined, { compactStops: compact }), 16)).toEqual([]);
  });

  it.each(realDefinitions)("puts the entry of $name in the first column", async ({ definition, compact }) => {
    const { nodes } = await layoutWithElk(definition, undefined, { compactStops: compact });
    const centreXs = nodes.map((node) => node.x);
    const entry = nodes.find((node) => node.id === definition.entry);

    expect(entry && entry.x).toEqual(Math.min(...centreXs));
  });

  it.each(realDefinitions)("lays out $name the same on every run", async ({ definition, compact }) => {
    expect(await layoutWithElk(definition, undefined, { compactStops: compact })).toEqual(await layoutWithElk(definition, undefined, { compactStops: compact }));
  });
});
