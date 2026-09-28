import { defineStation } from "@floor/station";
import { loadConfig, type Config } from "./config.js";
import { floorPoster } from "./floor.js";
import { postReviewStation } from "./post-review.js";
import { buildReceiver } from "./receiver.js";
import { putRouter, reviewRouter } from "./review-router.js";

const NOTHING_TO_RUN =
  "nothing to run: set GITHUB_WEBHOOK_SECRET for the receiver, GITHUB_TOKEN or GITHUB_APP_ID with a key for the post-review station, GITHUB_REVIEW_ROUTER=1 for the review router";

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  if (!config.webhookSecret && !config.tokenFor && !config.routesReviews) throw new Error(NOTHING_TO_RUN);
  startReceiver(config);
  startStation(config);
  await startRouter(config);
}

async function startRouter(config: Config): Promise<void> {
  if (!config.routesReviews) return;
  const floor = { floorUrl: config.floorUrl, token: config.floorToken };

  await putRouter(floor);
  defineStation("review-router", reviewRouter(floor), { ...floor, onError: said("review-router") });
  console.log("[github] the review router is claiming");
}

function startReceiver(config: Config): void {
  if (!config.webhookSecret) return;
  const receiver = buildReceiver({ webhookSecret: config.webhookSecret, post: floorPoster(config.floorUrl, config.floorToken), onError: said("receiver") });

  receiver.listen(config.port, () => {
    console.log(`[github] receiving webhooks on :${config.port}/webhooks/github`);
  });
}

function startStation(config: Config): void {
  if (!config.tokenFor) return;
  const handle = postReviewStation({ apiUrl: config.apiUrl, tokenFor: config.tokenFor });

  defineStation("post-review", handle, { floorUrl: config.floorUrl, token: config.floorToken, onError: said("post-review") });
  console.log("[github] the post-review station is claiming");
}

function said(part: string): (error: unknown) => void {
  return (error) => {
    console.error(`[github] ${part}:`, error instanceof Error ? error.message : error);
  };
}

main().catch((error: unknown) => {
  said("could not start")(error);
  process.exitCode = 1;
});
