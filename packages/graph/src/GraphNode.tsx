// One step in the graph: the box, its type mark, its badges, selection, and its title over its kind — the aria-label says the same in words.
import type { KeyboardEvent } from "react";
import type { LaidOutNode } from "./elk-layout";
import type { ConnectorTone, VisibleNode } from "./graph-view-model";
import NodeBadges from "./NodeBadges";
import NodeTitle from "./NodeTitle";
import TypeGlyph, { FAMILY_CLASS } from "./TypeGlyph";
import { badgesOf } from "./node-badges";
import { nodeAriaLabel } from "./node-aria-label";
import { typeFamilyOf } from "./node-type-family";
import { NODE_WIDTH } from "./run-graph-geometry";
import { nodeTitle } from "./node-tooltip";
import { classes, portFillClass } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export interface GraphNodeProps {
  node: LaidOutNode;
  model: VisibleNode;
  height: number;
  isTerminal: boolean;
  /** The node the inspector shows; drawn with a ring so the graph says which one. */
  selected?: boolean;
  onSelect?: (nodeId: string) => void;
  /** The id of the tooltip shown for this node, while one is. */
  describedBy?: string;
  /** The tone of each out-port's line, by edge key; a port with no line draws neutral. */
  toneByEdge?: ReadonlyMap<string, ConnectorTone>;
}

// The type mark's centre from the box's top-left: inside the corner, clear of the text to its right.
const GLYPH_INSET = 11;

const NO_TONES: ReadonlyMap<string, ConnectorTone> = new Map();

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
      <NodeTitle title={title} kind={family} centerX={node.x} centerY={node.y} />
      <NodeBadges badges={badgesOf(model)} rightEdge={leftEdge + NODE_WIDTH} top={top} />
      <NodePorts ports={node.ports} toneByEdge={props.toneByEdge ?? NO_TONES} />
    </g>
  );
}

function NodePorts({ ports, toneByEdge }: { ports: LaidOutNode["ports"]; toneByEdge: ReadonlyMap<string, ConnectorTone> }) {
  return ports.map((port) => {
    const tone = port.side === "in" ? "in" : (toneByEdge.get(port.edge) ?? "neutral");

    return (
      <circle
        key={`${port.edge}:${port.side}`}
        data-port={`${port.edge}:${port.side}`}
        data-tone={tone}
        className={portFillClass(tone)}
        cx={port.x}
        cy={port.y}
        r={4}
      />
    );
  });
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
