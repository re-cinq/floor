// Parses a request payload against a zod schema, collecting every validation error rather than just the first (docs/api_sketch.md, "Type safety").
import type { ZodType, ZodError } from "zod";

export type ParseResult<T> = { success: true; value: T } | { success: false; errors: string[] };

export function parseBody<T>(schema: ZodType<T>, payload: unknown): ParseResult<T> {
  const result = schema.safeParse(payload);

  if (result.success) return { success: true, value: result.data };

  return { success: false, errors: issuesOf(result.error) };
}

export function issuesOf(error: ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}
