/**
 * Edge routing: AABB obstacle avoidance and orthogonal step paths.
 *
 * Extracted from canvasService during the R2 split — see
 * the R2 canvas split. Code is byte-identical to the original.
 */

import type { CanvasEdgeLineStyle, CanvasNodeSide, CanvasObstacle } from "../types/canvasTypes";
import { computeBezierControlPoints, projectPointOntoRing } from "./canvasGeometry";

export interface AABBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Gathers every obstacle the given orthogonal polyline pierces (each expanded
 * by `margin`) and merges them into one envelope box.
 *
 * Bypassing the merged envelope instead of only the first hit matters: with a
 * chain of adjacent cards, detouring around just the first one still crossed
 * the rest of the chain.
 */
export function collectCollidingEnvelope(
  points: Array<{ x: number; y: number }>,
  obstacles: CanvasObstacle[],
  margin: number
): AABBBox | null {
  const boxes: AABBBox[] = [];
  for (const obs of obstacles) {
    const box: AABBBox = {
      minX: obs.x - margin,
      minY: obs.y - margin,
      maxX: obs.x + obs.width + margin,
      maxY: obs.y + obs.height + margin,
    };
    if (pathIntersectsBox(points, box)) boxes.push(box);
  }
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export function horizontalSegmentIntersectsBox(x1: number, x2: number, y: number, box: AABBBox): boolean {
  if (y < box.minY || y > box.maxY) return false;
  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  return Math.max(segMinX, box.minX) < Math.min(segMaxX, box.maxX);
}

export function verticalSegmentIntersectsBox(x: number, y1: number, y2: number, box: AABBBox): boolean {
  if (x < box.minX || x > box.maxX) return false;
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);
  return Math.max(segMinY, box.minY) < Math.min(segMaxY, box.maxY);
}

export function pathIntersectsBox(
  points: Array<{ x: number; y: number }>,
  box: AABBBox
): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const pt1 = points[i];
    const pt2 = points[i + 1];
    if (Math.abs(pt1.y - pt2.y) < 0.001) {
      if (horizontalSegmentIntersectsBox(pt1.x, pt2.x, pt1.y, box)) return true;
    } else if (Math.abs(pt1.x - pt2.x) < 0.001) {
      if (verticalSegmentIntersectsBox(pt1.x, pt1.y, pt2.y, box)) return true;
    }
  }
  return false;
}

/**
 * Generates an SVG path for connecting edges with refined curvature, orthogonal routing,
 * and smart AABB obstacle avoidance.
 */
