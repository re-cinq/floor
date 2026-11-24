// Docs links in the Claude Code skills, checked against the site's pages: `node scripts/check-skill-links.mjs [skillsDir pagesDir]`. The website's own link check reads only the website, so a skill naming a page the site lacks would ship a dead link unnoticed.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_SKILLS = join(import.meta.dirname, "../plugins/floor/skills");
const REPO_PAGES = join(import.meta.dirname, "../website/src/content/docs");
const [, , skillsDir = REPO_SKILLS, pagesDir = REPO_PAGES] = process.argv;
const SITE_LINK = /https:\/\/re-cinq\.github\.io\/floor\/([\w./-]*[\w-])\/?/g;

function problemsOf(skillFile) {
  const text = readFileSync(join(skillsDir, skillFile), "utf8");

  return [...text.matchAll(SITE_LINK)]
    .filter(([, path]) => !isPage(path))
    .map(([url]) => `${skillFile}: ${url} is not a page of the site`);
}

function isPage(path) {
  if (path.split("/").includes("..")) return false;

  return existsSync(join(pagesDir, `${path}.md`)) || existsSync(join(pagesDir, path, "index.md"));
}

const skillFiles = readdirSync(skillsDir, { recursive: true }).filter((file) => file.endsWith("SKILL.md"));
const problems = skillFiles.length === 0 ? [`no SKILL.md under ${skillsDir}`] : skillFiles.flatMap(problemsOf);

problems.forEach((problem) => console.error(problem));
if (problems.length > 0) process.exitCode = 1;
