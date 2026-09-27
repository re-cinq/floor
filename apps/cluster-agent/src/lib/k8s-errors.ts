// Reading what the apiserver actually said — 404 is ordinary absence, 409 a
// lost race, everything else a failure; collapsing them into a bare catch
// hides which one actually happened. Ported verbatim from lore's
// `@re-cinq/lore-cluster-agent` (lib/k8s-errors.ts); nothing here is
// lore-specific.

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

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** The apiserver's status code, wherever this client version happens to put it. */
export function statusOf(err: unknown): number | undefined {
  const e = err as RawK8sError;
  const structured = structuredStatus(e);

  if (structured !== undefined) {
    return structured;
  }
  const message = typeof e?.message === "string" ? e.message : "";

  return statusFromMessage(message);
}

function structuredStatus(e: RawK8sError): number | undefined {
  return directStatus(e) ?? nestedStatus(e);
}

function directStatus(e: RawK8sError): number | undefined {
  return e?.code ?? e?.statusCode;
}

function nestedStatus(e: RawK8sError): number | undefined {
  return e?.response?.statusCode ?? e?.body?.code;
}

// Last resort: some statuses surface ONLY as prose (a lost-race Secret write's 409 can have every structured field undefined).
function statusFromMessage(message: string): number | undefined {
  const fromMessage = /^HTTP-Code:\s*(\d{3})\b/m.exec(message);

  if (fromMessage) {
    return Number(fromMessage[1]);
  }

  // A create refused as already-existing is a 409 (`AlreadyExists`); this client surfaces that as nothing but the words.
  return message.includes("already exists") ? 409 : undefined;
}

export function isMissing(err: unknown): boolean {
  return statusOf(err) === 404;
}

export function isConflict(err: unknown): boolean {
  return statusOf(err) === 409;
}

/** Name the verb and the status — "Forbidden" alone does not say which Role rule is missing. */
export function describeK8sError(
  verb: string,
  name: string,
  err: unknown,
): string {
  const status = statusOf(err);
  const detail =
    status === 403 ? " — the cluster agent's Role is missing this rule" : "";

  return `${verb} ${name} failed with ${status ?? "no status"}${detail}: ${errorMessage(err)}`;
}

/** A 400/422 cannot succeed on retry — the object itself is the problem. */
export function isPermanentApplyError(err: unknown): boolean {
  const status = statusOf(err);

  return status === 400 || status === 422;
}
