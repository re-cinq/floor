// The guard every route under one visit shares: a service may act on any visit, a visit token only on its own.
import type { Lifecycle, Request, ResponseToolkit } from "@hapi/hapi";
import { refusalForVisit, type Credentials } from "../auth.js";
import { forbidden } from "../problem.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VisitHandler = (visitId: string, request: Request, toolkit: ResponseToolkit) => Lifecycle.ReturnValue;

export function forOwnVisit(handle: VisitHandler): Lifecycle.Method {
  return (request, toolkit) => {
    const visitId = request.params.id as string;
    const refused = refusalForVisit(request.auth.credentials as Credentials, visitId);

    return refused ? forbidden(toolkit, refused) : handle(visitId, request, toolkit);
  };
}

/** An id that is not a uuid names nothing, and must not reach a uuid column to find that out. */
export function isUuid(candidate: string): boolean {
  return UUID.test(candidate);
}
