// Where a local run puts each need and what fills the prompt; the picked folder stands in for /workspace.
import { join } from "node:path";
import { declaredParameters, needPathOf, type DeclaredParameter } from "@re-cinq/floor-assembly-lines";
import type { StationBody } from "@re-cinq/floor-contracts";

export interface WorkspaceInput {
  station: StationBody;
  /** Fixture file per need name. */
  fixture: Readonly<Record<string, string>>;
  folder: string;
}

export interface NeedPlacement {
  need: string;
  from: string;
  to: string;
}

export type NeedCopy = NeedPlacement;
export type NeedLink = NeedPlacement;

export interface Workspace {
  copies: NeedCopy[];
  links: NeedLink[];
  parameters: Record<string, string>;
  missing: string[];
}

export function workspaceOf({ station, fixture, folder }: WorkspaceInput): Workspace {
  const hasEntry = (name: string) => Boolean(fixture[name]);

  const placementsOf = (kind: string): NeedPlacement[] => {
    const needsOfKind = station.needs.filter((need) => need.kind === kind && hasEntry(need.name));

    return needsOfKind.map((need) => ({ need: need.name, from: fixture[need.name]!, to: join(folder, needPathOf(need)) }));
  };

  const localValue = (parameter: DeclaredParameter) => valueOf(parameter, station, fixture, folder);
  const fillable = declaredParameters(station).filter((parameter) => parameter.from === "produce-path" || hasEntry(parameter.source));
  const parameters = Object.fromEntries(fillable.map((parameter) => [parameter.name, localValue(parameter)]));
  const unfilled = station.needs.filter((need) => !need.optional && !hasEntry(need.name));
  const missing = unfilled.map((need) => need.name);

  return { copies: placementsOf("file"), links: placementsOf("git"), parameters, missing };
}

function valueOf(parameter: DeclaredParameter, station: StationBody, fixture: Readonly<Record<string, string>>, folder: string): string {
  if (parameter.from === "value-need") return fixture[parameter.source]!;
  const { needs, produces } = station;
  const place = parameter.from === "produce-path" ? producePathOf(produces, parameter.source) : needPathOf(needs.find((need) => need.name === parameter.source)!);

  return join(folder, place);
}

function producePathOf(produces: StationBody["produces"], name: string): string {
  return produces.find((produce) => produce.name === name)!.path!;
}
