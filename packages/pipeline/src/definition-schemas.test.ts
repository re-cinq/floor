import { describe, expect, it } from "vitest";
import { z } from "zod";
import { definitionSchemas } from "./definition-schemas.js";

function messagesOf(result: z.ZodSafeParseResult<unknown>) {
  const issues = result.error?.issues ?? [];

  return issues.map((issue) => issue.message);
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
});
