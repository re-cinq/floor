import { describe, expect, it } from "vitest";
import { InvalidStart } from "./start-args.js";
import { REVIEW_LINE, setupStoreFixture, startItems } from "./assembly-run-store.fixtures.js";

const { store, definitions, seedReviewLine } = setupStoreFixture();
const repo = "github.com/re-cinq/lore";

describe("AssemblyRunStore.start against the line's args", () => {
  it("refuses a start naming every problem when repo has the wrong kind and pr_url is missing", async () => {
    await seedReviewLine();

    await expect(
      store().start({ lineId: "code-review", repo, startItems: { repo: { kind: "value", ref: "x", by: "start" } } }),
    ).rejects.toThrow(
      new InvalidStart([
        'startItems.repo: the line wants kind "git", got "value"',
        'startItems.pr_url: required by the line, as kind "value"',
      ]),
    );
  });

  it("keeps a start item the line does not declare in the run's bag", async () => {
    await seedReviewLine();
    const spec = { kind: "file", ref: "sha256-spec", by: "start" } as const;

    const { run } = await store().start({ lineId: "code-review", repo, startItems: { ...startItems(), spec } });

    expect((await store().bag(run.id)).spec).toEqual(spec);
  });

  it("joins the open run on the same subject when the start is valid", async () => {
    await seedReviewLine();
    const first = await store().start({ lineId: "code-review", repo, startItems: startItems() });

    const second = await store().start({ lineId: "code-review", repo, startItems: startItems() });

    expect({ id: second.run.id, joined: second.joined }).toEqual({ id: first.run.id, joined: true });
  });
});

async function seedPinnedVersionBehindALaterOne(): Promise<string> {
  await seedReviewLine();
  const pinned = await definitions().latest("line", "code-review");

  await definitions().put("line", "code-review", { ...REVIEW_LINE, args: { ...REVIEW_LINE.args, task_id: { kind: "value" } } });

  return pinned!.hash;
}

describe("AssemblyRunStore.start naming a line version", () => {
  it("writes a run referencing the pinned version, whose args the start satisfies though the latest wants more", async () => {
    const lineHash = await seedPinnedVersionBehindALaterOne();

    const { run } = await store().start({ lineId: "code-review", repo, startItems: startItems(), lineHash });

    expect(run.lineHash).toBe(lineHash);
  });

  it("refuses the same start against the latest, which also wants task_id", async () => {
    await seedPinnedVersionBehindALaterOne();

    await expect(store().start({ lineId: "code-review", repo, startItems: startItems() })).rejects.toThrow(
      new InvalidStart(['startItems.task_id: required by the line, as kind "value"']),
    );
  });

  it("refuses a pinned version of a line that has been archived", async () => {
    await seedReviewLine();
    const pinned = (await definitions().latest("line", "code-review"))!.hash;

    await definitions().archive("line", "code-review");

    await expect(
      store().start({ lineId: "code-review", repo, startItems: startItems(), lineHash: pinned }),
    ).rejects.toThrow(new Error('line "code-review" is archived'));
  });

  it("refuses a hash that is not a version of the line", async () => {
    await seedReviewLine();

    await expect(
      store().start({ lineId: "code-review", repo, startItems: startItems(), lineHash: "sha256-nope" }),
    ).rejects.toThrow(new Error('"sha256-nope" is not a version of line "code-review"'));
  });
});
