// What the Studio shows before a local test run starts: what is asked, what is missing, what blocks it, and the definitions a run would keep.
import type { Item } from "@re-cinq/floor-contracts";
import { startBlockers } from "./start-blockers.js";
import { askedOf, startItemsOf, type AskedItem } from "./start-items.js";
import type { TestLine } from "./test-line.js";

export interface TestPreview {
  asked: AskedItem[];
  missing: string[];
  blockers: string[];
  startItems: Record<string, Item>;
  definitions: string[];
}

export function testPreviewOf(line: TestLine, entered: Readonly<Record<string, string>>, definitions: string[]): TestPreview {
  const { items: startItems, missing } = startItemsOf(line, entered);

  return { asked: askedOf(line), missing, blockers: startBlockers(line), startItems, definitions };
}
