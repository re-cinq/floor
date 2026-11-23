import { describe, expect, it } from "vitest";
import { fieldTable, tableAt } from "./field-table.js";

const edge = {
  type: "object",
  properties: {
    from: { type: "string", description: "The node the edge leaves." },
    on: { enum: ["success", "always"], description: "The outcome | or any." },
    iteration_max: { type: "integer", exclusiveMinimum: 0, description: "How often." },
  },
  required: ["from", "on"],
};

describe("fieldTable", () => {
  it("writes one row for each field, with its type, whether it is required and its description", () => {
    expect(fieldTable(edge)).toEqual(
      [
        "| Field | Type | Required | Description |",
        "| --- | --- | --- | --- |",
        "| `from` | string | yes | The node the edge leaves. |",
        "| `on` | `success` or `always` | yes | The outcome \\| or any. |",
        "| `iteration_max` | integer above 0 | no | How often. |",
      ].join("\n"),
    );
  });

  it.each([
    [{ type: "array", items: { type: "string" } }, "list of string"],
    [{ type: "object", additionalProperties: { type: "number", minimum: 0 } }, "map of number, 0 or more"],
    [{ type: "object", properties: {} }, "object"],
    [{ type: ["string", "number", "boolean"] }, "string, number or boolean"],
    [{ const: "output" }, "`output`"],
    [{ type: "string", format: "uri" }, "URL"],
    [{ anyOf: [{ type: "string" }, { type: "object", properties: {} }] }, "string or object"],
    [{ type: "object", additionalProperties: {} }, "map of anything"],
  ])("names the type of %j as %s", (field, named) => {
    expect(fieldTable({ type: "object", properties: { field } })).toContain(`| \`field\` | ${named} | no |`);
  });

  it("refuses a schema that is not an object with fields", () => {
    expect(() => fieldTable({ type: "string" })).toThrow(new Error("a field table is of an object with properties"));
  });
});

describe("tableAt", () => {
  const file = { type: "object", properties: { line: { type: "object", properties: { edges: { type: "array", items: edge }, args: { type: "object", additionalProperties: edge } } } } };

  it("finds the entries of a list under []", () => {
    expect(tableAt(file, ["line", "edges", "[]"])).toEqual(edge);
  });

  it("finds the values of a map under *", () => {
    expect(tableAt(file, ["line", "args", "*"])).toEqual(edge);
  });

  it("refuses a step the schema does not have", () => {
    expect(() => tableAt(file, ["line", "nodes"])).toThrow(new Error("the schema has no nodes at line.nodes"));
  });
});
