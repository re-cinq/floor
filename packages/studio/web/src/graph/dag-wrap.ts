// Wrapping a layered line into bands, like text (run-viz FR4.1a): a layer's column restarts at 0 on each new band, so a long line keeps its nodes at full size instead of shrinking to fit the panel.

export interface WrappedLayer {
  band: number;
  column: number;
}

export function wrapLayer(layer: number, columnsPerBand: number): WrappedLayer {
  if (!Number.isFinite(columnsPerBand)) {
    return { band: 0, column: layer };
  }

  return {
    band: Math.floor(layer / columnsPerBand),
    column: layer % columnsPerBand,
  };
}

