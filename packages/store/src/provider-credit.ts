// The one place that knows how each model provider words "your account is out of money"; a new provider's wording is one more entry here.

import type { Report } from "./types.js";

const MS_PER_MINUTE = 60_000;
const CREDIT_PAUSE_MINUTES = 5;

export const CREDIT_PAUSE_MS = CREDIT_PAUSE_MINUTES * MS_PER_MINUTE;

const OUT_OF_CREDIT_WORDINGS: RegExp[] = [
  /credit balance is too low/i,
  /exceeded your current quota/i,
  /insufficient_quota/i,
  /insufficient credits/i,
  /prepayment credits are depleted/i,
];

export function isProviderOutOfCredit(report: Report): boolean {
  const error = report.error ?? "";

  return OUT_OF_CREDIT_WORDINGS.some((wording) => wording.test(error));
}
