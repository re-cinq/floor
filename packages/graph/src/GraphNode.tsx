// One step in the graph: the box, its type mark, its badges, selection, and one of two exclusive bodies (outcome list or plain name) — the aria-label says the same in words.
import type { KeyboardEvent } from "react";
import type { LayoutNode } from "./dag-layout";
import type { VisibleNode } from "./graph-view-model";
import NodeBadges from "./NodeBadges";
import NodeOutcomeList from "./NodeOutcomeList";
import NodePlainLabel from "./NodePlainLabel";
import TypeGlyph, { FAMILY_CLASS } from "./TypeGlyph";
import { badgesOf } from "./node-badges";
import { nodeAriaLabel } from "./node-aria-label";
import { typeFamilyOf } from "./node-type-family";
import { NODE_WIDTH } from "./run-graph-geometry";
import { nodeTitle } from "./node-tooltip";
import { classes } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export interface GraphNodeProps {
  node: LayoutNode;
  model: VisibleNode;
  height: number;
  isTerminal: boolean;
  /** The node the inspector shows; drawn with a ring so the graph says which one. */
  selected?: boolean;
  onSelect?: (nodeId: string) => void;
  /** The id of the tooltip shown for this node, while one is. */
  describedBy?: string;
}

// The type mark's centre from the box's top-left: inside the corner, clear of the text to its right.
const GLYPH_INSET = 11;

export default function GraphNode(props: GraphNodeProps) {
  const { node, model, height, isTerminal, selected = false, onSelect } = props;
  const { top, leftEdge } = boxOf(node, height);
  const family = typeFamilyOf(model.type);
  const title = nodeTitle(node.id);

  return (
    <g
      className={classes(styles.node, FAMILY_CLASS[family], selected ? styles.selected : undefined)}
      data-node={node.id}
      data-family={family}
      data-selected={selected || undefined}
      aria-label={nodeAriaLabel({ node: model, isTerminal })}
      aria-describedby={props.describedBy}
      {...interactionAttrs({ nodeId: node.id, onSelect, selected })}
    >
      <NodeBox leftEdge={leftEdge} top={top} height={height} />
      <TypeGlyph family={family} cx={leftEdge + GLYPH_INSET} cy={top + GLYPH_INSET} />
      <NodeBody {...{ model, title, node, isTerminal, top, leftEdge }} />
      <NodeBadges badges={badgesOf(model)} rightEdge={leftEdge + NODE_WIDTH} top={top} />
    </g>
  );
}

/** The box's top-left, from the layout's CENTRE point. The layout places node centres so edges can aim at them; SVG rects are drawn from a corner. */
function boxOf(node: GraphNodeProps["node"], height: number) {
  return { top: node.y - height / 2, leftEdge: node.x - NODE_WIDTH / 2 };
}

interface InteractionInput {
  nodeId: string;
  onSelect: GraphNodeProps["onSelect"];
  selected: boolean;
}

/** How the group answers a click or a key, and whether it is the pressed one; a node with no handler claims neither. */
function interactionAttrs({ nodeId, onSelect, selected }: InteractionInput) {
  if (!onSelect) {
    return { role: "group" as const };
  }

  return {
    role: "button" as const,
    "aria-pressed": selected,
    tabIndex: 0,
    onClick: () => onSelect(nodeId),
    onKeyDown: selectOnActivationKey(nodeId, onSelect),
  };
}

// Enter and Space activate a node exactly as they activate a button; nothing else does.
function selectOnActivationKey(
  nodeId: string,
  onSelect: (nodeId: string) => void,
) {
  return (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelect(nodeId);
  };
}

interface NodeBoxProps {
  leftEdge: number;
  top: number;
  height: number;
}

function NodeBox({ leftEdge, top, height }: NodeBoxProps) {
  return (
    <rect
      className={styles.box}
      x={leftEdge}
      y={top}
      width={NODE_WIDTH}
      height={height}
      rx={10}
    />
  );
}

interface NodeBodyProps {
  model: VisibleNode;
  title: string;
  node: GraphNodeProps["node"];
  top: number;
  leftEdge: number;
  isTerminal: boolean;
}

/** What the box says: the outcomes the definition declares, else the plain name. */
function NodeBody({ model, title, node, top, leftEdge, isTerminal }: NodeBodyProps) {
  if (model.outcomes.length > 0) {
    return <NodeOutcomeList title={title} outcomes={model.outcomes} leftEdge={leftEdge} top={top} />;
  }

  return <NodePlainLabel title={title} centerX={node.x} centerY={node.y} isTerminal={isTerminal} />;
}
