// The column count to wrap a line's layers into so its drawing shows largest in the box.
import { fitTransform, type Size } from "./viewport";

interface ColumnFit {
  columns: number;
  scale: number;
}

/** 1 up to one column per layer; a line of 0 layers still gets its single column. */
const columnCountsFor = (layerCount: number): number[] =>
  [...Array(Math.max(layerCount, 1)).keys()].map((index) => index + 1);

/** The column count whose drawing shows largest in the box, most columns on a tie (fewer wraps read easier); `sizeAt` runs once per count. */
export function columnsToFit(layerCount: number, box: Size, sizeAt: (columns: number) => Size): number {
  const fits = columnCountsFor(layerCount).map(
    (columns): ColumnFit => ({ columns, scale: fitTransform(sizeAt(columns), box).scale }),
  );

  // `>=` over counts in ascending order is what lets the widest of the tied counts win.
  return fits.reduce((best, fit) => (fit.scale >= best.scale ? fit : best)).columns;
}
