// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { closeStudios, openPage } from "./app-page.fixtures";
import { alertGone } from "./test-run-page.fixtures";

afterEach(closeStudios);

const [lineFile] = REVIEW_LOOP_COLLECTION;
const COLLECTION_PUSH_DELAY_MS = 60_000;
const RENAMED_LINE = lineFile.text.replace("id: review-loop", "id: review-loop-renamed");

describe("App test locally preview refusal", () => {
  it("clears the refusal once a later preview succeeds after the line file is restored", async () => {
    const { dir } = await openPage([...REVIEW_LOOP_COLLECTION], { hash: "&line=review-loop&test=new", watchDebounceMs: COLLECTION_PUSH_DELAY_MS });
    const linePath = join(dir, lineFile.path);
    const topic = await screen.findByRole("textbox", { name: "topic" });

    writeFileSync(linePath, RENAMED_LINE);
    await userEvent.type(topic, "t");
    await screen.findByRole("alert");
    writeFileSync(linePath, lineFile.text);
    await userEvent.type(topic, "i");

    expect({ alert: await alertGone() }).toEqual({ alert: null });
  });
});
