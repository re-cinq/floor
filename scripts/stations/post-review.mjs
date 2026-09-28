// The post-review station, for a laptop: it reads the review the agent printed and says what it would post. It posts nothing; the real one talks to GitHub, and is lore's to write.
import { defineStation } from "@floor/station";

const FINDINGS = /```REVIEW_FINDINGS\s*\n([\s\S]*?)```/;

defineStation("post-review", async (brief, tools) => {
  const said = (await tools.read("review_output")).toString();
  const block = FINDINGS.exec(said);

  if (!block) return { outcome: "failed", error: "the review has no REVIEW_FINDINGS block to post" };
  const review = JSON.parse(block[1]);
  const findings = review.findings ?? [];

  console.log(`[post-review] would post to ${brief.needs.pr_url}: ${review.verdict}, ${findings.length} finding(s)`);
  findings.forEach((finding) => console.log(`[post-review]   ${finding.label} ${finding.path}:${finding.line} ${finding.subject}`));

  return { outcome: "success", produced: { review_summary: `${review.verdict}: ${review.summary} (${findings.length} findings)` } };
});
