import { defineStation } from "@floor/station";
import { loadConfig, type Config } from "./config.js";
import { floorPoster } from "./floor.js";
import { postReviewStation } from "./post-review.js";
import { buildReceiver } from "./receiver.js";

function main(): void {
  const config = loadConfig(process.env);

  if (!config.webhookSecret && !config.tokenFor) throw new Error("nothing to run: set GITHUB_WEBHOOK_SECRET for the receiver, and GITHUB_TOKEN or GITHUB_APP_ID with a key for the post-review station");
  startReceiver(config);
  startStation(config);
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

main();
