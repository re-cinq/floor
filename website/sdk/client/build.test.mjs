import assert from "node:assert/strict";
import { test } from "node:test";
import { stableVersion, packageIntro } from "../release.mjs";
import { fillTemplate } from "../template.mjs";

test("an unknown template token names the missing substitution", () => {
  assert.throws(() => fillTemplate("{{missing}}", {}), /Unknown SDK page token: missing/);
});

test("a prerelease cannot label the stable SDK documentation", () => {
  assert.throws(() => stableVersion("1.0.0-beta.1"), /Unexpected npm release: 1.0.0-beta.1/);
});

test("a package without a package introduction cannot render its page", () => {
  assert.throws(() => packageIntro("export const version = 1;"), /SDK needs a package introduction/);
});
