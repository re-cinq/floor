import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const CHECK = join(dirname(fileURLToPath(import.meta.url)), "check-skill-links.mjs");

function siteWith(skills, pages) {
  const skillsDir = mkdtempSync(join(tmpdir(), "skill-links-skills-"));
  const pagesDir = mkdtempSync(join(tmpdir(), "skill-links-pages-"));
  writeTree(skillsDir, skills);
  writeTree(pagesDir, pages);

  return { skillsDir, pagesDir };
}

function writeTree(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
}

function ran(folders, cwd) {
  const result = spawnSync("node", [CHECK, ...folders], { encoding: "utf8", cwd });

  return [result.status, result.stderr.trim()];
}

function checked({ skillsDir, pagesDir }) {
  return ran([skillsDir, pagesDir]);
}

describe("check-skill-links.mjs", () => {
  it("passes a skill whose link specs/collection/ has the page specs/collection.md", () => {
    const site = siteWith(
      { "prompt/SKILL.md": "See https://re-cinq.github.io/floor/specs/collection/ for the format." },
      { "specs/collection.md": "# Collection" },
    );

    assert.deepEqual(checked(site), [0, ""]);
  });

  it("passes a skill whose link cookbook/ has the page cookbook/index.md", () => {
    const site = siteWith(
      { "assembly-line/SKILL.md": "See https://re-cinq.github.io/floor/cookbook/ for recipes." },
      { "cookbook/index.md": "# Cookbook" },
    );

    assert.deepEqual(checked(site), [0, ""]);
  });

  it("names prompt/SKILL.md and its link specs/nope/ when the site has no such page", () => {
    const site = siteWith(
      { "prompt/SKILL.md": "See https://re-cinq.github.io/floor/specs/nope/ for the format." },
      { "specs/collection.md": "# Collection" },
    );

    assert.deepEqual(
      checked(site),
      [1, "prompt/SKILL.md: https://re-cinq.github.io/floor/specs/nope/ is not a page of the site"],
    );
  });

  it("names the link specs/nope, written with no closing slash, when the site has no such page", () => {
    const site = siteWith(
      { "prompt/SKILL.md": "See https://re-cinq.github.io/floor/specs/nope for the rules." },
      { "specs/index.md": "# Specs", "specs/collection.md": "# Collection" },
    );

    assert.deepEqual(
      checked(site),
      [1, "prompt/SKILL.md: https://re-cinq.github.io/floor/specs/nope is not a page of the site"],
    );
  });

  it("refuses the link specs/../specs/collection/ though specs/collection.md is a page", () => {
    const site = siteWith(
      { "prompt/SKILL.md": "See https://re-cinq.github.io/floor/specs/../specs/collection/ for the format." },
      { "specs/collection.md": "# Collection" },
    );

    assert.deepEqual(
      checked(site),
      [1, "prompt/SKILL.md: https://re-cinq.github.io/floor/specs/../specs/collection/ is not a page of the site"],
    );
  });

  it("fails a skills folder that holds only prompt/README.md, as it has no SKILL.md", () => {
    const site = siteWith(
      { "prompt/README.md": "# Prompt" },
      { "specs/collection.md": "# Collection" },
    );

    assert.deepEqual(checked(site), [1, `no SKILL.md under ${site.skillsDir}`]);
  });

  it("passes this repository's plugins/floor/skills against website/src/content/docs when given no folders", () => {
    assert.deepEqual(ran([], tmpdir()), [0, ""]);
  });
});
