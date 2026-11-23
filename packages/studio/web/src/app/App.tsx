import { useMemo, type ReactElement } from "react";
import type { CollectionView, NodeView } from "@protocol";
import { parseFragment, withSelection } from "@/socket/fragment";
import type { StudioConnection, StudioSnapshot } from "@/socket/studio-connection";
import { useStudio, type StudioAddress } from "@/socket/use-studio";
import { useColorScheme } from "@/theme/use-color-scheme";
import LineScreen from "./LineScreen";
import type { SavePrompt } from "./PromptEditor";
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
        {address ? screenFor(snapshot, { requestedLine: selection.line, inspector: { savePrompt, tabChoice: { tab: selection.tab, choose: (tab) => select({ line: lineId, node: resolved.node?.id, tab }) } }, resolved, onSelectNode: (node) => select(node ? { line: lineId, node, tab: selection.tab } : { line: lineId }) }) : <AddressNeeded />}
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

function addressOfPage(): StudioAddress | undefined {
  const { socket, token } = parseFragment(window.location.hash);

  return socket && token ? { socket, token } : undefined;
}

interface Place {
  requestedLine: string | undefined;
  inspector: InspectorActions;
  resolved: ResolvedSelection;
  onSelectNode: (nodeId: string | undefined) => void;
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

function loadedScreen(collection: CollectionView, { requestedLine, inspector, resolved, onSelectNode }: Place): ReactElement {
  if (collection.lines.length === 0) return <EmptyCollection />;
  if (resolved.line) return <LineScreen line={resolved.line} node={resolved.node} inspector={inspector} onSelectNode={onSelectNode} />;

  return requestedLine ? <MissingLine lineId={requestedLine} /> : <ChooseLine collection={collection} />;
}
