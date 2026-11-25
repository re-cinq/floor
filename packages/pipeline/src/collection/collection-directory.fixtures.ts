// Collections laid out on disk for the tests that read a directory.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const NEW_AGENT =
  "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nWork the ticket.\n";

export function collectionOnDisk(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "collection-lint-"));

  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }

  return root;
}
