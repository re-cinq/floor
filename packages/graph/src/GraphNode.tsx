// One step in the graph: the box, its type mark, its badges, selection, and its title over its kind — the aria-label says the same in words.
import type { KeyboardEvent } from "react";
import type { KeyboardCursor } from "./use-keyboard-cursor";
import type { LaidOutNode } from "./elk-layout";
import type { ConnectorTone, VisibleNode } from "./graph-view-model";
import NodeBadges from "./NodeBadges";
import NodeBox from "./NodeBox";
import NodeTitle from "./NodeTitle";
import TypeGlyph, { FAMILY_CLASS } from "./TypeGlyph";
import { badgesOf } from "./node-badges";
import { nodeAriaLabel } from "./node-aria-label";
import { typeFamilyOf } from "./node-type-family";
import { nodeTitle } from "./node-tooltip";
import type { StationVisits } from "./metro/station-visits";
import type { NodeOffset } from "./metro/layout-diff";
import { subtitleOf } from "./station-subtitle";
import { classes, portFillClass } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export interface GraphNodeProps {
  node: LaidOutNode;
  model: VisibleNode;
  height: number;
  isTerminal: boolean;
  /** No start leads to it. */
  isUnreachable?: boolean;
  /** Drawn as a small stop rather than a card. */
  isStop?: boolean;
  /** The node the inspector shows; drawn with a ring so the graph says which one. */
  selected?: boolean;
  onSelect?: (nodeId: string) => void;
  /** Told which node the pointer or the keyboard focus is on, or null once it leaves. */
  onHover?: (nodeId: string | null) => void;
  /** Outside the hovered node's neighbourhood. */
  dimmed?: boolean;
  /** Off the main line. */
  offPath?: boolean;
  /** Newly drawn by the latest layout. */
  added?: boolean;
  moved?: boolean;
  offset?: NodeOffset;
  /** The id of the tooltip shown for this node, while one is. */
  describedBy?: string;
  /** Whether the run came here (undefined without a run). */
  visited?: boolean;
  /** How the run's last closed visit here ended. */
  outcome?: string;
  /** What the run did here: how often it came, and whether a visit is open. */
  status?: StationVisits;
  /** The keyboard cursor: told when this node takes focus, and given its keys. */
  keyboard?: Pick<KeyboardCursor, "onFocusNode" | "onKeyDown">;
  /** The tone of each out-port's line, by edge key; a port with no line draws neutral. */
  toneByEdge?: ReadonlyMap<string, ConnectorTone>;
}

// The type mark's centre from the box's top-left: inside the corner, clear of the text to its right.
const GLYPH_INSET = 11;

const NO_TONES: ReadonlyMap<string, ConnectorTone> = new Map();

export default function GraphNode(props: GraphNodeProps) {
  const { node, model, height, selected = false, isUnreachable } = props;
  const family = typeFamilyOf(model.type);
  const shape = shapeOf(family, props);
  const BODY = BODY_BY_SHAPE[shape];

  return (
    <g
      className={classes(
        styles.node,
        FAMILY_CLASS[family],
        selected ? styles.selected : undefined,
      )}
      {...stationAttrsOf(props, family, shape)}
    >
      <BODY
        node={node}
        family={family}
        subtitle={subtitleOf(family, props.status)}
        height={height}
        isUnreachable={isUnreachable}
      />
      <NodeBadges
        badges={badgesOf(model)}
        rightEdge={node.x + node.width / 2}
        top={node.y - height / 2}
      />
      <NodePorts ports={node.ports} toneByEdge={props.toneByEdge} />
    </g>
  );
}

function stationAttrsOf(
  props: GraphNodeProps,
  family: ReturnType<typeof typeFamilyOf>,
  shape: ReturnType<typeof shapeOf>,
) {
  const { node, model, isTerminal, selected = false, isUnreachable } = props;

  return {
    "data-node": node.id,
    "data-family": family,
    "data-shape": shape,
    "data-selected": selected || undefined,
    "data-unreachable": isUnreachable || undefined,
    "data-off-path": props.offPath || undefined,
    ...runAttrsOf(props),
    ...changeAttrOf(props),
    style: props.offset && { transform: `translate(${props.offset.dx}px, ${props.offset.dy}px)`, transition: "none" },
    ...neighbourhoodAttrs(node.id, props),
    "aria-label": nodeAriaLabel({ node: model, isTerminal, isUnreachable }),
    "aria-describedby": props.describedBy,
    ...interactionAttrs({
      nodeId: node.id,
      onSelect: props.onSelect,
      selected,
      keyboard: props.keyboard,
    }),
  };
}

