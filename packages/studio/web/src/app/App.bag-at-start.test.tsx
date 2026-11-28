// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { closeStudios } from "./app-page.fixtures";
import { openStartScreen } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App test locally start screen", () => {
  it("lists topic as a subject value filled by API in the Bag at start table of review-loop", async () => {
    await openStartScreen();
    const table = await screen.findByRole("table", { name: "Bag at start" });

    const bag = within(table)
      .getAllByRole("row")
      .filter((row) => within(row).queryAllByRole("cell").length > 0)
      .map((row) => {
        const [name, kind, from] = within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent);

        return { name, kind, from };
      });

    expect(bag).toEqual([{ name: "topic subject", kind: "value", from: "by API" }]);
  });
});
