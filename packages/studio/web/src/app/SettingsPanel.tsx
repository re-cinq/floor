import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";
import SettingsEditor, { type SaveSettings } from "./SettingsEditor";
import { sectionEntries, type SettingsSection } from "./settings-sections";
import type { SettingsDraftState } from "./use-settings-draft";

interface SettingsPanelProps {
  node: NodeView;
  section: SettingsSection;
  draft: SettingsDraftState;
  onSave?: SaveSettings;
  skillNames?: string[];
}

/** One of the inspector's settings panels: the settings of its section, editable when the page can save them. */
export default function SettingsPanel({ node: { agent }, section, draft, onSave, skillNames }: SettingsPanelProps) {
  if (agent && onSave) return <SettingsEditor section={section} draft={draft} onSave={onSave} skillNames={skillNames} />;

  return <LabelledList label="Settings" entries={sectionEntries(agent?.settings ?? {}, section).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)} />;
}
