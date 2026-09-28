// Pure resolution helpers: no query, no clock, no randomness — everything here is a function of its arguments alone.

import type { AgentSettings, Item, LineBody, NeedSpec } from "./types.js";

const MAX_ERROR_CHARS = 2500;
const MAX_PRIOR_FAILURES = 3;

/** `"<argName>:<value>"` for the one argument marked `subject`, or null when none is. */
export function deriveSubjectKey(line: LineBody, startItems: Record<string, Item>): string | null {
  const subjectArg = Object.entries(line.args).find(([, spec]) => spec.subject);

  if (!subjectArg) return null;
  const [name] = subjectArg;
  const startItem = bagGet(startItems, name);

  if (!startItem) return null;

  return `${name}:${startItem.ref}`;
}

/** The value a station author sees for one need, per its kind. */
export function flattenItem(bagEntry: Item): string {
  if (bagEntry.kind === "value") return bagEntry.ref;
  if (bagEntry.kind === "file") return `/blobs/${bagEntry.ref}`;

  return bagEntry.sha ? `${bagEntry.ref}@${bagEntry.sha}` : bagEntry.ref;
}

export interface ResolvedNeeds {
  needs: Record<string, string>;
  missing: string[];
}

/** Resolves each declared need from the bag, via `bind` when the names differ; a missing required need is named in `missing` rather than thrown, so the caller decides how strict to be. */
export function resolveNeeds(
  specs: NeedSpec[],
  bind: Record<string, string> | undefined,
  bag: Record<string, Item>,
): ResolvedNeeds {
  const result: ResolvedNeeds = { needs: {}, missing: [] };

  for (const spec of specs) {
    resolveOneNeed(spec, bind, bag, result);
  }

  return result;
}

function resolveOneNeed(
  spec: NeedSpec,
  bind: Record<string, string> | undefined,
  bag: Record<string, Item>,
  result: ResolvedNeeds,
): void {
  const boundName = bind?.[spec.name] ?? spec.name;
  const boundItem = bagGet(bag, boundName);

  if (boundItem) {
    result.needs[spec.name] = flattenItem(boundItem);

    return;
  }

  if (!spec.optional) result.missing.push(spec.name);
}

// A cast to Partial here, not the bag's own declared type: without noUncheckedIndexedAccess, `bag[key]` on a plain Record types as always-defined, which is not true of a bag a key may simply not be in.
function bagGet(bag: Record<string, Item>, key: string): Item | undefined {
  return (bag as Partial<Record<string, Item>>)[key];
}

/** The variant merged over the default, per field, and per key inside `config`. */
export function mergeAgentSettings(base: AgentSettings, variant: Partial<AgentSettings> | undefined): AgentSettings {
  if (!variant) return base;

  return {
    ...base,
    ...variant,
    config: { ...base.config, ...variant.config },
  };
}

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
