import { parse, stringify } from "yaml";
import { draftRules, type Draft } from "./draft-rules";
import { envPlaceholder } from "./env-placeholder";

export type Settings = Record<string, unknown>;

export interface SettingsSeed {
  settings: Settings;
  version: string;
}

export type SettingsDraft = Draft<SettingsSeed, Settings>;

export const settingsDraft = draftRules<SettingsSeed, Settings>((seed) => seed.settings, sameSettings);

function sameSettings(left: Settings, right: Settings): boolean {
  const keys = Object.keys(left);

  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => sameValue(typedSetting(left[key], right[key]), typedSetting(right[key], left[key])))
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return typeof left === "object" ? JSON.stringify(left) === JSON.stringify(right) : left === right;
}

export function isNested(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

/** How a setting's value shows as text in its form field. */
export function settingText(value: unknown): string {
  return isNested(value) ? stringify(value) : String(value);
}

/** The edited settings with each field converted back to the type its original value had. */
export function typedSettings(original: Settings, edited: Settings): Settings {
  return Object.fromEntries(Object.entries(edited).map(([key, text]) => [key, typedSetting(original[key], text)]));
}

function typedSetting(original: unknown, text: unknown): unknown {
  if (isEmptyOverride(original, text)) return original;
  if (typeof original === "number") return Number(text);

  return isNested(original) && typeof text === "string" ? withEnvKept(original, parseNested(text)) : text;
}

/** The `${NAME}` keys of the original config that the edit left empty, put back. */
function withEnvKept(original: unknown, parsed: unknown): unknown {
  if (!isNested(parsed)) return parsed;
  const kept = Object.entries(original as Settings).filter(([key, value]) => !(key in (parsed as Settings)) && envPlaceholder(String(value)) !== undefined);

  return { ...Object.fromEntries(kept), ...(parsed as Settings) };
}

/** An override left empty is no override: the setting keeps the `${NAME}` it had. */
function isEmptyOverride(original: unknown, text: unknown): boolean {
  return text === "" && envPlaceholder(String(original)) !== undefined;
}

export function parseNested(text: string): unknown {
  try {
    return parse(text);
  } catch {
    return text;
  }
}
