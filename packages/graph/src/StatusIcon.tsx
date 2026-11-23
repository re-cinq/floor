// A small circular outcome glyph (check/dash/cross) at any radius — every tone reads from its shape, so meaning never rests on color alone.
import type { ConnectorTone } from "./graph-view-model";
import { iconFillClass } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

// The stroked mark inside the disc as a function of its centre and scale (1 at base radius 8); `neutral` carries no mark.
const GLYPH_PATH: Partial<
  Record<ConnectorTone, (cx: number, cy: number, s: number) => string>
> = {
  ok: (cx, cy, s) =>
    `M ${cx - 3.6 * s} ${cy + 0.3 * s} L ${cx - 1.2 * s} ${cy + 2.8 * s} L ${cx + 3.8 * s} ${cy - 3 * s}`,
  err: (cx, cy, s) =>
    `M ${cx - 2.8 * s} ${cy - 2.8 * s} L ${cx + 2.8 * s} ${cy + 2.8 * s} M ${cx + 2.8 * s} ${cy - 2.8 * s} L ${cx - 2.8 * s} ${cy + 2.8 * s}`,
  warn: (cx, cy, s) => `M ${cx - 3.2 * s} ${cy} L ${cx + 3.2 * s} ${cy}`,
};

export interface StatusIconProps {
  tone: ConnectorTone;
  cx: number;
  cy: number;
  r?: number;
}

export default function StatusIcon({ tone, cx, cy, r = 8 }: StatusIconProps) {
  const scale = r / 8;
  const glyph = GLYPH_PATH[tone];

  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} className={iconFillClass(tone)} />
      {glyph ? (
        <path className={styles.iconGlyph} d={glyph(cx, cy, scale)} />
      ) : null}
    </g>
  );
}
