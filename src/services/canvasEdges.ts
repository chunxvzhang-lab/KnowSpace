/**
 * Canvas edge mutations: creating, connecting, spawning and reversing edges.
 *
 * Extracted from canvasService during the R2 split — see
 * the R2 canvas split. Code is byte-identical to the original.
 */

import type {
  CanvasEdge,
  CanvasEdgeLineStyle,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
} from "../types/canvasTypes";
import { CANVAS_COLOR_PALETTES } from "./canvasPrimitives";
import { computeGridLayout, computeRingLayout, getOptimalAnchorSides } from "./canvasGeometry";
import { getLoopEdgeColors } from "./canvasGraph";
import { getSourceNodeEdgeColor } from "./canvasColor";

/**
 * Automatically computes best attachment sides and creates an edge between two nodes
 */
export function createEdgeBetweenNodes(
  fromNode: CanvasNode,
  toNode: CanvasNode,
  label?: string,
  style: CanvasEdgeLineStyle = "bezier",
  existingEdges: CanvasEdge[] = [],
  allNodes?: CanvasNode[]
): CanvasEdge {
  const { fromSide, toSide } = getOptimalAnchorSides(fromNode, toNode);
  const color = getSourceNodeEdgeColor(fromNode, existingEdges, allNodes, toNode);

  return {
    id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromNode: fromNode.id,
    fromSide,
    fromEnd: "none",
    toNode: toNode.id,
    toSide,
    toEnd: "arrow",
    color,
    label: label || undefined,
    style,
  };
}

/**
 * Spawns a connected child card from a source node for rapid brainstorming
 */
export function spawnConnectedCard(
  sourceNode: CanvasNode,
  direction: "right" | "bottom" = "right",
  initialText?: string,
  label?: string,
  existingEdges: CanvasEdge[] = [],
  allNodes?: CanvasNode[]
): { newNode: CanvasTextNode; newEdge: CanvasEdge } {
  const newId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const gap = 120;
  const newX = direction === "right" ? sourceNode.x + sourceNode.width + gap : sourceNode.x;
  const newY = direction === "bottom" ? sourceNode.y + sourceNode.height + gap : sourceNode.y;
  const edgeColor = getSourceNodeEdgeColor(sourceNode, existingEdges, allNodes);

  const newNode: CanvasTextNode = {
    id: newId,
    type: "text",
    text: initialText || "### 分支想法\n输入关联论述与子思考...",
    x: newX,
    y: newY,
    width: Math.min(320, Math.max(260, sourceNode.width)),
    height: 160,
    color: sourceNode.color,
  };

  const newEdge: CanvasEdge = {
    id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromNode: sourceNode.id,
    fromSide: direction === "right" ? "right" : "bottom",
    fromEnd: "none",
    toNode: newId,
    toSide: direction === "right" ? "left" : "top",
    toEnd: "arrow",
    color: edgeColor,
    label: label || undefined,
    style: "bezier",
  };

  return { newNode, newEdge };
}

/**
 * Creates edges connecting a single root node to multiple target nodes (1-to-Many / Star).
 * Automatically computes optimal anchor sides for each connection and avoids duplicate edges.
 */
export function connectOneToMany(
  rootNode: CanvasNode,
  targetNodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  style: CanvasEdgeLineStyle = "bezier",
  allNodes?: CanvasNode[]
): CanvasEdge[] {
  // All lines originating from the same card share the identical color
  const edgeColor = getSourceNodeEdgeColor(rootNode, existingEdges, allNodes);
  const newEdges: CanvasEdge[] = [];
  for (const target of targetNodes) {
    if (target.id === rootNode.id) continue;
    const exists =
      existingEdges.some(
        (e) =>
          (e.fromNode === rootNode.id && e.toNode === target.id) ||
          (e.fromNode === target.id && e.toNode === rootNode.id)
      ) ||
      newEdges.some(
        (e) =>
          (e.fromNode === rootNode.id && e.toNode === target.id) ||
          (e.fromNode === target.id && e.toNode === rootNode.id)
      );
    if (!exists) {
      const edge = createEdgeBetweenNodes(rootNode, target, undefined, style);
      newEdges.push({ ...edge, color: edgeColor });
    }
  }
  return newEdges;
}

