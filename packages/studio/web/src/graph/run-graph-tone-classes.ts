// Tone → CSS class, in one place, so an edge stroke, glyph and label can never disagree about what "warn" looks like; maps are total over ConnectorTone.
import type { ConnectorTone } from "./graph-view-model";
import styles from "./run-graph.module.css";

const EDGE_STROKE: Record<ConnectorTone, string> = {
  ok: styles.toneOk,
  warn: styles.toneWarn,
  err: styles.toneErr,
  neutral: styles.toneNeutral,
};

const TEXT_FILL: Record<ConnectorTone, string> = {
  ok: styles.outOk,
  warn: styles.outWarn,
  err: styles.outErr,
  neutral: styles.outNeutral,
};

const ICON_FILL: Record<ConnectorTone, string> = {
  ok: styles.iconOk,
  warn: styles.iconWarn,
  err: styles.iconErr,
  neutral: styles.iconIdle,
};

// Join class names, dropping ones a CSS module does not define (e.g. `styles.forward` when `.forward` has no rule).
export function classes(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export function edgeStrokeClass(tone: ConnectorTone): string {
  return EDGE_STROKE[tone];
}

export function textFillClass(tone: ConnectorTone): string {
  return TEXT_FILL[tone];
}

export function iconFillClass(tone: ConnectorTone): string {
  return ICON_FILL[tone];
}
