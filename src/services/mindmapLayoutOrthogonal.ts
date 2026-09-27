import type { MindmapNode } from "../core/types";
import { BRANCH_COLORS, calculateNodeDimensions } from "./mindmapService";
import {
  SIBLING_GAP,
  VERTICAL_LEVEL_GAP,
  type MindmapLayoutNode,
  type MindmapLayoutResult,
  buildEdgePath,
  layoutBounds,
  makeLayoutNode,
  measureSubtreeWidth,
  shiftToOrigin,
  stackWidth,
} from "./mindmapLayoutShared";

/**
 * The layouts that grow downwards from a horizontal spine.
 *
 * Both stack siblings side by side (so they measure by width, not height) and
 * route connectors along the vertical axis — `buildEdgePath` with the
 * `"vertical"` axis, so a step or bezier bends down into the child rather than
 * sideways across the row below. The vertical layout is the transpose of the
 * default; the timeline strings the first level along an axis that branches
 * alternate above and below.
 */

/**
 * Root at the top, levels going down, siblings side by side.
 *
 * The transpose of the default layout, for an outline that is wide and shallow:
 * twenty first-level items read as one row instead of as a column taller than
 * any screen. Placement and the branch-colour rule follow the default exactly,
 * so switching between the two keeps every branch the colour it had.
 */
export function layoutVerticalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>,
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  /** Placed nodes by id, so the connector pass can read final coordinates. */
  const placed = new Map<string, MindmapLayoutNode>();

  function place(
    node: MindmapNode,
    centreX: number,
    topY: number,
    colorIndex: number,
  ): MindmapLayoutNode {
    const dimensions = calculateNodeDimensions(node);
    const isCollapsed = collapsedIds.has(node.id);
    const layoutNode = makeLayoutNode(
      node,
      { x: centreX - dimensions.width / 2, y: topY },
      dimensions,
      "bottom",
      colorIndex,
      collapsedIds,
    );
    allNodes.push(layoutNode);
    placed.set(node.id, layoutNode);

    if (!isCollapsed && node.children && node.children.length > 0) {
      // The row of children is centred on the parent rather than left-aligned to
      // it: a parent with one child would otherwise look like the start of a
      // column instead of the head of a tree.
      let bandLeft = centreX - stackWidth(node.children, collapsedIds) / 2;
      const childTop = topY + dimensions.height + VERTICAL_LEVEL_GAP;
      node.children.forEach((child, index) => {
        const band = measureSubtreeWidth(child, collapsedIds);
        // Each first-level child gets its own branch colour; deeper descendants
        // inherit their branch's, exactly as in the other layouts.
        const childColorIndex = node.level === 0 ? index % BRANCH_COLORS.length : colorIndex;
        place(child, bandLeft + band / 2, childTop, childColorIndex);
        bandLeft += band + SIBLING_GAP;
      });
    }

    return layoutNode;
  }

  const rootLayout = place(rootNode, 0, 0, 0);
  shiftToOrigin(allNodes);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: collectVerticalEdges(rootNode, placed),
    bounds: layoutBounds(allNodes),
  };
}

/**
 * Connectors for the layouts that grow downwards: bottom edge to top edge.
 *
 * Built after placement rather than during it, because a map is shifted into
 * place once it is complete and a path is absolute coordinates.
 */
function collectVerticalEdges(
  rootNode: MindmapNode,
  placed: Map<string, MindmapLayoutNode>,
): MindmapLayoutResult["edges"] {
  const allEdges: MindmapLayoutResult["edges"] = [];

  (function walk(node: MindmapNode) {
    const parent = placed.get(node.id);
    if (!parent || !node.children) return;
    for (const child of node.children) {
      const childLayout = placed.get(child.id);
      // A collapsed node keeps its children in the tree but shows none of them.
      if (!childLayout) continue;

      const style = child.lineStyle || node.lineStyle || "bezier";
      allEdges.push({
        fromId: node.id,
        toId: child.id,
        d: buildEdgePath(
          parent.x + parent.width / 2,
          parent.y + parent.height,
          childLayout.x + childLayout.width / 2,
          childLayout.y,
          style,
          "vertical",
        ),
        colorIndex: childLayout.colorIndex,
        color: child.lineColor || node.lineColor,
        style,
      });
      walk(child);
    }
  })(rootNode);

  return allEdges;
}

/** Gap between the root and the first branch on the axis, and between branches. */
const TIMELINE_GAP = 48;
/** How far the nearest box on either side sits from the axis. */
const SPINE_GAP = 26;

