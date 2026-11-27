// What a run of one agent station would do, before it is started.
import { isAbsolute, join, relative, sep } from "node:path";
import type { StationBody } from "@re-cinq/floor-contracts";
import { agentCommand, runnableVendors, type AgentCommandInput, type AgentCommandSettings } from "./agent-command.js";
import { renderPrompt } from "./render-prompt.js";
import { vendorOf } from "./vendor.js";
import { workspaceOf, type NeedCopy, type NeedLink } from "./workspace.js";

/* eslint-disable @typescript-eslint/naming-convention -- the station file spells these keys in snake_case */
export interface StationSettings {
  model?: string;
  config?: { max_turns?: number; disallowed_tools?: string[]; env?: Record<string, string> };
}
/* eslint-enable @typescript-eslint/naming-convention */

export interface RunPreviewInput {
  station: StationBody;
  prompt: string;
  settings: StationSettings;
  fixture: Readonly<Record<string, string>>;
  folder: string;
  permission: AgentCommandInput["permission"];
}

export interface RunPreview {
  prompt: string;
  command: string[];
  copies: NeedCopy[];
  links: NeedLink[];
  blockers: string[];
  /** The agent's `config.env`, laid over the studio's environment for the run. */
  env: Record<string, string>;
}

/** The pod's `/workspace` in the prompt's own text, pointed at the picked folder as written, as the parameters already are. */
const POD_WORKSPACE = /\/workspace(?![\w-])/;

export function runPreview({ station, prompt, settings, fixture, folder, permission }: RunPreviewInput): RunPreview {
  const { parameters, copies, links, missing } = workspaceOf({ station, fixture, folder });
  const rendered = prompt.split(POD_WORKSPACE).map((piece) => renderPrompt(piece, parameters)).join(folder);
  const vendor = vendorOf(settings.model ?? "");
  const unrunnable = runnableVendors.includes(vendor) ? [] : [unrunnableBlocker(settings.model ?? "", vendor)];
  const command = unrunnable.length ? [] : agentCommand({ vendor, settings: commandSettingsOf(settings), prompt: rendered, permission });

  return { prompt: rendered, command, copies, links, env: agentEnvOf(settings), blockers: [...missing.map((name) => `"${name}" has no value`), ...outsideFolderBlockers(station, folder), ...unrunnable, ...relativeFolderBlockers(folder)] };
}

function agentEnvOf({ config }: StationSettings): Record<string, string> {
  return config?.env ?? {};
}

function outsideFolderBlockers({ needs, produces }: StationBody, folder: string): string[] {
  const outside = [...needs, ...produces].filter((place) => place.path !== undefined && leavesFolder(folder, place.path));

  return outside.map((place) => `"${place.name}": ${place.path} leaves the run folder`);
}

export function leavesFolder(folder: string, path: string): boolean {
  const placed = relative(folder, join(folder, path));

  return placed === ".." || placed.startsWith(`..${sep}`) || isAbsolute(placed);
}

function relativeFolderBlockers(folder: string): string[] {
  return isAbsolute(folder) ? [] : [`the folder must be an absolute path: ${folder}`];
}

function unrunnableBlocker(model: string, vendor: string): string {
  return `the studio runs ${runnableVendors.join(" and ")} agents; ${model} is a ${vendor} model`;
}

function commandSettingsOf({ model, config }: StationSettings): AgentCommandSettings {
  return { model, maxTurns: config?.max_turns, disallowedTools: config?.disallowed_tools };
}
