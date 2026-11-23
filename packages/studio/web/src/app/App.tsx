import { useMemo, type ReactElement } from "react";
import type { CollectionView } from "@protocol";
import { parseFragment, withSelection } from "@/socket/fragment";
import type { StudioSnapshot } from "@/socket/studio-connection";
import { useStudio, type StudioAddress } from "@/socket/use-studio";
import { useColorScheme } from "@/theme/use-color-scheme";
import LineScreen from "./LineScreen";
import { resolveSelection, type ResolvedSelection } from "./resolve-selection";
import { AddressNeeded, CannotConnect, ChooseLine, Connecting, EmptyCollection, MissingLine, Refused } from "./Screens";
import Sidebar from "./Sidebar";
import { useSelection } from "./use-selection";
import shell from "./shell.module.css";

const NO_STUDIO: StudioSnapshot = { connection: { status: "closed", reason: "this page has no address for the studio", retrying: false }, collection: null, readError: null };

export default function App() {
  const address = useMemo(addressOfPage, []);
  const snapshot = useStudio(address) ?? NO_STUDIO;
  const [selection, select] = useSelection();
  const scheme = useColorScheme();
  const resolved = resolveSelection(snapshot.collection, selection);
  const lineId = resolved.line?.id;

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
        {address ? screenFor(snapshot, { requestedLine: selection.line, resolved, onSelectNode: (node) => select({ line: lineId, node }) }) : <AddressNeeded />}
      </main>
    </div>
  );
}

function addressOfPage(): StudioAddress | undefined {
  const { socket, token } = parseFragment(window.location.hash);

  return socket && token ? { socket, token } : undefined;
}

interface Place {
  requestedLine: string | undefined;
  resolved: ResolvedSelection;
  onSelectNode: (nodeId: string | undefined) => void;
}

function screenFor(snapshot: StudioSnapshot, place: Place): ReactElement {
  const { connection, collection } = snapshot;

  if (connection.status === "refused") return <Refused reason={connection.reason} />;
  if (!collection) return connection.status === "closed" ? <CannotConnect reason={connection.reason} /> : <Connecting />;

  return loadedScreen(collection, place);
}

function loadedScreen(collection: CollectionView, { requestedLine, resolved, onSelectNode }: Place): ReactElement {
  if (collection.lines.length === 0) return <EmptyCollection />;
  if (resolved.line) return <LineScreen line={resolved.line} node={resolved.node} onSelectNode={onSelectNode} />;

  return requestedLine ? <MissingLine lineId={requestedLine} /> : <ChooseLine collection={collection} />;
}
