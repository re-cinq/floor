// RFC 9457 problem details (docs/api_sketch.md, "Errors"): every error response is application/problem+json.
import Boom from "@hapi/boom";
import type { ResponseToolkit, Server } from "@hapi/hapi";
import { HTTP_BAD_GATEWAY, HTTP_NOT_IMPLEMENTED } from "./http-status.js";

export interface Problem {
  status: number;
  title: string;
  detail?: string;
  errors?: string[];
}

export function problemResponse(toolkit: ResponseToolkit, problem: Problem): ReturnType<ResponseToolkit["response"]> {
  return toolkit
    .response({ type: "about:blank", title: problem.title, status: problem.status, detail: problem.detail, errors: problem.errors })
    .code(problem.status)
    .type("application/problem+json");
}

/** What hapi refuses by itself, a missing token or a route out of the caller's scope, is answered as a problem too. */
export function registerProblemResponses(server: Server): void {
  server.ext("onPreResponse", (request, toolkit) => {
    const refused = request.response;

    if (!Boom.isBoom(refused)) return toolkit.continue;
    const { statusCode, payload, headers } = refused.output;
    const problem = problemResponse(toolkit, { status: statusCode, title: payload.error, detail: payload.message });

    Object.entries(headers).forEach(([name, held]) => problem.header(name, String(held)));

    return problem;
  });
}

export function notFound(toolkit: ResponseToolkit, detail: string): ReturnType<ResponseToolkit["response"]> {
  return problemResponse(toolkit, { status: 404, title: "Not Found", detail });
}

export function badRequest(toolkit: ResponseToolkit, detail: string, errors?: string[]): ReturnType<ResponseToolkit["response"]> {
  return problemResponse(toolkit, { status: 400, title: "Bad Request", detail, errors });
}

export function conflict(toolkit: ResponseToolkit, detail: string): ReturnType<ResponseToolkit["response"]> {
  return problemResponse(toolkit, { status: 409, title: "Conflict", detail });
}

export function forbidden(toolkit: ResponseToolkit, detail: string): ReturnType<ResponseToolkit["response"]> {
  return problemResponse(toolkit, { status: 403, title: "Forbidden", detail });
}

export function unconfigured(toolkit: ResponseToolkit, detail: string): ReturnType<ResponseToolkit["response"]> {
  return problemResponse(toolkit, { status: HTTP_NOT_IMPLEMENTED, title: "Not Implemented", detail });
}

export function badGateway(toolkit: ResponseToolkit, detail: string): ReturnType<ResponseToolkit["response"]> {
  return problemResponse(toolkit, { status: HTTP_BAD_GATEWAY, title: "Bad Gateway", detail });
}
