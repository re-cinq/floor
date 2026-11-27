import styles from "./screens.module.css";
import type { TestReadResult } from "@/socket/studio-connection";
import { costWording, outcomeWording, timeWording, totalOf } from "./test-visit-wording";

export default function VisitTable({ visits, openVisitFolder }: { visits: TestReadResult["visits"]; openVisitFolder: (visitId: string) => void }) {
  return (
    <table className={styles.visits}>
      <thead>
        <tr>
          <th>Visit</th>
          <th>Node</th>
          <th>Outcome</th>
          <th>Time</th>
          <th>Cost</th>
          <th>Folder</th>
        </tr>
      </thead>
      <tbody>
        {visits.map((visit) => (
          <VisitRow key={visit.id} visit={visit} openVisitFolder={openVisitFolder} />
        ))}
      </tbody>
      <tfoot>
        <TotalRow visits={visits} />
      </tfoot>
    </table>
  );
}

function VisitRow({ visit, openVisitFolder }: { visit: TestReadResult["visits"][number]; openVisitFolder: (visitId: string) => void }) {
  return (
    <tr>
      <td>{visit.id}</td>
      <td>{visit.nodeId}</td>
      <td>{outcomeWording(visit)}</td>
      <td>{timeWording(visit)}</td>
      <td>{costWording(visit.costUsd)}</td>
      <td>
        <button aria-label={`Open visit folder ${visit.id}`} onClick={() => openVisitFolder(visit.id)}>
          Open
        </button>
      </td>
    </tr>
  );
}

function TotalRow({ visits }: { visits: TestReadResult["visits"] }) {
  const total = totalOf(visits);

  return (
    <tr>
      <td>Total</td>
      <td></td>
      <td></td>
      <td>{timeWording(total)}</td>
      <td>{costWording(total.costUsd)}</td>
      <td></td>
    </tr>
  );
}
