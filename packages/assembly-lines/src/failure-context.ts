// Pure: shapes earlier failed visits' errors for the `previous_error` and `previous_failures` built-in needs.

const MAX_ERROR_CHARS = 2500;
const MAX_PRIOR_FAILURES = 3;

/** The last failed visit's error, capped, for the `previous_error` built-in need. */
export function previousErrorNeed(lastFailedError: string | null | undefined): string | undefined {
  if (!lastFailedError) return undefined;

  return lastFailedError.slice(0, MAX_ERROR_CHARS);
}

/** Up to three earlier failures, newest first, for the `previous_failures` built-in need. */
export function previousFailuresNeed(errors: (string | null | undefined)[]): string | undefined {
  const named = errors.filter((error): error is string => Boolean(error)).slice(0, MAX_PRIOR_FAILURES);

  return named.length > 0 ? named.join("\n---\n") : undefined;
}
