import type { CollectionView } from "@protocol";
import styles from "./screens.module.css";

export function AddressNeeded() {
  return (
    <Screen title="This page was not told where the studio is">
      <p>
        It needs the address that <code>floor-studio</code> prints when it starts, with the socket and the token in it. Run <code>floor-studio</code> in a collection folder and open that address.
      </p>
    </Screen>
  );
}

export function Connecting() {
  return (
    <Screen title="Connecting to the studio">
      <p>Waiting for the studio to answer.</p>
    </Screen>
  );
}

export function CannotConnect({ reason }: { reason: string }) {
  return (
    <Screen title="Cannot connect to the studio">
      <p>{reason}.</p>
      <p>
        Is <code>floor-studio</code> still running? The page keeps trying and will come back by itself.
      </p>
    </Screen>
  );
}

export function Unreadable({ reason }: { reason: string }) {
  return (
    <Screen title="The studio could not be read">
      <p>{reason}</p>
    </Screen>
  );
}

export function Refused({ reason }: { reason: string }) {
  return (
    <Screen title="The studio refused this page">
      <p>{reason}</p>
    </Screen>
  );
}

export function EmptyCollection() {
  return (
    <Screen title="This folder holds no assembly line">
      <p>
        A collection has one folder per assembly line, each with an <code>assembly-line.yaml</code> and its <code>agents/</code>. Add one and it appears here at once.
      </p>
    </Screen>
  );
}

export function ChooseLine({ collection }: { collection: CollectionView }) {
  const { lines, agents, refused, problems } = collection.counts;

  return (
    <Screen title="Choose an assembly line">
      <p>Pick one in the list to see its graph.</p>
      <p className={styles.summary}>
        <span>{lines} assembly lines</span>
        <span>{agents} agents</span>
        <span>{problems} problems</span>
        <span>{refused} refused files</span>
      </p>
    </Screen>
  );
}

export function MissingLine({ lineId }: { lineId: string }) {
  return (
    <Screen title="That assembly line is not in the collection">
      <p>
        <code>{lineId}</code> is not there, or no longer. Pick another in the list.
      </p>
    </Screen>
  );
}

function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`empty-state ${styles.screen}`} aria-labelledby="screen-title">
      <h2 id="screen-title">{title}</h2>
      {children}
    </section>
  );
}
