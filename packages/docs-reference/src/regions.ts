// Pure: the parts of a page that are generated sit between two marks, and are written over each time.
const REGION = /<!-- generated:(\S+) -->[\s\S]*?<!-- \/generated -->/g;

export function fillRegions(page: string, made: (name: string) => string): string {
  return page.replace(REGION, (...[, name]: string[]) => `<!-- generated:${name} -->\n\n${made(name)}\n\n<!-- /generated -->`);
}
