import { describe, expect, it } from "vitest";
import { z } from "zod";
import { definitionSchemas } from "./definition-schemas.js";

function messagesOf(result: z.ZodSafeParseResult<unknown>) {
  const issues = result.error?.issues ?? [];

  return issues.map((issue) => issue.message);
}

const OUTPUT_ONLY_FOR_A_FILE = "from: output is for a file, and takes no path";

function messagesOfStationProducing(produce: Record<string, string>) {
  const station = { kind: "service", outcomes: ["success"], needs: [], produces: [produce] };

  return messagesOf(definitionSchemas(z.object).stationBodySchema.safeParse(station));
}

describe("stationBodySchema", () => {
  it("refuses a need that is fresh and collects", () => {
    const station = {
      kind: "service",
      outcomes: ["success"],
      needs: [{ name: "reports", kind: "value", collect: "report", fresh: true }],
      produces: [],
    };

    const result = definitionSchemas(z.object).stationBodySchema.safeParse(station);

    expect(messagesOf(result)).toEqual(["fresh is for a bag item, and takes no collect"]);
  });

  it("refuses a value produce taken from the output", () => {
    const messages = messagesOfStationProducing({ name: "summary", kind: "value", from: "output" });

    expect(messages).toEqual([OUTPUT_ONLY_FOR_A_FILE]);
  });

  it("refuses a file produce taken from the output that names path summary.md", () => {
    const messages = messagesOfStationProducing({ name: "summary", kind: "file", from: "output", path: "summary.md" });

    expect(messages).toEqual([OUTPUT_ONLY_FOR_A_FILE]);
  });

  it("accepts a file produce taken from the output with no path", () => {
    const messages = messagesOfStationProducing({ name: "summary", kind: "file", from: "output" });

    expect(messages).toEqual([]);
  });
});
