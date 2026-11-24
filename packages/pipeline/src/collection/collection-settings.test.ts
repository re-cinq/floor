import { describe, expect, it } from "vitest";
import { collectionSettingsOf } from "./collection-settings.js";

describe("collectionSettingsOf", () => {
  it("returns no host keys and no groups for empty text", () => {
    expect(collectionSettingsOf("")).toEqual({ hostKeys: [], groups: [] });
  });

  it("returns host key execution_mode and groups stock then ours as written", () => {
    expect(collectionSettingsOf("host_keys: [execution_mode]\ngroups:\n  - stock\n  - ours\n")).toEqual({
      hostKeys: ["execution_mode"],
      groups: ["stock", "ours"],
    });
  });

  it.each([["groups: stock\n"], ["groups: [stock, stock]\n"], ["groups: [stock, 7]\n"], ["groups: [stock/ours]\n"]])("refuses the settings %j, since groups is not a list of distinct folder names", (text) => {
    expect(() => collectionSettingsOf(text)).toThrow(new Error("floor-collection.yaml: groups is a list of distinct folder names"));
  });
});
