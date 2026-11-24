// Pure resolution helpers: no query, no clock, no randomness — everything here is a function of its arguments alone.

import { personLastActedAt, type WalkGraph } from "@re-cinq/floor-assembly-lines";
import type { AgentSettings, Item, LineBody, NeedSpec, Visit } from "./types.js";

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

interface NeedScope {
  bind: Record<string, string> | undefined;
  bag: Record<string, Item>;
  producedSincePerson: ReadonlySet<string> | undefined;
}

/** Resolves each declared need from the bag, via `bind` when the names differ; a missing required need is named in `missing` rather than thrown, so the caller decides how strict to be. `producedSincePerson` holds the visit ids from the one a person last acted at; absent, every item is fresh. */
export function resolveNeeds(
  specs: NeedSpec[],
  bind: Record<string, string> | undefined,
  bag: Record<string, Item>,
  producedSincePerson?: ReadonlySet<string>,
): ResolvedNeeds {
  const result: ResolvedNeeds = { needs: {}, missing: [] };
  const scope: NeedScope = { bind, bag, producedSincePerson };

  for (const spec of specs) {
    resolveOneNeed(spec, scope, result);
  }

  return result;
}

function resolveOneNeed(spec: NeedSpec, scope: NeedScope, result: ResolvedNeeds): void {
  const boundItem = bagGet(scope.bag, scope.bind?.[spec.name] ?? spec.name);
  const isStale = isStaleFor(spec, boundItem, scope.producedSincePerson);

  if (boundItem && !isStale) {
    result.needs[spec.name] = flattenItem(boundItem);

    return;
  }

  if (!spec.optional) result.missing.push(missingLabel(spec.name, boundItem));
}

/** The ids of the visits from the one a person last acted at on; undefined when nobody has acted, as everything is then fresh. */
export function visitIdsSincePersonActed(graph: WalkGraph, visits: readonly Visit[]): ReadonlySet<string> | undefined {
  const index = personLastActedAt(graph, visits);
  if (index < 0) return undefined;

  return new Set(visits.slice(index).map((visit) => visit.id));
}

function missingLabel(name: string, staleItem: Item | undefined): string {
  return staleItem ? `${name} (not produced since a person last acted)` : name;
}

function isStaleFor(spec: NeedSpec, candidate: Item | undefined, producedSincePerson: ReadonlySet<string> | undefined): boolean {
  return Boolean(spec.fresh && candidate && producedSincePerson && !producedSincePerson.has(candidate.by));
}

// A cast to Partial here, not the bag's own declared type: without noUncheckedIndexedAccess, `bag[key]` on a plain Record types as always-defined, which is not true of a bag a key may simply not be in.
function bagGet(bag: Record<string, Item>, key: string): Item | undefined {
  return (bag as Partial<Record<string, Item>>)[key];
}

/** The variant merged over the default, per field, per key inside `config`, and per model inside `prices`. */
export function mergeAgentSettings(base: AgentSettings, variant: Partial<AgentSettings> | undefined): AgentSettings {
  if (!variant) return base;
  const prices = { ...base.prices, ...variant.prices };

  return {
    ...base,
    ...variant,
    config: { ...base.config, ...variant.config },
    ...(Object.keys(prices).length > 0 && { prices }),
  };
}

/** A line's declared files, each turned into a `file` item `by: "line"`; a start item the caller gave under the same name wins. */
export function foldLineFiles(files: Record<string, string> | undefined, startItems: Record<string, Item>): Record<string, Item> {
  if (!files) return startItems;
  const seeded = Object.fromEntries(
    Object.entries(files).map(([name, hash]): [string, Item] => [name, { kind: "file", ref: hash, by: "line" }]),
  );

  return { ...seeded, ...startItems };
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
