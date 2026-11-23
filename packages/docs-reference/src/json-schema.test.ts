import { describe, expect, it } from "vitest";
import { respelled } from "./json-schema.js";

describe("respelled", () => {
  it("renames a field and its entry in required, at any depth", () => {
    const schema = { type: "object", properties: { edges: { type: "array", items: { type: "object", properties: { iterationMax: { type: "integer" }, on: { type: "string" } }, required: ["on", "iterationMax"] } } } };

    expect(respelled(schema, { iterationMax: "iteration_max" })).toEqual({
      type: "object",
      properties: { edges: { type: "array", items: { type: "object", properties: { iteration_max: { type: "integer" }, on: { type: "string" } }, required: ["on", "iteration_max"] } } },
    });
  });

  it("leaves a value of the same text as a renamed field alone", () => {
    expect(respelled({ enum: ["iterationMax"], description: "iterationMax" }, { iterationMax: "iteration_max" })).toEqual({ enum: ["iterationMax"], description: "iterationMax" });
  });
});
