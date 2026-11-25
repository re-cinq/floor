// Pure: the lint command as it was told, out of the positionals and flags parseArgs read.
import type { LintCommand } from "./collection/lint-directory.js";

type LintFlags = Partial<
  Record<"host-key", string[]> & Record<"shipped" | "graph-against", string>
>;

export function lintCommandGiven(
  positionals: readonly string[],
  values: LintFlags,
): LintCommand {
  return {
    directory: positionals[1],
    hostKeys: values["host-key"] ?? [],
    shippedDirectory: values.shipped,
    graphAgainstDirectory: values["graph-against"],
  };
}
