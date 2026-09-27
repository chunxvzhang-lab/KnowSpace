import type { MindmapLineStyle, MindmapNode } from "../core/types";
import { BRANCH_COLORS, calculateNodeDimensions } from "./mindmapService";
import {
  SIBLING_GAP,
  type MindmapLayoutNode,
  type MindmapLayoutResult,
  type MindmapLayoutSide,
  layoutBounds,
  makeLayoutNode,
  shiftToOrigin,
} from "./mindmapLayoutShared";

/**
 * The layout that grows outwards from a centre.
 *
 * It shares the node shape and the finishing passes with the other layouts, but
 * geometry is its own here: children sit on a ring rather than in a row, so it
 * brings its own sector arithmetic, its own edge builder (bent along the radius
 * rather than along x or y) and its own answer to where a collapse toggle goes.
 */

/**
 * How much of a sector follows subtree size, the rest being an equal share.
 *
 * See the radial layout below: weighting by size alone sounds right and is not,
 * because the radius a ring needs to keep two boxes apart is their width divided
 * by their angular gap, and a branch that holds one leaf is then a sliver wide
 * enough to push the whole ring thousands of pixels out.
 */
const SECTOR_WEIGHT_MIX = 0.5;

/** Visible node count of a subtree: what a sector is shared out by. */
function subtreeSize(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
  if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) return 1;
  return 1 + node.children.reduce((sum, child) => sum + subtreeSize(child, collapsedIds), 0);
}

/** Half the width a box covers along the direction it is placed in. */
function radialHalfExtent(dimensions: { width: number; height: number }, angle: number): number {
  const alongX = dimensions.width * Math.abs(Math.cos(angle));
  const alongY = dimensions.height * Math.abs(Math.sin(angle));
  return (alongX + alongY) / 2;
}

/**
 * Where the ray from a box's centre towards a point leaves the box.
 *
 * Each axis is scaled by whichever half-width the ray reaches first, and the
 * smaller of the two scales is the edge it actually meets — which is what makes
 * a connector start on the boundary rather than at the centre.
 */
function boxEdgePoint(
  box: { x: number; y: number; width: number; height: number },
  towardsX: number,
  towardsY: number,
): { x: number; y: number } {
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  const dx = towardsX - centreX;
  const dy = towardsY - centreY;
  if (dx === 0 && dy === 0) return { x: centreX, y: centreY };

  const scaleX = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: centreX + dx * scale, y: centreY + dy * scale };
}

