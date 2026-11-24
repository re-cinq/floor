export const COUNT_CHAR_WIDTH = 6;
export const COUNT_GAP = 3;

/** What a line taken more than once says beside its label. */
export function countTextOf(count: number): string {
  return `×${count}`;
}

/** The room that text takes after the label: zero for a line taken once or never. */
export function countWidthOf(count: number): number {
  return count > 1 ? COUNT_GAP + countTextOf(count).length * COUNT_CHAR_WIDTH : 0;
}
