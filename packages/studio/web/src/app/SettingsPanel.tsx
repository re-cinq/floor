import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";

/** The inspector's Settings panel: the settings the agent file writes. */
export default function SettingsPanel({ node: { agent } }: { node: NodeView }) {
  return <LabelledList label="Settings" entries={Object.entries(agent?.settings ?? {}).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)} />;
}
