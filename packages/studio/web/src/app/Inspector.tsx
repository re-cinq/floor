import type { NodeView } from "@protocol";
import { useState } from "react";
import EventsPanel from "./EventsPanel";
import InspectorTabs, { type InspectorTab, type TabChoice } from "./InspectorTabs";
import styles from "./line.module.css";
import type { SavePrompt } from "./PromptEditor";
import PromptPanel from "./PromptPanel";
import type { SaveSettings } from "./SettingsEditor";
import SettingsPanel from "./SettingsPanel";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settings-sections";
import { useSettingsDraft } from "./use-settings-draft";
import StationPanel from "./StationPanel";

/** What the page lets the inspector change: the chosen tab and, for a saveable agent, its prompt. */
export interface InspectorActions {
  tabChoice?: TabChoice;
  savePrompt?: SavePrompt;
  saveExtra?: SavePrompt;
  saveSettings?: SaveSettings;
  skillNames?: string[];
}

/** The node inspector's place. It names the selected node and its station and offers its tabs. */
export default function Inspector({ node, actions = {}, onClose }: { node: NodeView | undefined; actions?: InspectorActions; onClose?: () => void }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [pressedTab, setPressedTab] = useState<string>();
  const tabChoice = actions.tabChoice ?? { tab: pressedTab, choose: setPressedTab };

  return (
    <aside className={styles.inspector} aria-label="Node inspector" data-maximized={isMaximized ? "" : undefined}>
      <h2>node</h2>
      {node ? (
        <>
          <TitleBar node={node} isMaximized={isMaximized} onToggleMaximize={() => setIsMaximized(!isMaximized)} onClose={onClose} />
          <NodeTabs key={node.id} node={node} actions={actions} tabChoice={tabChoice} />
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

const SETTINGS_TABS = Object.keys(SETTINGS_SECTIONS) as SettingsSection[];

/** The node's tabs; it holds the settings draft so edits survive a switch between the settings tabs. */
function NodeTabs({ node, actions, tabChoice }: { node: NodeView; actions: InspectorActions; tabChoice: TabChoice }) {
  const draft = useSettingsDraft(node.agent);
  const settingsPanel = (section: SettingsSection) => <SettingsPanel node={node} section={section} draft={draft} onSave={actions.saveSettings} skillNames={actions.skillNames} />;

  return (
    <InspectorTabs
      tabChoice={tabChoice}
      tabs={tabsFor(node)}
      panels={{
        Station: <StationPanel node={node} />,
        Events: <EventsPanel node={node} />,
        Prompt: <PromptPanel node={node} onSave={actions.savePrompt} onSaveExtra={actions.saveExtra} />,
        ...Object.fromEntries(SETTINGS_TABS.map((section) => [section, settingsPanel(section)])),
      }}
    />
  );
}

/** A marker, having no station, offers no tabs; a station node offers its station and events, and an agent node also its prompt and the Model, Tools, MCP, Pod and Other settings. */
function tabsFor(node: NodeView): InspectorTab[] {
  if (!node.station) return [];

  const common: InspectorTab[] = ["Station", "Events"];

  return node.kind === "agent" ? [...common, "Prompt", ...SETTINGS_TABS] : common;
}
