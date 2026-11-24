import { describe, expect, it } from "vitest";
import { fieldTable, tableAt } from "./field-table.js";
import { TABLES, reference } from "./reference.js";

const made = reference();

describe("reference", () => {
  it("has a field table with a described row for every name in TABLES", () => {
    const undescribed = Object.entries(TABLES).flatMap(([name, [root, ...steps]]) =>
      fieldTable(tableAt(made[root], steps))
        .split("\n")
        .filter((row) => row.endsWith("|  |"))
        .map((row) => `${name}: ${row}`),
    );

    expect(undescribed).toEqual([]);
  });

  it("spells an edge's fields as the file does", () => {
    expect(Object.keys(tableAt(made.pipeline, ["line", "edges", "[]"]).properties ?? {})).toEqual(["from", "to", "on", "iteration_max", "unattended_max"]);
  });

  it("puts the line's id first and requires it", () => {
    const line = tableAt(made.pipeline, ["line"]);

    expect({ first: Object.keys(line.properties ?? {})[0], required: line.required }).toEqual({ first: "id", required: ["id", "entry", "exit", "args", "nodes", "edges"] });
  });

  it("writes a line's file as its content, where the floor takes its hash", () => {
    expect(tableAt(made.pipeline, ["line", "files", "*"]).anyOf).toHaveLength(2);
  });

  it("refuses a key a station does not have, and takes any key in an agent's config", () => {
    expect({ station: tableAt(made.pipeline, ["stations", "*"]).additionalProperties, config: tableAt(made.agent, ["config"]).additionalProperties }).toEqual({ station: false, config: {} });
  });

  it("gives an agent's config the fields the floor reads", () => {
    expect(Object.keys(tableAt(made.agent, ["config"]).properties ?? {})).toEqual(["skills", "skills_source", "mcp_servers", "disallowed_tools", "env", "permission_mode", "max_turns", "model_secret_key", "pod_resources"]);
  });
});
