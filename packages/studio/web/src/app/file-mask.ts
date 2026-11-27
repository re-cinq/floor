
export interface FileMask {
  label: string;
  patterns: string[];
}

export const ALL_FILES: FileMask = { label: "All files", patterns: ["*"] };

export function matchesMask(fileName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(fileName));
}

export function masksOfPath(path: string | undefined): FileMask[] | undefined {
  const extension = path ? /\.[^./]+$/.exec(path)?.[0] : undefined;

  return extension ? [{ label: `*${extension}`, patterns: [`*${extension}`] }] : undefined;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));

  return new RegExp(`^${escaped.join(".*")}$`);
}
