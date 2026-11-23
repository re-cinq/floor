import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";
import SettingsEditor, { type SaveSettings } from "./SettingsEditor";

/** The inspector's Settings panel: the settings the agent file writes, editable when the page can save them. */
export default function SettingsPanel({ node: { agent }, onSave }: { node: NodeView; onSave?: SaveSettings }) {
  if (agent && onSave) return <SettingsEditor agent={agent} onSave={onSave} />;

  return <LabelledList label="Settings" entries={Object.entries(agent?.settings ?? {}).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)} />;
}