/**
 * A horizontal axis with the first-level branches strung along it, alternating
 * above and below, each one's own subtree growing further out.
 *
 * The route from the root to a branch is the whole design problem here. A
 * straight line, a step or a bezier all cut across the branches in between: the
 * spine is horizontal and the branches are spread along it, so a connector that
 * leaves the root heading for the fifth branch passes over the first four boxes.
 *
 * The axis itself is the one corridor nothing occupies, because every box sits
 * clear of it by construction. So the connector runs along the axis to the
 * branch's own position and then straight out to it — which is exactly the shape
 * a timeline is drawn with, and the reason the branches are placed alternating
 * rather than all on one side.
 *
 * Every one of those axis segments is drawn in the same colour, the first
 * branch's. They are collinear and they overlap, so giving each its own branch
 * colour would blend five strokes into a smear near the root and fade to a
 * single colour at the far end. A branch's own colour is on its node and on the
 * connectors inside its subtree, which is where it reads as belonging to
 * something.
 */
export function layoutTimelineTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>,
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  /** Placed nodes by id, so the connector pass can read final coordinates. */
  const placed = new Map<string, MindmapLayoutNode>();

  /**
   * Places one subtree on one side of the axis.
   *
   * `innerEdge` is the coordinate of the node's edge facing the axis, and
   * `outward` is -1 above it and +1 below, so the same recursion serves both
   * sides and every level simply continues away from the axis.
   */
  function place(
    node: MindmapNode,
    centreX: number,
    innerEdge: number,
    outward: -1 | 1,
    colorIndex: number,
  ): MindmapLayoutNode {
    const dimensions = calculateNodeDimensions(node);
    const isCollapsed = collapsedIds.has(node.id);
    const y = outward > 0 ? innerEdge : innerEdge - dimensions.height;
    const layoutNode = makeLayoutNode(
      node,
      { x: centreX - dimensions.width / 2, y },
      dimensions,
      outward > 0 ? "bottom" : "top",
      colorIndex,
      collapsedIds,
    );
    allNodes.push(layoutNode);
    placed.set(node.id, layoutNode);

    if (!isCollapsed && node.children && node.children.length > 0) {
      const outerEdge = outward > 0 ? y + dimensions.height : y;
      const childInnerEdge = outerEdge + outward * VERTICAL_LEVEL_GAP;
      let bandLeft = centreX - stackWidth(node.children, collapsedIds) / 2;
      node.children.forEach((child) => {
        const band = measureSubtreeWidth(child, collapsedIds);
        place(child, bandLeft + band / 2, childInnerEdge, outward, colorIndex);
        bandLeft += band + SIBLING_GAP;
      });
    }

    return layoutNode;
  }

  const rootDimensions = calculateNodeDimensions(rootNode);
  const rootLayout = makeLayoutNode(
    rootNode,
    { x: 0, y: -rootDimensions.height / 2 },
    rootDimensions,
    "right",
    0,
    collapsedIds,
  );
  allNodes.push(rootLayout);
  placed.set(rootNode.id, rootLayout);

  if (!collapsedIds.has(rootNode.id) && rootNode.children && rootNode.children.length > 0) {
    let cursor = rootDimensions.width + TIMELINE_GAP;
    rootNode.children.forEach((child, index) => {
      const band = measureSubtreeWidth(child, collapsedIds);
      // The first branch goes above the axis and the rest alternate, so the
      // sequence the document has is the sequence read from left to right.
      const outward: -1 | 1 = index % 2 === 0 ? -1 : 1;
      place(child, cursor + band / 2, outward * SPINE_GAP, outward, index % BRANCH_COLORS.length);
      cursor += band + TIMELINE_GAP;
    });
  }

  shiftToOrigin(allNodes);

  const spineY = rootLayout.y + rootLayout.height / 2;
  const spineStart = rootLayout.x + rootLayout.width;

  const allEdges: MindmapLayoutResult["edges"] = [];
  (function walk(node: MindmapNode) {
    const parent = placed.get(node.id);
    if (!parent || !node.children) return;
    const parentIsRoot = node.id === rootNode.id;

    for (const child of node.children) {
      const childLayout = placed.get(child.id);
      // A collapsed node keeps its children in the tree but shows none of them.
      if (!childLayout) continue;

      const style = child.lineStyle || node.lineStyle || "bezier";
      const childCentreX = childLayout.x + childLayout.width / 2;
      const childInnerEdge =
        childLayout.side === "bottom" ? childLayout.y : childLayout.y + childLayout.height;

      if (parentIsRoot) {
        allEdges.push({
          fromId: node.id,
          toId: child.id,
          d: `M ${spineStart} ${spineY} L ${childCentreX} ${spineY} L ${childCentreX} ${childInnerEdge}`,
          // One colour for the whole axis. See the note above the layout.
          colorIndex: 0,
          color: child.lineColor || node.lineColor,
          style,
        });
      } else {
        allEdges.push({
          fromId: node.id,
          toId: child.id,
          d: buildEdgePath(
            parent.x + parent.width / 2,
            parent.side === "bottom" ? parent.y + parent.height : parent.y,
            childCentreX,
            childInnerEdge,
            style,
            "vertical",
          ),
          colorIndex: childLayout.colorIndex,
          color: child.lineColor || node.lineColor,
          style,
        });
      }
      walk(child);
    }
  })(rootNode);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: allEdges,
    bounds: layoutBounds(allNodes),
  };
}
