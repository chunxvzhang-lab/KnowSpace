import type { MindmapNode } from "../core/types";
import type { MindmapSide } from "../core/mindmapSides";
import { BRANCH_COLORS, calculateNodeDimensions } from "./mindmapService";
import {
  LEVEL_GAP,
  ORIGIN,
  SIBLING_GAP,
  type MindmapLayoutNode,
  type MindmapLayoutResult,
  type MindmapLayoutSide,
  buildEdgePath,
  layoutBounds,
  makeLayoutNode,
  measureSubtree,
  shiftToOrigin,
  stackHeight,
} from "./mindmapLayoutShared";

/**
 * The layouts that grow sideways from a vertical spine.
 *
 * Both are two passes: stack the subtrees vertically, then place them — which is
 * why they can share `measureSubtree` unchanged and differ only in where a node
 * lands and how its connector is routed. The default (logic) layout hangs
 * everything off the root's right edge; the bidirectional layout deals the first
 * level to either side of a centred root.
 */

/**
 * Computes a 2D horizontal tree layout for the mindmap.
 *
 * Every node grows to the right, and the map hangs off the root's left edge at
 * the origin. This is the layout every existing document has, which is why it is
 * also the one that must not change.
 */
export function layoutLogicTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>,
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  const allEdges: MindmapLayoutResult["edges"] = [];

  // Second pass: assign (x, y) coordinates
  function positionSubtree(
    node: MindmapNode,
    startX: number,
    topY: number,
    colorIndex: number,
  ): MindmapLayoutNode {
    const isCollapsed = collapsedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const { width, height, lines } = calculateNodeDimensions(node);
    const subtreeHeight = measureSubtree(node, collapsedIds);

    // Center node vertically within its subtree allocation
    const nodeY = topY + (subtreeHeight - height) / 2;

    const layoutNode = makeLayoutNode(
      node,
      { x: startX, y: nodeY },
      { width, height, lines },
      "right",
      colorIndex,
      collapsedIds,
    );
    allNodes.push(layoutNode);

    if (!isCollapsed && hasChildren) {
      let currentChildTopY = topY;
      const childStartX = startX + width + LEVEL_GAP;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // Each top-level child gets its own branch color; deeper descendants inherit parent's branch color
        const childColorIndex = node.level === 0 ? i % BRANCH_COLORS.length : colorIndex;
        const childLayout = positionSubtree(child, childStartX, currentChildTopY, childColorIndex);
        layoutNode.children.push(childLayout);

        // Generate connector path according to lineStyle
        const fromX = startX + width;
        const fromY = nodeY + height / 2;
        const toX = childLayout.x;
        const toY = childLayout.y + childLayout.height / 2;

        const edgeLineStyle = child.lineStyle || node.lineStyle || "bezier";
        const edgeColor = child.lineColor || node.lineColor;

        const d = buildEdgePath(fromX, fromY, toX, toY, edgeLineStyle);

        allEdges.push({
          fromId: node.id,
          toId: child.id,
          d,
          colorIndex: childColorIndex,
          color: edgeColor,
          style: edgeLineStyle,
        });

        currentChildTopY += measureSubtree(child, collapsedIds) + SIBLING_GAP;
      }
    }

    return layoutNode;
  }

  const rootLayout = positionSubtree(rootNode, ORIGIN, ORIGIN, 0);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: allEdges,
    bounds: layoutBounds(allNodes),
  };
}

/**
 * Root in the middle, with the first-level branches dealt to either side.
 *
 * The dealing rule is "in document order, to whichever side is shorter so far".
 * Not "the first half one way, the second half the other", which leaves a map
 * with one heavy branch and four light ones lopsided; and not alternating, which
 * would renumber the branches visually and break the reading order. Dealing in
 * order keeps the document's own sequence intact within each side.
 *
 * A branch the reader has put on a side stays there, and the rest are dealt around
 * it: `sides` holds the ones that were stated, which is the reader's own answer to
 * "which half goes where" — 「先做的一半放左边」 is a thing a mind map is used for, and
 * a rule that only balances by height cannot express it. A stated branch is counted
 * like any other, so the branches dealt after it balance against it.
 *
 * Only the first level is split. A branch dealt to the left grows further left
 * and its descendants inherit that side — turning each generation round again
 * produces a comb, not a map.
 */
