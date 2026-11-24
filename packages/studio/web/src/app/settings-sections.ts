import { isNested, type Settings } from "./settings-draft";

export type SettingsSection = "Model" | "Tools" | "MCP" | "Pod" | "Other";

interface SectionKeys {
  /** Top-level keys of the agent file's settings. */
  settings: string[];
  /** Keys inside the settings' config. */
  config: string[];
}

/** Which settings, and which config keys, each settings tab holds. */
export const SETTINGS_SECTIONS: Record<SettingsSection, SectionKeys> = {
  Model: { settings: ["model"], config: ["permission_mode", "max_turns", "model_secret_key"] },
  Tools: { settings: [], config: ["skills", "skills_source", "disallowed_tools"] },
  MCP: { settings: [], config: ["mcp_servers"] },
  Pod: { settings: ["image", "timeout_minutes"], config: ["env", "pod_resources"] },
  Other: { settings: ["tags", "prices", "config"], config: [] },
};

/** The settings entries a section holds, its share of the config gathered under one config entry. */
export function sectionEntries(settings: Settings, section: SettingsSection): [string, unknown][] {
  const { settings: keys, config: configKeys } = SETTINGS_SECTIONS[section];
  const own = Object.entries(settings).filter(([key]) => keys.includes(key));
  const config = Object.entries(isNested(settings.config) ? (settings.config as Settings) : {}).filter(([key]) => configKeys.includes(key));

  return config.length ? [...own, ["config", Object.fromEntries(config)]] : own;
}