/**
 * Creates sequential chain edges connecting a sequence of nodes: A -> B -> C -> ...
 * By default, sorts nodes spatially (left to right, top to bottom) to prevent criss-crossing dead knots.
 * Skips duplicate edges.
 */
export function connectChainNodes(
  nodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  style: CanvasEdgeLineStyle = "bezier",
  spatiallySort: boolean = true,
  allNodes?: CanvasNode[]
): CanvasEdge[] {
  if (nodes.length < 2) return [];
  const orderedNodes = spatiallySort
    ? [...nodes].sort((a, b) => {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) > 40) return dx;
        return dy;
      })
    : [...nodes];

  const newEdges: CanvasEdge[] = [];
  for (let i = 0; i < orderedNodes.length - 1; i++) {
    const from = orderedNodes[i];
    const to = orderedNodes[i + 1];
    const exists =
      existingEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      ) ||
      newEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      );
    if (!exists) {
      const edge = createEdgeBetweenNodes(from, to, undefined, style);
      const edgeColor = getSourceNodeEdgeColor(from, [...existingEdges, ...newEdges], allNodes || nodes);
      newEdges.push({ ...edge, color: edgeColor });
    }
  }
  return newEdges;
}

/**
 * Creates closed loop / ring edges connecting a sequence of nodes:
 * A -> B -> C -> ... -> A
 * Useful for circular workflows, iterative thinking loops, and cyclic systems.
 * Slices nodes in angular order around the group's centroid, and binds edges
 * with tangential perimeter flow to produce clean, rounded circular loops without reverse buckles.
 *
 * Coloring strategy:
 * 1. Every edge inside the ring shares one identical color (one ring = one flow).
 * 2. The chosen color is never one already claimed by another ring on the
 *    canvas, so two different loops are always visually distinguishable.
 */
