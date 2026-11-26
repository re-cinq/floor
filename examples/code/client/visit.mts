// Report a result from an executor that has been given one visit and its token.
import { createVisitClient, type VisitAccess } from "@re-cinq/floor-client";

export async function finishVisit(access: VisitAccess, greeting: string) {
  const visit = createVisitClient(access);
  // The client binds the report to access.visitId and supplies its deduplication key.
  await visit.report({ worker: "greeter", report: { outcome: "success", produced: { greeting } } });
}
