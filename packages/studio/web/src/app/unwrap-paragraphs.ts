const BLOCK_START = /^\s*(?:$|[-*] |\d+\. )/;

// Joins hard-wrapped lines into their paragraph or list item; blank lines and list markers start a new line.
export function unwrapParagraphs(text: string): string {
  const lines: string[] = [];

  for (const line of text.split("\n")) {
    const previous = lines.length - 1;
    const continuesPrevious = previous >= 0 && lines[previous] !== "" && !BLOCK_START.test(line);

    if (continuesPrevious) {
      lines[previous] += ` ${line.trim()}`;
      continue;
    }

    lines.push(line);
  }

  return lines.join("\n");
}
