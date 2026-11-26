// Report a result from an executor that has been given one visit and its token.
import { createVisitClient, type VisitAccess } from "@re-cinq/floor-client";

export async function finishVisit(
  // access identifies the Floor URL, this visit, and the token issued for it. https://re-cinq.github.io/floor/sdk/client/#visitaccess
  access: VisitAccess,
  // greeting is the produced value the executor includes in its report. https://re-cinq.github.io/floor/specs/run-semantics/#31-reporting-a-visit
  greeting: string,
) {
  const visit = createVisitClient(access);
  // The client binds the report to access.visitId and supplies its deduplication key.
  await visit.report({ worker: "greeter", report: { outcome: "success", produced: { greeting } } });
}