export function layoutBidirectionalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>,
  sides: Readonly<Record<string, MindmapSide>> = {},
): MindmapLayoutResult {
  type Branch = { node: MindmapNode; colorIndex: number; height: number };

  const allNodes: MindmapLayoutNode[] = [];
  /** Placed nodes by id, so the connector pass can read final coordinates. */
  const placed = new Map<string, MindmapLayoutNode>();

  const totalHeight = (branches: Branch[]): number =>
    branches.reduce((sum, branch, i) => sum + branch.height + (i > 0 ? SIBLING_GAP : 0), 0);

  function placeNode(
    node: MindmapNode,
    x: number,
    y: number,
    side: MindmapLayoutSide,
    colorIndex: number,
  ): MindmapLayoutNode {
    const dimensions = calculateNodeDimensions(node);
    const layoutNode = makeLayoutNode(node, { x, y }, dimensions, side, colorIndex, collapsedIds);
    allNodes.push(layoutNode);
    placed.set(node.id, layoutNode);
    return layoutNode;
  }

  /**
   * Lays out one side of a node, stacking the branches around the node's centre.
   *
   * `anchorX` is the edge the connector arrives at — the parent's right edge for
   * a branch growing right, its left edge for one growing left — and everything
   * below hangs off it.
   */
  function placeSubtree(
    node: MindmapNode,
    anchorX: number,
    topY: number,
    direction: 1 | -1,
    side: MindmapLayoutSide,
    colorIndex: number,
  ): MindmapLayoutNode {
    const { width, height } = calculateNodeDimensions(node);
    const subtreeHeight = measureSubtree(node, collapsedIds);
    const x = direction === 1 ? anchorX : anchorX - width;
    const layoutNode = placeNode(node, x, topY + (subtreeHeight - height) / 2, side, colorIndex);

    const isCollapsed = collapsedIds.has(node.id);
    if (!isCollapsed && node.children && node.children.length > 0) {
      const childAnchorX = direction === 1 ? x + width + LEVEL_GAP : x - LEVEL_GAP;
      let childTop = layoutNode.y + height / 2 - stackHeight(node.children, collapsedIds) / 2;
      for (const child of node.children) {
        placeSubtree(child, childAnchorX, childTop, direction, side, colorIndex);
        childTop += measureSubtree(child, collapsedIds) + SIBLING_GAP;
      }
    }

    return layoutNode;
  }

  const rootDims = calculateNodeDimensions(rootNode);
  const rootCenterY = 0;
  // Placed around the origin and shifted into place at the end, because how far
  // the left side reaches is only known once it has been laid out.
  const rootLayout = placeNode(rootNode, 0, rootCenterY - rootDims.height / 2, "right", 0);

  const rightSide: Branch[] = [];
  const leftSide: Branch[] = [];
  if (!collapsedIds.has(rootNode.id) && rootNode.children) {
    rootNode.children.forEach((child, index) => {
      const branch: Branch = {
        node: child,
        // The colour comes from the child's position in the document, never from
        // the side it was dealt to: switching layouts must not recolour a branch.
        colorIndex: index % BRANCH_COLORS.length,
        height: measureSubtree(child, collapsedIds),
      };
      // A stated side wins; the rest are dealt to whichever side is shorter so far.
      const stated = sides[child.id];
      const target =
        stated === "left"
          ? leftSide
          : stated === "right"
            ? rightSide
            : totalHeight(leftSide) < totalHeight(rightSide)
              ? leftSide
              : rightSide;
      target.push(branch);
    });
  }

  function placeSide(branches: Branch[], side: MindmapLayoutSide) {
    if (branches.length === 0) return;
    const direction = side === "right" ? 1 : -1;
    const anchorX =
      side === "right" ? rootLayout.x + rootLayout.width + LEVEL_GAP : rootLayout.x - LEVEL_GAP;
    let top = rootCenterY - totalHeight(branches) / 2;
    for (const branch of branches) {
      placeSubtree(branch.node, anchorX, top, direction, side, branch.colorIndex);
      top += branch.height + SIBLING_GAP;
    }
  }

  placeSide(rightSide, "right");
  placeSide(leftSide, "left");

  shiftToOrigin(allNodes);

  const allEdges: MindmapLayoutResult["edges"] = [];
  (function collectEdges(node: MindmapNode) {
    const parent = placed.get(node.id);
    if (!parent || !node.children) return;
    for (const child of node.children) {
      const childLayout = placed.get(child.id);
      // A collapsed node keeps its children in the tree but shows none of them.
      if (!childLayout) continue;

      const growsLeft = childLayout.side === "left";
      const fromX = growsLeft ? parent.x : parent.x + parent.width;
      const toX = growsLeft ? childLayout.x + childLayout.width : childLayout.x;
      const style = child.lineStyle || node.lineStyle || "bezier";

      allEdges.push({
        fromId: node.id,
        toId: child.id,
        d: buildEdgePath(
          fromX,
          parent.y + parent.height / 2,
          toX,
          childLayout.y + childLayout.height / 2,
          style,
        ),
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
