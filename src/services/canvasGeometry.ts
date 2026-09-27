/**
 * Canvas geometry: bounding boxes, anchors, ring/grid detection and alignment.
 *
 * Pure computation — no DOM access — so this module runs (and is testable) in a
 * plain Node environment. Extracted from canvasService during the R2 split.
 *
 * This file is the single import surface for the canvas geometry helpers: the
 * edge-connection family (Bezier control points, step bend handles, optimal
 * anchor sides) lives in `./canvasGeometryEdges`, and the multi-card layout
 * families (ring/grid alignment, detection and interactive spacing) in
 * `./canvasGeometryAlign`. Everything is re-exported here so importers keep
 * one entry point; the primitives the rest of the geometry is built on stay
 * in this file.
 */

import type { CanvasNode, CanvasNodeSide } from "../types/canvasTypes";

/**
 * Bounding box calculation for nodes
 */
export function computeBoundingBox(nodes: CanvasNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(100, maxX - minX),
    height: Math.max(100, maxY - minY),
  };
}

/**
 * Calculates anchor coordinate for a node on a specific side.
 * Connections strictly start and terminate at the exact geometric midpoint of the edge,
 * ensuring perfect alignment with the node's visual port handles (anchor dots).
 */
export function getNodeAnchorPoint(
  node: CanvasNode,
  side: CanvasNodeSide = "right",
): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
    case "right":
    default:
      return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

/**
 * Projects a point onto the given circle, i.e. moves it along the ray from the
 * ring centre until it sits exactly on the ring radius.
 *
 * Used so that ring edges — whose endpoints are card anchor points that do not
 * lie on the circle themselves — always start and end on the very same circle,
 * producing a perfectly round outline.
 */
export function projectPointOntoRing(
  point: { x: number; y: number },
  ring: { center: { x: number; y: number }; radius: number },
): { x: number; y: number } {
  const ox = point.x - ring.center.x;
  const oy = point.y - ring.center.y;
  const dist = Math.hypot(ox, oy);
  if (dist < 0.0001) {
    return { x: ring.center.x + ring.radius, y: ring.center.y };
  }
  const scale = ring.radius / dist;
  return { x: ring.center.x + ox * scale, y: ring.center.y + oy * scale };
}

export {
  computeBezierControlPoints,
  getStepBendHandleInfo,
  getOptimalAnchorSides,
} from "./canvasGeometryEdges";

export type { StepBendHandleInfo } from "./canvasGeometryEdges";

export {
  computeMinRingRadius,
  isPointInsideNodeHull,
  computeRingSpacingLayout,
  resizeRingSpacing,
  alignNodesInCircle,
  alignNodesInGrid,
  computeGridLayout,
  resizeGridSpacing,
  computeRingLayout,
  alignNodes,
} from "./canvasGeometryAlign";

export type {
  CanvasAlignDirection,
  CircleAlignOptions,
  RingSpacingLayout,
  GridAlignOptions,
  GridLayoutInfo,
} from "./canvasGeometryAlign";
