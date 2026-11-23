import type { NodeView } from "@protocol";
import EventsPanel from "./EventsPanel";
import InspectorTabs, { type InspectorTab, type TabChoice } from "./InspectorTabs";
import styles from "./line.module.css";
import type { SavePrompt } from "./PromptEditor";
import PromptPanel from "./PromptPanel";
import type { SaveSettings } from "./SettingsEditor";
import SettingsPanel from "./SettingsPanel";
import StationPanel from "./StationPanel";

/** What the page lets the inspector change: the chosen tab and, for a saveable agent, its prompt. */
export interface InspectorActions {
  tabChoice?: TabChoice;
  savePrompt?: SavePrompt;
  saveSettings?: SaveSettings;
}

/** The node inspector's place. It names the selected node and its station and offers the Station, Events, Prompt and Settings tabs; their panels are built later. */
export default function Inspector({ node, actions = {} }: { node: NodeView | undefined; actions?: InspectorActions }) {
  return (
    <aside className={styles.inspector} aria-label="Node inspector">
      <h2>node</h2>
      {node ? (
        <>
          <p className={styles.inspectorNode}>{node.id}</p>
          <p className="muted">{node.station ? `station ${node.station}` : "a marker, with no station"}</p>
          <InspectorTabs tabChoice={actions.tabChoice} tabs={tabsFor(node)} panels={{ Station: <StationPanel node={node} />, Events: <EventsPanel node={node} />, Prompt: <PromptPanel node={node} onSave={actions.savePrompt} />, Settings: <SettingsPanel node={node} onSave={actions.saveSettings} /> }} />
        </>
      ) : (
        <p className="muted">Select a node in the graph to inspect it.</p>
      )}
    </aside>
  );
}

/** A marker, having no station, offers no tabs; a station node offers its station and events, and an agent node also its prompt and settings. */
function tabsFor(node: NodeView): InspectorTab[] {
  if (!node.station) return [];

  const common: InspectorTab[] = ["Station", "Events"];

  return node.kind === "agent" ? [...common, "Prompt", "Settings"] : common;
}
