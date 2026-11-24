import { useMemo, type ReactElement } from "react";
import type { CollectionView, NodeView } from "@protocol";
import { edgeKeyOf } from "@re-cinq/floor-graph";
import { parseFragment, withSelection } from "@/socket/fragment";
import type { StudioConnection, StudioSnapshot } from "@/socket/studio-connection";
import { useStudio, type StudioAddress } from "@/socket/use-studio";
import { useColorScheme } from "@/theme/use-color-scheme";
import LineScreen from "./LineScreen";
import type { SavePrompt } from "./PromptEditor";
import type { SaveSettings } from "./SettingsEditor";
import type { InspectorActions } from "./Inspector";
import { resolveSelection, type ResolvedSelection } from "./resolve-selection";
import { AddressNeeded, CannotConnect, ChooseLine, Connecting, EmptyCollection, MissingLine, Refused, Unreadable } from "./Screens";
import Sidebar from "./Sidebar";
import { useSelection } from "./use-selection";
import shell from "./shell.module.css";

const NO_STUDIO: StudioSnapshot = { connection: { status: "closed", reason: "this page has no address for the studio", retrying: false }, collection: null, readError: null };

export default function App() {
  const address = useMemo(addressOfPage, []);
  const { snapshot: held, connection } = useStudio(address);
  const snapshot = held ?? NO_STUDIO;
  const [selection, select] = useSelection();
  const scheme = useColorScheme();
  const resolved = resolveSelection(snapshot.collection, selection);
  const lineId = resolved.line?.id;
  const savePrompt = promptSaver(connection, lineId, resolved.node);
  const saveExtra = extraSaver(connection, lineId, resolved.node);
  const saveSettings = settingsSaver(connection, lineId, resolved.node);

  return (
    <div className={shell.shell}>
      <Sidebar
        collection={snapshot.collection}
        connection={snapshot.connection}
        selectedLineId={lineId}
        hrefOf={(next) => withSelection(window.location.hash, { line: next })}
        scheme={{ pref: scheme.pref, onChoose: scheme.choose }}
      />
      <main className={shell.main}>
        {address ? screenFor(snapshot, { requestedLine: selection.line, inspector: { savePrompt, saveExtra, saveSettings, tabChoice: { tab: selection.tab, choose: (tab) => select({ line: lineId, node: resolved.node?.id, tab }) } }, resolved, onSelectLine: (key) => select({ line: lineId, edge: key }), selectedLineKey: resolved.edge && edgeKeyOf(resolved.edge), onSelectNode: (node) => select(node ? { line: lineId, node, tab: selection.tab } : { line: lineId }) }) : <AddressNeeded />}
      </main>
    </div>
  );
}

/** A prompt is saved over a live connection against the file version it was read at; without that version there is nothing to guard the write, so no editor is offered. */
function promptSaver(connection: StudioConnection | undefined, line: string | undefined, node: NodeView | undefined): SavePrompt | undefined {
  const agent = node?.agent;

  if (!connection || !line || !agent?.version) return undefined;
  const { name } = agent;

  return (prompt, version) => connection.writeAgent({ line, agent: name, prompt, version });
}

/** The extra prompt is saved against the version of its file the editor was read at. */
function extraSaver(connection: StudioConnection | undefined, line: string | undefined, node: NodeView | undefined): SavePrompt | undefined {
  const agent = node?.agentDefinition;

  if (!connection || !line || !agent) return undefined;

  return (text, version) => connection.writeExtra({ line, agent, text, version });
}

/** Settings are saved with the agent's prompt as it is, against the file version the form was read at. */
function settingsSaver(connection: StudioConnection | undefined, line: string | undefined, node: NodeView | undefined): SaveSettings | undefined {
  const agent = node?.agent;

  if (!connection || !line || !agent?.version) return undefined;
  const { name, prompt } = agent;

  return (settings, version) => connection.writeAgent({ line, agent: name, prompt: prompt ?? "", settings, version });
}

function addressOfPage(): StudioAddress | undefined {
  const { socket, token } = parseFragment(window.location.hash);

  return socket && token ? { socket, token } : undefined;
}

interface Place {
  requestedLine: string | undefined;
  inspector: InspectorActions;
  resolved: ResolvedSelection;
  onSelectNode: (nodeId: string | undefined) => void;
  onSelectLine: (key: string) => void;
  selectedLineKey: string | undefined;
}

function screenFor(snapshot: StudioSnapshot, place: Place): ReactElement {
  const { connection, collection } = snapshot;

  if (connection.status === "refused") return <Refused reason={connection.reason} />;
  if (collection) return loadedScreen(collection, place);

  return unloadedScreen(snapshot);
}

function unloadedScreen({ connection, readError }: StudioSnapshot): ReactElement {
  if (connection.status === "closed") return <CannotConnect reason={connection.reason} />;

  return readError ? <Unreadable reason={readError} /> : <Connecting />;
}

function loadedScreen(collection: CollectionView, { requestedLine, inspector, resolved, onSelectNode, onSelectLine, selectedLineKey }: Place): ReactElement {
  if (collection.lines.length === 0) return <EmptyCollection />;
  if (resolved.line) return <LineScreen line={resolved.line} node={resolved.node} inspector={{ ...inspector, skillNames: collection.skills }} onSelectNode={onSelectNode} onSelectLine={onSelectLine} selectedLineKey={selectedLineKey} selectedLine={resolved.edge} />;

  return requestedLine ? <MissingLine lineId={requestedLine} /> : <ChooseLine collection={collection} />;
}
