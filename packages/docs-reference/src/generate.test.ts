import { describe, expect, it } from "vitest";
import { regionOf, type Sources } from "./generate.js";

const edge = { type: "object", properties: { edges: { type: "array", items: { type: "object", properties: { on: { type: "string", description: "The outcome." } }, required: ["on"] } } } };
const sources: Sources = {
  reference: { pipeline: { type: "object", properties: { line: edge } }, agent: { type: "object", properties: {} } },
  example: (path) => `read from ${path}\n`,
};

describe("regionOf", () => {
  it("makes fields:edge the table of an edge's fields", () => {
    expect(regionOf("fields:edge", sources)).toContain("| `on` | string | yes | The outcome. |");
  });

  it("makes example:starter/hello/pipeline.yaml that file, fenced as yaml and titled by its path in the collection", () => {
    expect(regionOf("example:starter/hello/pipeline.yaml", sources)).toEqual('````yaml title="hello/pipeline.yaml"\nread from starter/hello/pipeline.yaml\n````');
  });

  it("fences an agent file as markdown", () => {
    expect(regionOf("example:starter/hello/agents/greeter.md", sources)).toContain('````markdown title="hello/agents/greeter.md"');
  });

  it("refuses a table it does not have", () => {
    expect(() => regionOf("fields:nope", sources)).toThrow(/^no field table is named "nope": pipeline, line, /);
  });

  it("refuses a region that is neither fields nor an example", () => {
    expect(() => regionOf("table:edge", sources)).toThrow(new Error('a generated region is fields:<table> or example:<path>, and not "table:edge"'));
  });
});
