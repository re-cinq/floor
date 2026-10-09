import { describe, expect, it } from "vitest";
import { doublingBounds, foldHistogramRows } from "./metrics-sql.js";

describe("foldHistogramRows", () => {
  it("folds two bucket rows of the code-review/success tuple into one series with both buckets", () => {
    const rows = [
      { line_id: "code-review", outcome: "success", bound: 60, count: "1", sum: 250, total: "2" },
      { line_id: "code-review", outcome: "success", bound: 300, count: "2", sum: 250, total: "2" },
      { line_id: "merge", outcome: "success", bound: 60, count: "0", sum: 400, total: "1" },
      { line_id: "merge", outcome: "success", bound: 300, count: "0", sum: 400, total: "1" },
    ];

    expect(foldHistogramRows(rows, ["line_id", "outcome"])).toEqual([
      { labels: { line_id: "code-review", outcome: "success" }, buckets: [{ upTo: 60, count: 1 }, { upTo: 300, count: 2 }], sum: 250, count: 2 },
      { labels: { line_id: "merge", outcome: "success" }, buckets: [{ upTo: 60, count: 0 }, { upTo: 300, count: 0 }], sum: 400, count: 1 },
    ]);
  });
});

describe("doublingBounds", () => {
  it("gives 10, 20, 40, 80 for four steps from 10", () => {
    expect(doublingBounds(10, 4)).toEqual([10, 20, 40, 80]);
  });
});