export function connectLoopNodes(
  nodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  style: CanvasEdgeLineStyle = "bezier",
  spatiallySort: boolean = true,
  allNodes?: CanvasNode[]
): CanvasEdge[] {
  if (nodes.length < 3) return connectChainNodes(nodes, existingEdges, style, spatiallySort, allNodes);

  const cx = nodes.reduce((sum, n) => sum + (n.x + n.width / 2), 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nodes.length;

  const orderedNodes = spatiallySort
    ? (() => {
        return [...nodes].sort((a, b) => {
          const angleA = Math.atan2(a.y + a.height / 2 - cy, a.x + a.width / 2 - cx);
          const angleB = Math.atan2(b.y + b.height / 2 - cy, b.x + b.width / 2 - cx);
          return angleA - angleB;
        });
      })()
    : [...nodes];

  const newEdges: CanvasEdge[] = [];
  const count = orderedNodes.length;
  const usedIncomingSides = new Map<string, CanvasNodeSide>();

  // Detect a rectangular grid layout first: its loop is drawn with straight
  // orthogonal segments, producing a clean rectangular frame.
  //
  // Grid must win over ring: the four corners of a 2x2 rectangle are exactly
  // equidistant from their centroid, so a rectangular arrangement also
  // satisfies the "all cards on a common circle" test. Checking the grid first
  // keeps such a layout rectangular instead of turning it into a circle.
  const gridLayout = computeGridLayout(orderedNodes);
  // Otherwise, if the cards really do sit on a circle, every segment becomes a
  // true arc so the loop is a perfectly round ring.
  const ringLayout = gridLayout ? null : computeRingLayout(orderedNodes);

  // Unified color for the whole loop so that all ring segments visually
  // belong to a single semantic flow, regardless of which node is "from".
  //
  // We first resolve the first node's preferred source color, but we then
  // reject it when that color is already claimed by another ring on the
  // canvas — guaranteeing "one ring = one color, different rings = different
  // colors".
  const preferredLoopColor = getSourceNodeEdgeColor(
    orderedNodes[0],
    existingEdges,
    allNodes || nodes
  );
  const loopUsedColors = getLoopEdgeColors(existingEdges);
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);

  let loopEdgeColor: string;
  if (preferredLoopColor && !loopUsedColors.has(preferredLoopColor)) {
    loopEdgeColor = preferredLoopColor;
  } else {
    loopEdgeColor =
      paletteKeys.find((k) => !loopUsedColors.has(k)) ??
      paletteKeys[loopUsedColors.size % paletteKeys.length];
  }

  const nextClockwiseSide = (s: CanvasNodeSide): CanvasNodeSide => {
    switch (s) {
      case "top":
        return "right";
      case "right":
        return "bottom";
      case "bottom":
        return "left";
      case "left":
      default:
        return "top";
    }
  };

  for (let i = 0; i < count; i++) {
    const from = orderedNodes[i];
    const to = orderedNodes[(i + 1) % count];
    const exists =
      existingEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      ) ||
      newEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      );
    if (!exists) {
      // Relative movement vector between consecutive nodes in the ring:
      const dx = to.x + to.width / 2 - (from.x + from.width / 2);
      const dy = to.y + to.height / 2 - (from.y + from.height / 2);

      let fromSide: CanvasNodeSide = "right";
      let toSide: CanvasNodeSide = "left";

      if (Math.abs(dx) >= Math.abs(dy) * 1.3) {
        // Predominantly horizontal movement
        if (dx > 0) {
          fromSide = "right";
          toSide = "left";
        } else {
          fromSide = "left";
          toSide = "right";
        }
      } else if (Math.abs(dy) >= Math.abs(dx) * 1.3) {
        // Predominantly vertical movement
        if (dy > 0) {
          fromSide = "bottom";
          toSide = "top";
        } else {
          fromSide = "top";
          toSide = "bottom";
        }
      } else {
        // Diagonal quadrants along the clockwise perimeter:
        if (dx > 0 && dy > 0) {
          // Down-Right
          fromSide = "right";
          toSide = "top";
        } else if (dx < 0 && dy > 0) {
          // Down-Left
          fromSide = "bottom";
          toSide = "right";
        } else if (dx < 0 && dy < 0) {
          // Up-Left
          fromSide = "left";
          toSide = "bottom";
        } else {
          // Up-Right
          fromSide = "top";
          toSide = "left";
        }
      }

      // Ensure that a node's outgoing side does NOT overlap with its incoming side:
      const incomingSide = usedIncomingSides.get(from.id);
      if (incomingSide && fromSide === incomingSide) {
        fromSide = nextClockwiseSide(fromSide);
      }

      usedIncomingSides.set(to.id, toSide);

      const edgeColor = loopEdgeColor;
      newEdges.push({
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i + 1}`,
        fromNode: from.id,
        fromSide,
        toNode: to.id,
        toSide,
        color: edgeColor,
        style,
        // When the cards already sit on a common circle, connect them with a
        // true circular arc so the closed loop reads as a perfectly round ring.
        ...(ringLayout
          ? { ringCenter: ringLayout.center, ringRadius: ringLayout.radius }
          : {}),
        // Likewise, a rectangular grid gets straight orthogonal segments.
        ...(gridLayout ? { gridPath: true } : {}),
      });
    }
  }
  return newEdges;
}

/**
 * Removes all edges connected to the specified node (both incoming and outgoing).
 */
export function disconnectNodeEdges(nodeId: string, edges: CanvasEdge[]): CanvasEdge[] {
  return edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId);
}

/**
 * Spawns multiple connected child cards (1-to-Many) from a source node for rapid brainstorming.
 * Neatly spaces the spawned cards vertically (when branching right) or horizontally (when branching bottom).
 */
export function spawnMultipleBranches(
  sourceNode: CanvasNode,
  count: number = 3,
  direction: "right" | "bottom" = "right",
  existingEdges: CanvasEdge[] = [],
  allNodes?: CanvasNode[]
): { newNodes: CanvasTextNode[]; newEdges: CanvasEdge[] } {
  const newNodes: CanvasTextNode[] = [];
  const newEdges: CanvasEdge[] = [];
  const gap = 120;
  const cardWidth = Math.min(320, Math.max(260, sourceNode.width));
  const cardHeight = 150;
  const spacing = 20;

  const totalHeight = count * cardHeight + (count - 1) * spacing;
  const totalWidth = count * cardWidth + (count - 1) * spacing;

  const startY =
    direction === "right"
      ? sourceNode.y + sourceNode.height / 2 - totalHeight / 2
      : sourceNode.y + sourceNode.height + gap;

  const startX =
    direction === "right"
      ? sourceNode.x + sourceNode.width + gap
      : sourceNode.x + sourceNode.width / 2 - totalWidth / 2;

  for (let i = 0; i < count; i++) {
    const newId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i + 1}`;
    const x = direction === "right" ? startX : startX + i * (cardWidth + spacing);
    const y = direction === "right" ? startY + i * (cardHeight + spacing) : startY;

    const newNode: CanvasTextNode = {
      id: newId,
      type: "text",
      text: `### 分支思考 ${i + 1}\n输入关联论述与子观点...`,
      x: Math.round(x),
      y: Math.round(y),
      width: cardWidth,
      height: cardHeight,
      color: sourceNode.color || "5",
    };

    const newEdge = createEdgeBetweenNodes(
      sourceNode,
      newNode,
      undefined,
      "bezier",
      [...existingEdges, ...newEdges],
      allNodes
    );

    newNodes.push(newNode);
    newEdges.push(newEdge);
  }

  return { newNodes, newEdges };
}

