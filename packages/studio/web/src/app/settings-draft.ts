import { stringify } from "yaml";
import { draftRules, type Draft } from "./draft-rules";

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
  return typeof original === "number" ? Number(text) : text;
}
