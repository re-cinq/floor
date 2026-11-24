import type { CollectionView } from "@protocol";
import type { SchemePref } from "@/theme/scheme";
import type { ConnectionState } from "@/socket/studio-connection";
import ConnectionIndicator from "./ConnectionIndicator";
import LineList from "./LineList";
import EnvironmentList from "./EnvironmentList";
import RefusedFiles from "./RefusedFiles";
import ThemeSwitch from "./ThemeSwitch";
import styles from "./shell.module.css";

export interface SidebarProps {
  collection: CollectionView | null;
  connection: ConnectionState;
  selectedLineId: string | undefined;
  hrefOf: (lineId: string) => string;
  scheme: { pref: SchemePref; onChoose: (pref: SchemePref) => void };
}

export default function Sidebar({ collection, connection, selectedLineId, hrefOf, scheme }: SidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Collection">
      <div className={styles.brand}>
        <span className={styles.brandName}>floor studio</span>
        <span className={styles.brandKind}>by re:cinq</span>
      </div>
      {collection && (
        <>
          {collection.folder && <p className={styles.folder}>{collection.folder}</p>}
          <LineList lines={collection.lines} selectedLineId={selectedLineId} hrefOf={hrefOf} />
          <EnvironmentList entries={collection.environment ?? []} />
          <RefusedFiles files={collection.refused} />
        </>
      )}
      <div className={styles.footer}>
        <ThemeSwitch pref={scheme.pref} onChoose={scheme.onChoose} />
        <ConnectionIndicator state={connection} />
      </div>
    </aside>
  );
}
