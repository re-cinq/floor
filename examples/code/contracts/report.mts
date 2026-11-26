// Build the visit report for a greeter so Floor can route the run and store its greeting.
import type { Brief, Report } from "@re-cinq/floor-contracts";

export function greetingReport(
  // brief carries the resolved inputs for this visit. https://re-cinq.github.io/floor/sdk/contracts/#brief
  brief: Brief,
): Report {
  const name = brief.needs.name;
  if (!name) return { outcome: "failed", error: "A greeting needs a name" };

  // The hello pipeline declares a value output named "greeting".
  return { outcome: "success", produced: { greeting: `Hello, ${name}!` } };
}