/**
 * Cycles arrow heads: None -> Forward -> Bidirectional -> None
 */
export function cycleEdgeArrow(edge: CanvasEdge): CanvasEdge {
  if (edge.toEnd === "arrow" && edge.fromEnd === "arrow") {
    // None
    return { ...edge, fromEnd: "none", toEnd: "none" };
  }
  if (edge.fromEnd === "none" && edge.toEnd === "none") {
    // Forward
    return { ...edge, fromEnd: "none", toEnd: "arrow" };
  }
  // Bidirectional
  return { ...edge, fromEnd: "arrow", toEnd: "arrow" };
}

/**
 * Cycles line style: Bezier -> Step -> Straight -> Bezier
 */
export function cycleEdgeStyle(edge: CanvasEdge): CanvasEdge {
  const nextStyle: CanvasEdgeLineStyle =
    edge.style === "straight" ? "step" : edge.style === "step" ? "bezier" : "straight";
  return { ...edge, style: nextStyle };
}

/**
 * Cycles stroke pattern: solid -> dashed -> dotted -> solid
 */
export function cycleEdgeStrokePattern(edge: CanvasEdge): CanvasEdge {
  const current = edge.strokePattern || "solid";
  const next = current === "solid" ? "dashed" : current === "dashed" ? "dotted" : "solid";
  return { ...edge, strokePattern: next };
}

/**
 * Reverses edge direction
 */
export function reverseEdgeDirection(edge: CanvasEdge): CanvasEdge {
  let newFromEnd: "none" | "arrow" = "none";
  let newToEnd: "none" | "arrow" = "arrow";

  if (edge.fromEnd === "arrow" && edge.toEnd === "arrow") {
    newFromEnd = "arrow";
    newToEnd = "arrow";
  } else if (edge.fromEnd === "none" && edge.toEnd === "none") {
    newFromEnd = "none";
    newToEnd = "none";
  } else if (edge.fromEnd === "arrow" && (!edge.toEnd || edge.toEnd === "none")) {
    newFromEnd = "none";
    newToEnd = "arrow";
  } else {
    newFromEnd = "none";
    newToEnd = "arrow";
  }

  return {
    ...edge,
    fromNode: edge.toNode,
    toNode: edge.fromNode,
    fromSide: edge.toSide,
    toSide: edge.fromSide,
    fromEnd: newFromEnd,
    toEnd: newToEnd,
  };
}
