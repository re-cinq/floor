// Reading what the apiserver actually said (404 absence, 409 a lost race, else a failure); ported verbatim from lore's lib/k8s-errors.ts. See ../../README.md.

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

type RawK8sError =
  | {
      code?: number;
      statusCode?: number;
      response?: { statusCode?: number };
      body?: { code?: number };
      message?: unknown;
    }
  | null
  | undefined;

/** The apiserver's status code, wherever this client version happens to put it. */
export function statusOf(err: unknown): number | undefined {
  const raw = err as RawK8sError;
  const structured = structuredStatus(raw);

  if (structured !== undefined) {
    return structured;
  }

  const message = typeof raw?.message === "string" ? raw.message : "";

  return statusFromMessage(message);
}

function structuredStatus(err: RawK8sError): number | undefined {
  return directStatus(err) ?? nestedStatus(err);
}

function directStatus(err: RawK8sError): number | undefined {
  return err?.code ?? err?.statusCode;
}

function nestedStatus(err: RawK8sError): number | undefined {
  return err?.response?.statusCode ?? err?.body?.code;
}

// Last resort: some statuses surface ONLY as prose (a lost-race Secret write's 409 can have every structured field undefined).
function statusFromMessage(message: string): number | undefined {
  const fromMessage = /^HTTP-Code:\s*(\d{3})\b/m.exec(message);

  if (fromMessage) {
    return Number(fromMessage[1]);
  }

  // A create refused as already-existing is a 409 (`AlreadyExists`); this client surfaces that as nothing but the words.
  return message.includes("already exists") ? HTTP_CONFLICT : undefined;
}

export function isMissing(err: unknown): boolean {
  return statusOf(err) === HTTP_NOT_FOUND;
}

export function isConflict(err: unknown): boolean {
  return statusOf(err) === HTTP_CONFLICT;
}

/** A 400/422 cannot succeed on retry — the object itself is the problem. */
export function isPermanentApplyError(err: unknown): boolean {
  const status = statusOf(err);

  return status === HTTP_BAD_REQUEST || status === HTTP_UNPROCESSABLE;
}

/** Name the verb and the status — "Forbidden" alone does not say which Role rule is missing. */
export function describeK8sError(
  verb: string,
  name: string,
  err: unknown,
): string {
  const status = statusOf(err);
  const detail =
    status === HTTP_FORBIDDEN ? " — the cluster agent's Role is missing this rule" : "";

  return `${verb} ${name} failed with ${status ?? "no status"}${detail}: ${errorMessage(err)}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  return String(err);
}
