// Inside a node box: outcomes live here (one glyph-and-label row each) because the connector carrying them collapsed into a single hop.
import { outcomeTone } from "./graph-view-model";
import StatusIcon from "./StatusIcon";
import { OUTCOME_LABEL_CHARS, OUTCOME_ROW, fitNodeLabel } from "./run-graph-geometry";
import { classes, textFillClass } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export interface NodeOutcomeListProps {
  title: string;
  outcomes: readonly string[];
  /** Left edge and top of the node box; the rows lay themselves out from there. */
  leftEdge: number;
  top: number;
}

export default function NodeOutcomeList({
  title,
  outcomes,
  leftEdge,
  top,
}: NodeOutcomeListProps) {
  return (
    <>
      <ListHeading title={title} leftEdge={leftEdge} top={top} />
      {outcomes.map((outcome, index) => (
        <OutcomeRow
          key={outcome}
          outcome={outcome}
          leftEdge={leftEdge}
          rowY={top + 55 + index * OUTCOME_ROW}
        />
      ))}
    </>
  );
}

interface ListHeadingProps {
  title: string;
  leftEdge: number;
  top: number;
}

/** The node's name and the "Outcomes:" caption above the list. */
function ListHeading({ title, leftEdge, top }: ListHeadingProps) {
  return (
    <>
      <HeadingLine
        className={styles.nodeId}
        leftEdge={leftEdge}
        textY={top + 22}
        label={fitNodeLabel(title)}
      />
      <HeadingLine
        className={styles.possibleLabel}
        leftEdge={leftEdge}
        textY={top + 38}
        label="Outcomes:"
      />
    </>
  );
}

interface HeadingLineProps {
  className: string;
  leftEdge: number;
  textY: number;
  label: string;
}

function HeadingLine({ className, leftEdge, textY, label }: HeadingLineProps) {
  return (
    <text className={className} x={leftEdge + 16} y={textY} textAnchor="start">
      {label}
    </text>
  );
}

interface OutcomeRowProps {
  outcome: string;
  leftEdge: number;
  rowY: number;
}

/** One declared outcome, under its own name: its tone as an icon AND as the text fill, so the distinction survives for a reader who cannot separate the colours. */
function OutcomeRow({ outcome, leftEdge, rowY }: OutcomeRowProps) {
  const tone = outcomeTone(outcome);

  return (
    <g data-outcome={outcome}>
      <StatusIcon tone={tone} cx={leftEdge + 22} cy={rowY - 4} r={6} />
      <text
        className={classes(styles.outcomeRow, textFillClass(tone))}
        x={leftEdge + 34}
        y={rowY}
        textAnchor="start"
      >
        {fitNodeLabel(outcome, OUTCOME_LABEL_CHARS)}
      </text>
    </g>
  );
}
