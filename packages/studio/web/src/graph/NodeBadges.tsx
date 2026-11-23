// The tags a node wears straddling its top edge, right-aligned: each is a word in a pill, so none rests on colour.
import type { NodeBadge } from "./node-badges";
import styles from "./run-graph.module.css";

const CHAR_WIDTH = 6.4;
const PILL_PADDING = 12;
const PILL_HEIGHT = 15;
const PILL_GAP = 4;
const RIGHT_INSET = 10;

export interface NodeBadgesProps {
  badges: readonly NodeBadge[];
  /** The box's right edge and top. */
  rightEdge: number;
  top: number;
}

interface PlacedBadge {
  badge: NodeBadge;
  x: number;
  width: number;
}

/** Each pill's left edge, laid from the right inset leftwards in the order given. */
function placeBadges(badges: readonly NodeBadge[], rightEdge: number): PlacedBadge[] {
  return badges.reduce<PlacedBadge[]>((placed, badge) => {
    const width = badge.label.length * CHAR_WIDTH + PILL_PADDING;
    const right = placed.length === 0 ? rightEdge - RIGHT_INSET : placed[placed.length - 1].x - PILL_GAP;

    return [...placed, { badge, x: right - width, width }];
  }, []);
}

export default function NodeBadges({ badges, rightEdge, top }: NodeBadgesProps) {
  return (
    <>
      {placeBadges(badges, rightEdge).map(({ badge, x, width }) => (
        <g key={badge.kind} data-badge={badge.kind} className={`${styles.badge} ${styles[`badge-${badge.kind}`]}`}>
          <title>{badge.description}</title>
          <rect x={x} y={top - PILL_HEIGHT / 2} width={width} height={PILL_HEIGHT} rx={PILL_HEIGHT / 2} />
          <text x={x + width / 2} y={top + 3.5} textAnchor="middle">
            {badge.label}
          </text>
        </g>
      ))}
    </>
  );
}
