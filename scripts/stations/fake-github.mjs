// GitHub, for a laptop: the stand-in the tests use, left running, holding one review. It says what it is asked and what is posted to it, and posts nothing anywhere.
import { startFakeGitHub } from "../../apps/github/dist/fake-github.js";

const TOKEN_LIFETIME_MS = 3_600_000;
const github = await startFakeGitHub("", new Date(Date.now() + TOKEN_LIFETIME_MS));
const { asked, issueComments, fixtures } = github;
let said = 0;
let posted = 0;

fixtures.branch = process.env.FAKE_BRANCH ?? "main";
fixtures.reviewBody = process.env.FAKE_REVIEW_BODY ?? null;
fixtures.reviewComments = JSON.parse(process.env.FAKE_REVIEW_COMMENTS ?? "[]");
console.log(`[fake-github] listening at ${github.apiUrl}`);

const SAY_EVERY_MS = 300;

setInterval(() => {
  const requests = asked.slice(said);
  const comments = issueComments.slice(posted);

  requests.forEach((request) => console.log(`[fake-github] asked: ${request}`));
  comments.forEach((comment) => console.log(`[fake-github] comment posted: ${JSON.stringify(comment)}`));
  said = asked.length;
  posted = issueComments.length;
}, SAY_EVERY_MS);