function runAttrsOf({
  visited,
  outcome,
  status,
}: Pick<GraphNodeProps, "visited" | "outcome" | "status">) {
  return {
    "data-open": status?.open || undefined,
    "data-visited": visited === false ? "false" : undefined,
    "data-outcome": outcome,
  };
}

function changeAttrOf({ added, moved }: Pick<GraphNodeProps, "added" | "moved">) {
  return { "data-change": (added && "added") || (moved && "moved") || undefined };
}

function shapeOf(
  family: ReturnType<typeof typeFamilyOf>,
  { isStop }: GraphNodeProps,
) {
  if (family === "marker") {
    return "terminal";
  }

  return isStop ? "stop" : "card";
}

interface NodeBodyProps {
  node: LaidOutNode;
  family: ReturnType<typeof typeFamilyOf>;
  subtitle: string;
  height: number;
  isUnreachable?: boolean;
}

function CardBody({
  node,
  family,
  subtitle,
  height,
  isUnreachable,
}: NodeBodyProps) {
  const box = boxOf(node, height);
  const { top, leftEdge } = box;

  return (
    <>
      <NodeBox {...box} height={height} isUnreachable={isUnreachable} />
      <TypeGlyph
        family={family}
        cx={leftEdge + GLYPH_INSET}
        cy={top + GLYPH_INSET}
      />
      <NodeTitle
        title={nodeTitle(node.id)}
        subtitle={subtitle}
        isUnreachable={isUnreachable}
        centerX={node.x}
        centerY={node.y}
      />
    </>
  );
}

function TerminalBody({ node }: NodeBodyProps) {
  return (
    <>
      <circle className={styles.terminalRing} cx={node.x} cy={node.y} r={11} />
      <circle className={styles.terminalCore} cx={node.x} cy={node.y} r={5} />
      <text
        className={styles.nodeId}
        x={node.x}
        y={node.y + 24}
        textAnchor="middle"
      >
        {nodeTitle(node.id)}
      </text>
    </>
  );
}

// The stop's circle centre from the box's top, and the title's drop below it.
const STOP_RADIUS = 12;
const STOP_CENTRE_DROP = 14;
const STOP_TITLE_DROP = 26;

function StopBody({ node, family, height }: NodeBodyProps) {
  const cy = node.y - height / 2 + STOP_CENTRE_DROP;

  return (
    <>
      <circle
        className={styles.stopCircle}
        cx={node.x}
        cy={cy}
        r={STOP_RADIUS}
      />
      <TypeGlyph family={family} cx={node.x} cy={cy} />
      <text
        className={styles.stopTitle}
        x={node.x}
        y={cy + STOP_TITLE_DROP}
        textAnchor="middle"
      >
        {nodeTitle(node.id)}
      </text>
    </>
  );
}

const BODY_BY_SHAPE = {
  card: CardBody,
  terminal: TerminalBody,
  stop: StopBody,
};

function NodePorts({
  ports,
  toneByEdge = NO_TONES,
}: {
  ports: LaidOutNode["ports"];
  toneByEdge?: ReadonlyMap<string, ConnectorTone>;
}) {
  return ports.map((port) => {
    const tone =
      port.side === "in" ? "in" : (toneByEdge.get(port.edge) ?? "neutral");

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
  return {
    top: node.y - height / 2,
    leftEdge: node.x - node.width / 2,
    width: node.width,
  };
}

/** Marks the node dimmed, and reports pointer and focus entering and leaving it so the graph can light its neighbourhood. */
function neighbourhoodAttrs(
  nodeId: string,
  { dimmed, onHover, keyboard }: GraphNodeProps,
) {
  return {
    "data-dim": dimmed || undefined,
    onPointerEnter: () => onHover?.(nodeId),
    onPointerLeave: () => onHover?.(null),
    onFocus: () => {
      onHover?.(nodeId);
      keyboard?.onFocusNode(nodeId);
    },
    onBlur: () => onHover?.(null),
  };
}

interface InteractionInput {
  nodeId: string;
  onSelect: GraphNodeProps["onSelect"];
  selected: boolean;
  keyboard: GraphNodeProps["keyboard"];
}

/** How the group answers a click or a key, and whether it is the pressed one; a node with no handler claims neither. */
function interactionAttrs({
  nodeId,
  onSelect,
  selected,
  keyboard,
}: InteractionInput) {
  if (!onSelect) {
    return { role: "group" as const };
  }

  return {
    role: "button" as const,
    "aria-pressed": selected,
    tabIndex: 0,
    onClick: () => onSelect(nodeId),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      keyboard?.onKeyDown(event);
      selectOnActivationKey(nodeId, onSelect)(event);
    },
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
