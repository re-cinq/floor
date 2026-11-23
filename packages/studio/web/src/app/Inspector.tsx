import type { NodeView } from "@protocol";
import { useState } from "react";
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
  saveExtra?: SavePrompt;
  saveSettings?: SaveSettings;
  skillNames?: string[];
}

/** The node inspector's place. It names the selected node and its station and offers the Station, Events, Prompt and Settings tabs; their panels are built later. */
export default function Inspector({ node, actions = {}, onClose }: { node: NodeView | undefined; actions?: InspectorActions; onClose?: () => void }) {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <aside className={styles.inspector} aria-label="Node inspector" data-maximized={isMaximized ? "" : undefined}>
      <h2>node</h2>
      {node ? (
        <>
          <TitleBar node={node} isMaximized={isMaximized} onToggleMaximize={() => setIsMaximized(!isMaximized)} onClose={onClose} />
          <InspectorTabs tabChoice={actions.tabChoice} tabs={tabsFor(node)} panels={{ Station: <StationPanel node={node} />, Events: <EventsPanel node={node} />, Prompt: <PromptPanel node={node} onSave={actions.savePrompt} onSaveExtra={actions.saveExtra} />, Settings: <SettingsPanel node={node} onSave={actions.saveSettings} skillNames={actions.skillNames} /> }} />
        </>
      ) : (
        <p className="muted">Select a node in the graph to inspect it.</p>
      )}
    </aside>
  );
}

/** The node's name and station, with the Maximize toggle and, when the page allows it, Close. */
function TitleBar({ node, isMaximized, onToggleMaximize, onClose }: { node: NodeView; isMaximized: boolean; onToggleMaximize: () => void; onClose?: () => void }) {
  return (
    <header>
      <div>
        <p className={styles.inspectorNode}>{node.id}</p>
        <p className="muted">{node.station ? `station ${node.station}` : "a marker, with no station"}</p>
      </div>
      <button type="button" aria-pressed={isMaximized} onClick={onToggleMaximize}>Maximize</button>
      {onClose && <button type="button" onClick={onClose}>Close</button>}
    </header>
  );
}

/** A marker, having no station, offers no tabs; a station node offers its station and events, and an agent node also its prompt and settings. */
function tabsFor(node: NodeView): InspectorTab[] {
  if (!node.station) return [];

  const common: InspectorTab[] = ["Station", "Events"];

  return node.kind === "agent" ? [...common, "Prompt", "Settings"] : common;
}
