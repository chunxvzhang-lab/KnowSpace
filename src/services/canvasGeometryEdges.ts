/**
 * Edge-connection geometry: cubic Bezier control points, orthogonal (step)
 * bend handles, and the automatic anchor-side choice between two cards.
 *
 * Split out of canvasGeometry during the phase-1 size split; the code is
 * byte-identical to the original there (which itself came from canvasService
 * in the R2 split). Pure computation — no DOM access. See canvasGeometry.ts
 * for the import surface.
 */

import type { CanvasNode, CanvasNodeSide } from "../types/canvasTypes";

/**

/**
 * Calculates cubic Bezier control points with strict bounding envelope
 * to guarantee that the curve never balloons or overshoots out of the cards' bounding box.
 */
export function computeBezierControlPoints(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const cp1 = { ...p1 };
  const cp2 = { ...p2 };

  const isHoriz1 = side1 === "left" || side1 === "right";
  const isHoriz2 = side2 === "left" || side2 === "right";

  // Case 1: Both Horizontal (e.g. right -> left or left -> right)
  if (isHoriz1 && isHoriz2) {
    const isForward =
      (side1 === "right" && side2 === "left" && dx > 0) ||
      (side1 === "left" && side2 === "right" && dx < 0);
    if (isForward) {
      const tangentDist = Math.max(20, Math.min(140, Math.abs(dx) * 0.5));
      cp1.x += side1 === "right" ? tangentDist : -tangentDist;
      cp2.x += side2 === "right" ? tangentDist : -tangentDist;
    } else {
      const loopDist = Math.max(25, Math.min(60, dist * 0.25));
      cp1.x += side1 === "right" ? loopDist : -loopDist;
      cp2.x += side2 === "right" ? loopDist : -loopDist;
    }
    return { cp1, cp2 };
  }

  // Case 2: Both Vertical (e.g. bottom -> top or top -> bottom)
  if (!isHoriz1 && !isHoriz2) {
    const isForward =
      (side1 === "bottom" && side2 === "top" && dy > 0) ||
      (side1 === "top" && side2 === "bottom" && dy < 0);
    if (isForward) {
      const tangentDist = Math.max(20, Math.min(140, Math.abs(dy) * 0.5));
      cp1.y += side1 === "bottom" ? tangentDist : -tangentDist;
      cp2.y += side2 === "bottom" ? tangentDist : -tangentDist;
    } else {
      const loopDist = Math.max(25, Math.min(60, dist * 0.25));
      cp1.y += side1 === "bottom" ? loopDist : -loopDist;
      cp2.y += side2 === "bottom" ? loopDist : -loopDist;
    }
    return { cp1, cp2 };
  }

  // Case 3: Perpendicular L-turn (one Horizontal, one Vertical)
  // Bound control point tangents strictly inside the gap so it NEVER arches high above endpoints
  if (isHoriz1) {
    // p1 leaves horizontally, p2 enters vertically
    const isTargetAheadInX = (side1 === "right" && dx > 0) || (side1 === "left" && dx < 0);
    const extentX = isTargetAheadInX
      ? Math.max(15, Math.min(110, Math.abs(dx) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp1.x += side1 === "right" ? extentX : -extentX;

    const isAheadInY = (side2 === "top" && dy > 0) || (side2 === "bottom" && dy < 0);
    const extentY = isAheadInY
      ? Math.max(15, Math.min(110, Math.abs(dy) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp2.y += side2 === "bottom" ? extentY : -extentY;
  } else {
    // p1 leaves vertically, p2 enters horizontally
    const isTargetAheadInY = (side1 === "bottom" && dy > 0) || (side1 === "top" && dy < 0);
    const extentY = isTargetAheadInY
      ? Math.max(15, Math.min(110, Math.abs(dy) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp1.y += side1 === "bottom" ? extentY : -extentY;

    const isAheadInX = (side2 === "left" && dx > 0) || (side2 === "right" && dx < 0);
    const extentX = isAheadInX
      ? Math.max(15, Math.min(110, Math.abs(dx) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp2.x += side2 === "right" ? extentX : -extentX;
  }

  return { cp1, cp2 };
}

/**
 * Information about the draggable bend handle on an orthogonal (step) edge
 */
export interface StepBendHandleInfo {
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
}

export function getStepBendHandleInfo(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  stepOffset?: number,
): StepBendHandleInfo {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if ((side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right")) {
    const midX = p1.x + dx / 2 + (stepOffset || 0);
    return {
      x: midX,
      y: (p1.y + p2.y) / 2,
      orientation: "horizontal",
    };
  }

  if ((side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom")) {
    const midY = p1.y + dy / 2 + (stepOffset || 0);
    return {
      x: (p1.x + p2.x) / 2,
      y: midY,
      orientation: "vertical",
    };
  }

  if (side1 === "left" || side1 === "right") {
    const turnX = p2.x + (stepOffset || 0);
    return {
      x: turnX,
      y: (p1.y + p2.y) / 2,
      orientation: "horizontal",
    };
  }

  const turnY = p2.y + (stepOffset || 0);
  return {
    x: (p1.x + p2.x) / 2,
    y: turnY,
    orientation: "vertical",
  };
}

/**
 * Automatically computes best attachment sides between two nodes based on relative coordinates.
 * Priority rules:
 * 1. Horizontal band (overlap in Y + horizontal gap): clearly side-by-side -> right/left routing.
 * 2. Vertical band (overlap in X + vertical gap): clearly stacked -> bottom/top routing.
 * 3. Clear vertical separation (gapY > 0):
 *    In multi-tier / multi-row layouts, architectures, and trees, connections between tiers
 *    must always route bottom -> top or top -> bottom, even for outermost cards where horizontal
 *    span (gapX) across the canvas is wide.
 * 4. Horizontal gap (gapX > 0, gapY <= 0): left/right routing.
 * 5. Overlapping nodes: fall back to center-delta direction.
 */
export function getOptimalAnchorSides(
  fromNode: CanvasNode,
  toNode: CanvasNode,
): { fromSide: CanvasNodeSide; toSide: CanvasNodeSide } {
  const fromRight = fromNode.x + fromNode.width;
  const fromBottom = fromNode.y + fromNode.height;
  const toRight = toNode.x + toNode.width;
  const toBottom = toNode.y + toNode.height;

  const fromCenterX = fromNode.x + fromNode.width / 2;
  const fromCenterY = fromNode.y + fromNode.height / 2;
  const toCenterX = toNode.x + toNode.width / 2;
  const toCenterY = toNode.y + toNode.height / 2;

  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  const gapX =
    toNode.x >= fromRight ? toNode.x - fromRight : fromNode.x >= toRight ? fromNode.x - toRight : 0;
  const gapY =
    toNode.y >= fromBottom
      ? toNode.y - fromBottom
      : fromNode.y >= toBottom
        ? fromNode.y - toBottom
        : 0;

  const overlapX = Math.max(0, Math.min(fromRight, toRight) - Math.max(fromNode.x, toNode.x));
  const overlapY = Math.max(0, Math.min(fromBottom, toBottom) - Math.max(fromNode.y, toNode.y));

  // 1. Nodes share a horizontal band (overlap in Y) and horizontal gap exists:
  //    Cards in the same row/container connecting side-by-side.
  if (overlapY > 0 && gapX > 0) {
    return dx >= 0 ? { fromSide: "right", toSide: "left" } : { fromSide: "left", toSide: "right" };
  }

  // 2. Nodes share a vertical band (overlap in X) and vertical gap exists:
  //    Cards in the same column connecting vertically.
  if (overlapX > 0 && gapY > 0) {
    return dy >= 0 ? { fromSide: "bottom", toSide: "top" } : { fromSide: "top", toSide: "bottom" };
  }

  // 3. Clear vertical separation (one node is above the other, gapY > 0):
  //    In top-down / bottom-up architectures, multi-row layouts, and tree structures,
  //    connections between tiers must always route bottom -> top or top -> bottom,
  //    even for outermost cards where horizontal distance is wide.
  if (gapY > 0) {
    // Only if vertical gap is negligible (< 40px) AND horizontal gap is overwhelmingly dominant (> 3x):
    if (gapY < 40 && gapX > gapY * 3) {
      return dx >= 0
        ? { fromSide: "right", toSide: "left" }
        : { fromSide: "left", toSide: "right" };
    }
    return dy >= 0 ? { fromSide: "bottom", toSide: "top" } : { fromSide: "top", toSide: "bottom" };
  }

  // 4. Nodes have horizontal gap (no vertical gap):
  if (gapX > 0) {
    return dx >= 0 ? { fromSide: "right", toSide: "left" } : { fromSide: "left", toSide: "right" };
  }

  // 5. Overlapping nodes (no gap in either direction) → use center-delta direction
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: "right", toSide: "left" } : { fromSide: "left", toSide: "right" };
  } else {
    return dy >= 0 ? { fromSide: "bottom", toSide: "top" } : { fromSide: "top", toSide: "bottom" };
  }
}