export function computeEdgePath(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  style: CanvasEdgeLineStyle = "bezier",
  stepOffset?: number,
  ring?: { center: { x: number; y: number }; radius: number },
  obstacles?: CanvasObstacle[]
): string {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // ── Ring layout ────────────────────────────────────────────────────────
  // Draw a true circular arc around the ring centre so that a closed loop of
  // cards arranged on a circle is connected by a perfectly round outline.
  // Both endpoints are projected onto the ring radius, and the shorter arc is
  // always taken, which keeps every segment part of the same circle.
  if (ring && ring.radius > 0) {
    const a = projectPointOntoRing(p1, ring);
    const b = projectPointOntoRing(p2, ring);

    let delta = Math.atan2(b.y - ring.center.y, b.x - ring.center.x) -
      Math.atan2(a.y - ring.center.y, a.x - ring.center.x);
    // Normalise to (-π, π] so we always draw the shorter arc
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;

    const sweep = delta >= 0 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${ring.radius} ${ring.radius} 0 0 ${sweep} ${b.x} ${b.y}`;
  }

  if (style === "straight") {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }

  if (style === "step") {
    // 1. Check obstacle avoidance if obstacle bounding boxes are provided
    if (obstacles && obstacles.length > 0) {
      const MARGIN = 14;
      const isHorizontal = (side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right");
      const isVertical = (side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom");

      if (isHorizontal) {
        const midX = p1.x + dx / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: midX, y: p1.y },
          { x: midX, y: p2.y },
          { x: p2.x, y: p2.y },
        ];

        // Merge EVERY obstacle the default path pierces into one envelope, so
        // a chain of adjacent cards is bypassed in a single detour.
        const box = collectCollidingEnvelope(defaultPts, obstacles, MARGIN);

        if (box) {
          const routeAbove = Math.abs(p1.y - box.minY) < Math.abs(p1.y - box.maxY);
          const bypassY = routeAbove ? box.minY - MARGIN : box.maxY + MARGIN;
          const seg1X = p1.x < p2.x ? Math.min(p1.x + 24, box.minX - 6) : Math.max(p1.x - 24, box.maxX + 6);
          const seg2X = p1.x < p2.x ? Math.max(p2.x - 24, box.maxX + 6) : Math.min(p2.x + 24, box.minX - 6);

          return `M ${p1.x} ${p1.y} L ${seg1X} ${p1.y} L ${seg1X} ${bypassY} L ${seg2X} ${bypassY} L ${seg2X} ${p2.y} L ${p2.x} ${p2.y}`;
        }
      } else if (isVertical) {
        const midY = p1.y + dy / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: p1.x, y: midY },
          { x: p2.x, y: midY },
          { x: p2.x, y: p2.y },
        ];

        // Same merged-envelope strategy for the vertical orientation.
        const box = collectCollidingEnvelope(defaultPts, obstacles, MARGIN);

        if (box) {
          const routeLeft = Math.abs(p1.x - box.minX) < Math.abs(p1.x - box.maxX);
          const bypassX = routeLeft ? box.minX - MARGIN : box.maxX + MARGIN;
          const seg1Y = p1.y < p2.y ? Math.min(p1.y + 24, box.minY - 6) : Math.max(p1.y - 24, box.maxY + 6);
          const seg2Y = p1.y < p2.y ? Math.max(p2.y - 24, box.maxY + 6) : Math.min(p2.y + 24, box.minY - 6);

          return `M ${p1.x} ${p1.y} L ${p1.x} ${seg1Y} L ${bypassX} ${seg1Y} L ${bypassX} ${seg2Y} L ${p2.x} ${seg2Y} L ${p2.x} ${p2.y}`;
        }
      }
    }

    // Orthogonal step routing tailored to anchor orientations and optional draggable offset:
    // Case 1: Horizontal start to Horizontal end (e.g. right -> left)
    if ((side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right")) {
      const midX = p1.x + dx / 2 + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    }
    // Case 2: Vertical start to Vertical end (e.g. bottom -> top)
    if ((side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom")) {
      const midY = p1.y + dy / 2 + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    }
    // Case 3: Horizontal start to Vertical end (Corner 90deg turn or with offset)
    if ((side1 === "left" || side1 === "right") && (side2 === "top" || side2 === "bottom")) {
      const turnX = p2.x + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${turnX} ${p1.y} L ${turnX} ${p2.y} L ${p2.x} ${p2.y}`;
    }
    // Case 4: Vertical start to Horizontal end (Corner 90deg turn or with offset)
    if ((side1 === "top" || side1 === "bottom") && (side2 === "left" || side2 === "right")) {
      const turnY = p2.y + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${p1.x} ${turnY} L ${p2.x} ${turnY} L ${p2.x} ${p2.y}`;
    }
    const midX = p1.x + dx / 2 + (stepOffset || 0);
    return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
  }

  // Smooth cubic Bezier curve with bounded non-overshooting envelope
  const { cp1, cp2 } = computeBezierControlPoints(p1, side1, p2, side2);
  return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Computes exact midpoint coordinates on connecting edge paths (Bezier, Step, Straight)
 */
export function computeEdgeMidpoint(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  style: CanvasEdgeLineStyle = "bezier",
  stepOffset?: number,
  ring?: { center: { x: number; y: number }; radius: number },
  obstacles?: CanvasObstacle[]
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // Ring layout: midpoint of the shorter circular arc (angle bisector)
  if (ring && ring.radius > 0) {
    const projectAngle = (p: { x: number; y: number }) => {
      const ox = p.x - ring.center.x;
      const oy = p.y - ring.center.y;
      if (Math.hypot(ox, oy) < 0.0001) return 0;
      return Math.atan2(oy, ox);
    };

    let a1 = projectAngle(p1);
    let a2 = projectAngle(p2);
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;

    const midAngle = a1 + delta / 2;
    return {
      x: Math.round(ring.center.x + ring.radius * Math.cos(midAngle)),
      y: Math.round(ring.center.y + ring.radius * Math.sin(midAngle)),
    };
  }

  if (style === "straight") {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  if (style === "step") {
    if (obstacles && obstacles.length > 0) {
      const MARGIN = 14;
      const isHorizontal = (side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right");
      const isVertical = (side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom");

      if (isHorizontal) {
        const midX = p1.x + dx / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: midX, y: p1.y },
          { x: midX, y: p2.y },
          { x: p2.x, y: p2.y },
        ];
        const box = collectCollidingEnvelope(defaultPts, obstacles, MARGIN);
        if (box) {
          const routeAbove = Math.abs(p1.y - box.minY) < Math.abs(p1.y - box.maxY);
          const bypassY = routeAbove ? box.minY - MARGIN : box.maxY + MARGIN;
          const seg1X = p1.x < p2.x ? Math.min(p1.x + 24, box.minX - 6) : Math.max(p1.x - 24, box.maxX + 6);
          const seg2X = p1.x < p2.x ? Math.max(p2.x - 24, box.maxX + 6) : Math.min(p2.x + 24, box.minX - 6);
          return { x: Math.round((seg1X + seg2X) / 2), y: Math.round(bypassY) };
        }
      } else if (isVertical) {
        const midY = p1.y + dy / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: p1.x, y: midY },
          { x: p2.x, y: midY },
          { x: p2.x, y: p2.y },
        ];
        const box = collectCollidingEnvelope(defaultPts, obstacles, MARGIN);
        if (box) {
          const routeLeft = Math.abs(p1.x - box.minX) < Math.abs(p1.x - box.maxX);
          const bypassX = routeLeft ? box.minX - MARGIN : box.maxX + MARGIN;
          const seg1Y = p1.y < p2.y ? Math.min(p1.y + 24, box.minY - 6) : Math.max(p1.y - 24, box.maxY + 6);
          const seg2Y = p1.y < p2.y ? Math.max(p2.y - 24, box.maxY + 6) : Math.min(p2.y + 24, box.minY - 6);
          return { x: Math.round(bypassX), y: Math.round((seg1Y + seg2Y) / 2) };
        }
      }
    }

    if ((side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right")) {
      return { x: p1.x + dx / 2 + (stepOffset || 0), y: (p1.y + p2.y) / 2 };
    }
    if ((side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom")) {
      return { x: (p1.x + p2.x) / 2, y: p1.y + dy / 2 + (stepOffset || 0) };
    }
    if (side1 === "left" || side1 === "right") {
      return { x: p2.x + (stepOffset || 0), y: (p1.y + p2.y) / 2 };
    }
    return { x: (p1.x + p2.x) / 2, y: p2.y + (stepOffset || 0) };
  }

  // Smooth cubic Bezier curve midpoint at t = 0.5:
  // B(0.5) = 0.125 * p1 + 0.375 * cp1 + 0.375 * cp2 + 0.125 * p2
  const { cp1, cp2 } = computeBezierControlPoints(p1, side1, p2, side2);

  return {
    x: Math.round(0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x),
    y: Math.round(0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y),
  };
}
