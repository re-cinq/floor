import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { doublingBounds, foldHistogramRows, histogram } from "./metrics-sql.js";
import type { PgPool } from "./pg.js";
import { openTestPool } from "./test-database.js";

describe("foldHistogramRows", () => {
  it("adds code-review's run in the 60 bucket and its run in the 300 bucket up to 1 and 2, and merge's run past 300 to none", () => {
    const rows = [
      { line_id: "code-review", outcome: "success", bucket: 0, count: "1", sum: 50 },
      { line_id: "code-review", outcome: "success", bucket: 1, count: "1", sum: 200 },
      { line_id: "merge", outcome: "success", bucket: 2, count: "1", sum: 400 },
    ];

    expect(foldHistogramRows(rows, ["line_id", "outcome"], [60, 300])).toEqual([
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

describe("histogram", () => {
  let pool: PgPool;

  beforeAll(async () => {
    pool = await openTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("counts 0.05, 0.1, 0.3 and 5 seconds as 2, 2 and 3 under 0.1, 0.2 and 0.4, with 4 in total summing 5.45", async () => {
    const sample = `select seconds from (values (0.05::float8), (0.1), (0.3), (5)) as measured(seconds)`;

    expect(await histogram(pool, sample, [], [0.1, 0.2, 0.4])).toEqual([
      {
        labels: {},
        buckets: [
          { upTo: 0.1, count: 2 },
          { upTo: 0.2, count: 2 },
          { upTo: 0.4, count: 3 },
        ],
        sum: 5.45,
        count: 4,
      },
    ]);
  });

  it("keeps the merge line's one 90 second run apart from code-review's two of 30 seconds", async () => {
    const sample = `select line_id, seconds from (values ('code-review', 30::float8), ('code-review', 30), ('merge', 90)) as measured(line_id, seconds)`;

    expect(await histogram(pool, sample, ["line_id"], [60])).toEqual([
      { labels: { line_id: "code-review" }, buckets: [{ upTo: 60, count: 2 }], sum: 60, count: 2 },
      { labels: { line_id: "merge" }, buckets: [{ upTo: 60, count: 0 }], sum: 90, count: 1 },
    ]);
  });
});
