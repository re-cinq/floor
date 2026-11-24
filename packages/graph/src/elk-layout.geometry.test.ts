import { describe, it, expect } from "vitest";
import { layoutWithElk } from "./elk-layout";
import { linesOverLabels, linesThroughStations } from "./layout-geometry";
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
});
