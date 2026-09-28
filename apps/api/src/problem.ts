// RFC 9457 problem details (docs/api_sketch.md, "Errors"): every error response is application/problem+json.
import type { ResponseToolkit } from "@hapi/hapi";
import { HTTP_NOT_IMPLEMENTED } from "./http-status.js";

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