/** An angle folded into (-pi, pi], so a midpoint takes the shorter way round. */
function normaliseAngle(angle: number): number {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

/**
 * The edge a radial node's toggle belongs on: the one facing away from the centre.
 *
 * The layout places the toggle by offset rather than by side, because a radial
 * node's children are spread around it. This is the fallback for anything that
 * only reads the side, and it says where most of the children are.
 */
function radialSide(x: number, y: number): MindmapLayoutSide {
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? "left" : "right";
  return y > 0 ? "bottom" : "right";
}

/**
 * A connector that leaves its parent heading towards its child, on a map that
 * radiates from a centre.
 *
 * The same three shapes as everywhere else, bent along the radius rather than
 * along x or y: `step` runs out to the middle ring, across it, and on; `bezier`
 * uses the same two points as its controls. `straight` needs neither, which is
 * why a radial map drawn with straight connectors is a set of spokes.
 */
function buildRadialEdgePath(
  centre: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: MindmapLineStyle,
): string {
  if (style === "straight") {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  const fromAngle = Math.atan2(from.y - centre.y, from.x - centre.x);
  const toAngle = Math.atan2(to.y - centre.y, to.x - centre.x);
  const midRadius =
    (Math.hypot(from.x - centre.x, from.y - centre.y) +
      Math.hypot(to.x - centre.x, to.y - centre.y)) /
    2;
  // The shorter way round, or a branch that sits just past the start of the
  // circle would send its connector the long way across the whole map.
  const midAngle = fromAngle + normaliseAngle(toAngle - fromAngle) / 2;

  const onMidRing = (angle: number) => ({
    x: centre.x + Math.cos(angle) * midRadius,
    y: centre.y + Math.sin(angle) * midRadius,
  });
  const first = onMidRing(fromAngle);
  const second = onMidRing(midAngle);

  return style === "step"
    ? `M ${from.x} ${from.y} L ${first.x} ${first.y} L ${second.x} ${second.y} L ${to.x} ${to.y}`
    : `M ${from.x} ${from.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${to.x} ${to.y}`;
}

/**
 * Root in the middle, branches radiating outwards.
 *
 * Two phases, because they answer different questions. The first gives every
 * node an angle: a node's sector is shared among its children by how much of the
 * map each one holds. The second gives every depth a radius — only then is there
 * anything to place.
 *
 * The sector split blends subtree size with an equal share rather than using the
 * size alone. Pure weighting is the obvious rule and it is the one that breaks:
 * the radius a ring needs to keep two boxes apart is their width divided by the
 * angular gap between them, so a branch holding one leaf beside a heavy one
 * pushes its whole ring out to thousands of pixels. The blend bounds the
 * thinnest sector at a fixed fraction of its parent's, which keeps the map a
 * readable size while a heavier branch still gets visibly more room.
 */
export function layoutRadialTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>,
): MindmapLayoutResult {
  type Entry = {
    node: MindmapNode;
    dimensions: { width: number; height: number; lines: string[] };
    depth: number;
    angle: number;
    colorIndex: number;
  };

  const allNodes: MindmapLayoutNode[] = [];
  const placed = new Map<string, MindmapLayoutNode>();
  /** Every node that will be on the canvas, with the angle phase one gave it. */
  const entries: Entry[] = [];

  function assign(
    node: MindmapNode,
    dimensions: Entry["dimensions"],
    depth: number,
    angle: number,
    colorIndex: number,
    sector: number,
  ): void {
    entries.push({ node, dimensions, depth, angle, colorIndex });
    if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) return;

    const weights = node.children.map((child) => subtreeSize(child, collapsedIds));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const equalShare = 1 / node.children.length;
    let start = angle - sector / 2;
    node.children.forEach((child, index) => {
      const share =
        sector *
        (SECTOR_WEIGHT_MIX * (weights[index] / total) + (1 - SECTOR_WEIGHT_MIX) * equalShare);
      assign(
        child,
        calculateNodeDimensions(child),
        depth + 1,
        start + share / 2,
        colorIndex,
        share,
      );
      start += share;
    });
  }

  const rootDimensions = calculateNodeDimensions(rootNode);
  const rootCollapsed = collapsedIds.has(rootNode.id);
  if (!rootCollapsed && rootNode.children && rootNode.children.length > 0) {
    const children = rootNode.children;
    const weights = children.map((child) => subtreeSize(child, collapsedIds));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const equalShare = 1 / children.length;
    // The first branch starts at the top and the rest follow clockwise, so the
    // order the reader's eye travels is the document's own order.
    let angle = -Math.PI / 2;
    children.forEach((child, index) => {
      const share =
        Math.PI *
        2 *
        (SECTOR_WEIGHT_MIX * (weights[index] / total) + (1 - SECTOR_WEIGHT_MIX) * equalShare);
      // Each first-level branch carries its own colour; deeper nodes inherit the
      // branch's, exactly as in the other layouts.
      assign(
        child,
        calculateNodeDimensions(child),
        1,
        angle + share / 2,
        index % BRANCH_COLORS.length,
        share,
      );
      angle += share;
    });
  }

  // ── Phase two: a radius per depth ─────────────────────────────────────────
  const byDepth = new Map<number, Entry[]>();
  for (const entry of entries) {
    const ring = byDepth.get(entry.depth) ?? [];
    ring.push(entry);
    byDepth.set(entry.depth, ring);
  }

  /**
   * The smallest radius at which a ring's own boxes stop touching.
   *
   * Two neighbours a gap apart in angle are about `radius * gap` apart along the
   * arc, and need half of each box plus a gap between them. The first and last
   * entries are neighbours too: a ring is a circle, not a line.
   */
  function ringRadius(ring: Entry[]): number {
    if (ring.length < 2) return 0;
    const sorted = [...ring].sort((a, b) => a.angle - b.angle);
    let needed = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      const next = sorted[(i + 1) % sorted.length];
      const gap =
        i + 1 < sorted.length
          ? next.angle - current.angle
          : next.angle + Math.PI * 2 - current.angle;
      if (gap <= 0) continue;
      const neededChord = (current.dimensions.width + next.dimensions.width) / 2 + SIBLING_GAP;
      needed = Math.max(needed, neededChord / gap);
    }
    return needed;
  }

  const radii = new Map<number, number>();
  let previousRadius = 0;
  // The root sits at the centre, so what its ring has to clear is the root's own
  // half-size — taken as the larger side, since it is placed at no angle.
  let previousExtent = Math.max(rootDimensions.width, rootDimensions.height) / 2;
  for (let depth = 1; byDepth.has(depth); depth += 1) {
    const ring = byDepth.get(depth)!;
    const extent = Math.max(
      ...ring.map((entry) => radialHalfExtent(entry.dimensions, entry.angle)),
    );
    const radius = Math.max(
      previousRadius + previousExtent + extent + SIBLING_GAP,
      ringRadius(ring),
    );
    radii.set(depth, radius);
    previousRadius = radius;
    previousExtent = extent;
  }

  const rootLayout = makeLayoutNode(
    rootNode,
    { x: -rootDimensions.width / 2, y: -rootDimensions.height / 2 },
    rootDimensions,
    "right",
    0,
    collapsedIds,
  );
  allNodes.push(rootLayout);
  placed.set(rootNode.id, rootLayout);

  for (const entry of entries) {
    const radius = radii.get(entry.depth) ?? 0;
    const centreX = Math.cos(entry.angle) * radius;
    const centreY = Math.sin(entry.angle) * radius;
    const layoutNode = makeLayoutNode(
      entry.node,
      { x: centreX - entry.dimensions.width / 2, y: centreY - entry.dimensions.height / 2 },
      entry.dimensions,
      radialSide(centreX, centreY),
      entry.colorIndex,
      collapsedIds,
    );
    allNodes.push(layoutNode);
    placed.set(entry.node.id, layoutNode);
  }

  shiftToOrigin(allNodes);

  // Everything below needs the centre in final coordinates, and the shift has
  // just moved it.
  const centre = {
    x: rootLayout.x + rootLayout.width / 2,
    y: rootLayout.y + rootLayout.height / 2,
  };

  // A radial node's children are spread around it, so the toggle goes on the
  // outward edge rather than on one of four named sides.
  for (const node of allNodes) {
    if (node.id === rootLayout.id || !node.hasChildren) continue;
    const nodeCentreX = node.x + node.width / 2;
    const nodeCentreY = node.y + node.height / 2;
    const awayX = nodeCentreX - centre.x;
    const awayY = nodeCentreY - centre.y;
    const length = Math.hypot(awayX, awayY) || 1;
    const edge = boxEdgePoint(
      node,
      nodeCentreX + (awayX / length) * 1000,
      nodeCentreY + (awayY / length) * 1000,
    );
    // Two pixels past the edge, so the circle sits beside the box rather than on
    // top of its border.
    node.toggleOffset = {
      x: edge.x - node.x + (awayX / length) * 2,
      y: edge.y - node.y + (awayY / length) * 2,
    };
  }

  const allEdges: MindmapLayoutResult["edges"] = [];
  (function collectEdges(node: MindmapNode) {
    const parent = placed.get(node.id);
    if (!parent || !node.children) return;
    for (const child of node.children) {
      const childLayout = placed.get(child.id);
      if (!childLayout) continue;

      const style = child.lineStyle || node.lineStyle || "bezier";
      const from = boxEdgePoint(
        parent,
        childLayout.x + childLayout.width / 2,
        childLayout.y + childLayout.height / 2,
      );
      const to = boxEdgePoint(
        childLayout,
        parent.x + parent.width / 2,
        parent.y + parent.height / 2,
      );

      allEdges.push({
        fromId: node.id,
        toId: child.id,
        d: buildRadialEdgePath(centre, from, to, style),
        colorIndex: childLayout.colorIndex,
        color: child.lineColor || node.lineColor,
        style,
      });
      collectEdges(child);
    }
  })(rootNode);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: allEdges,
    bounds: layoutBounds(allNodes),
  };
}
