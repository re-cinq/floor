// Pure: how many words of prose a page asks a person to read, against the budget its frontmatter sets. Code, tables and generated regions are not prose: they are looked up, not read through.
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const BUDGET = /^wordBudget:\s*(\d+)\s*$/m;
const NOT_PROSE = [/<!-- generated:[\s\S]*?<!-- \/generated -->/g, /^(`{3,})[\s\S]*?^\1.*$/gm, /^\|.*$/gm, /<!--[\s\S]*?-->/g, /\]\([^)]*\)/g, /^import .*$/gm];

export interface Over {
  words: number;
  budget: number;
}

export function proseWords(page: string): number {
  const prose = NOT_PROSE.reduce((text, pattern) => text.replace(pattern, " "), page.replace(FRONTMATTER, ""));

  const words = prose.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word));

  return words.length;
}

/** What a page is over by, or nothing for a page within its budget or with none. */
export function overBudget(page: string): Over | undefined {
  const budget = Number(BUDGET.exec(FRONTMATTER.exec(page)?.[0] ?? "")?.[1]);
  const words = proseWords(page);

  return words > budget ? { words, budget } : undefined;
}
