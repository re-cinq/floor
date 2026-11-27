// The folders of a test run and of its station visits, named so no line id or node id can leave them.
import { enforce } from "@re-cinq/floor-assembly-lines";

const SEQUENCE_WIDTH = 3;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UTC_STAMP_PARTS = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d).*$/;
const COMPACT_UTC_STAMP = "$1$2$3-$4$5$6";

export function visitFolderName(sequence: number, nodeId: string, iteration: number): string {
  enforceSafeName("node", nodeId, "visit folder");

  return `${String(sequence).padStart(SEQUENCE_WIDTH, "0")}-${nodeId}-${iteration}`;
}

export function runFolderName(lineId: string, startedAt: Date): string {
  enforceSafeName("line", lineId, "run folder");

  return `${lineId}-${startedAt.toISOString().replace(UTC_STAMP_PARTS, COMPACT_UTC_STAMP)}`;
}

function enforceSafeName(subject: string, name: string, purpose: string): void {
  enforce(
    SAFE_NAME.test(name),
    `${subject} ${JSON.stringify(name)} cannot name a ${purpose}: a name may hold letters, digits, ".", "_" and "-", and starts with a letter or digit`,
  );
}
