import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../core/types";
import { BRANCH_COLORS, calculateNodeDimensions } from "./mindmapService";

/**
 * Mind map layouts: the id table the picker reads, and the functions behind it.
 *
 * A layout is a pure view-level function of the tree. It decides where every
 * node sits and how the connector into it is drawn, and it never touches the
 * tree, the document or a node's own styling — which is what makes switching
 * instant and free of anything to undo.
 *
 * The table, the labels and the dispatch live together on purpose: they are
 * three views of one list, and kept apart the way to get them wrong is to add a
 * layout to the picker and forget the switch, where the default case would
 * quietly render it as the default layout and no test would fail.
 *
 * The model it reads stays in `./mindmapService`, which is also where the
 * measurement of one node lives (`calculateNodeDimensions`) and where the branch
 * palette comes from. Reading from there rather than owning a copy keeps the
 * palette and the model in one place; the dependency runs one way, and the
 * service does not know this module exists.
 */

export type MindmapLayoutId = "logic" | "bidirectional" | "vertical";

/** Used when a document has no layout of its own, or names one that is gone. */
export const DEFAULT_LAYOUT_ID: MindmapLayoutId = "logic";

export type MindmapLayoutOption = {
  id: MindmapLayoutId;
  label: string;
  /** One line for the picker, saying what the reader gets. */
  description: string;
};

export const MINDMAP_LAYOUT_LIST: MindmapLayoutOption[] = [
  {
    id: "logic",
    label: "逻辑结构图",
    description: "根在左侧，逐级向右展开。默认，与旧版本完全一致。",
  },
  {
    id: "bidirectional",
    label: "双向",
    description: "根居中，一级分支按体量分列左右两侧。适合分支多、横向空间有限的图。",
  },
  {
    id: "vertical",
    label: "纵向",
    description: "根在顶部，层级向下展开。适合条目多而层级浅的大纲，横向铺开便于打印。",
  },
];

/**
 * Resolves a layout id, tolerating anything.
 *
 * Called with a value read back from storage, so it can be a layout that has
 * since been removed, an older id, or nonsense. Falling back to the default is
 * the only answer that keeps a map renderable.
 *
 * Matched against the list rather than with `value in`, which says yes to
 * `"toString"` and `"constructor"` because they come from Object.prototype —
 * the same trap `resolveThemeId` documents at length.
 */
export function resolveLayoutId(value: unknown): MindmapLayoutId {
  return typeof value === "string" && MINDMAP_LAYOUT_LIST.some((layout) => layout.id === value)
    ? (value as MindmapLayoutId)
    : DEFAULT_LAYOUT_ID;
}

/**
 * The edge a node's children are on.
 *
 * A leaf has one too — it is the edge its own parent's connector arrives at —
 * because the renderer hangs the collapse toggle off it. Three values rather
 * than two because the vertical layout grows downwards, and a toggle that stayed
 * on the right edge there would sit in the middle of the next row.
 */
export type MindmapLayoutSide = "left" | "right" | "bottom";

export interface MindmapLayoutNode {
  id: string;
  text: string;
  lines: string[];
  level: number;
  line?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  children: MindmapLayoutNode[];
  hasChildren: boolean;
  collapsed: boolean;
  colorIndex: number;
  color?: string;
  shape?: MindmapNodeShape;
  lineColor?: string;
  lineStyle?: MindmapLineStyle;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textColor?: string;
  borderColor?: string;
  textAlign?: MindmapTextAlign;
  customWidth?: number;
  customHeight?: number;
  /**
   * The side this node's children are on.
   *
   * `right` for every node the default layout produces, so the renderer's long
   * standing assumption — the collapse toggle sits just past the right edge —
   * remains true there. The bidirectional layout grows half the map the other
   * way, and the toggle has to move to the edge the children are actually on.
   */
  side: MindmapLayoutSide;
}

export interface MindmapLayoutResult {
  root: MindmapLayoutNode;
  nodes: MindmapLayoutNode[];
  edges: {
    fromId: string;
    toId: string;
    d: string;
    colorIndex: number;
    color?: string;
    style?: MindmapLineStyle;
  }[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

/** Horizontal gap between levels. Shared, so every layout spaces identically. */
const LEVEL_GAP = 72;
/** Vertical gap between siblings. */
const SIBLING_GAP = 18;
/**
 * Gap between levels in the layout that grows downwards.
 *
 * Smaller than LEVEL_GAP, which measures the space beside a node: nodes are
 * wider than they are tall, so the same number read vertically looks like a gap
 * rather than like structure.
 */
const VERTICAL_LEVEL_GAP = 56;
/** Where the top-left corner of a layout lands. */
const ORIGIN = 40;
/** Space kept around the content, beyond the outermost nodes. */
const BOUNDS_PADDING = 60;

/**
 * Lays the tree out.
 *
 * A layout is a view-level choice and nothing else: the tree, the document and
 * every node's own styling are untouched, so switching is instant and leaves
 * nothing to undo. The default is the rightward tree this file has always built,
 * and the golden snapshots in `mindmap-layouts.test.ts` hold it there — which is
 * also why the fallback below is the default rather than an error.
 */
export function layoutMindmap(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string> = new Set(),
  layoutId: MindmapLayoutId = DEFAULT_LAYOUT_ID
): MindmapLayoutResult {
  switch (layoutId) {
    case "bidirectional":
      return layoutBidirectionalTree(rootNode, collapsedIds);
    case "vertical":
      return layoutVerticalTree(rootNode, collapsedIds);
    default:
      return layoutLogicTree(rootNode, collapsedIds);
  }
}

/**
 * Vertical extent of a subtree: what its siblings are stacked by.
 *
 * This is the first pass of both layouts, and the reason they can differ only in
 * the second: a subtree takes the same vertical room whichever way it grows.
 */
function measureSubtree(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
  const { height: selfHeight } = calculateNodeDimensions(node);
  if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) {
    return selfHeight;
  }
  let totalHeight = 0;
  for (let i = 0; i < node.children.length; i++) {
    totalHeight += measureSubtree(node.children[i], collapsedIds);
    if (i > 0) totalHeight += SIBLING_GAP;
  }
  return Math.max(selfHeight, totalHeight);
}

/**
 * Horizontal extent of a subtree: what the layouts that grow downwards stack
 * siblings by.
 *
 * The exact transpose of `measureSubtree` — same recursion, same gaps, the other
 * axis. A separate function rather than a flag on the shared one, because the
 * two names say which axis the caller is working in and a boolean would not.
 */
function measureSubtreeWidth(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
  const { width } = calculateNodeDimensions(node);
  if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) {
    return width;
  }
  let totalWidth = 0;
  for (let i = 0; i < node.children.length; i++) {
    totalWidth += measureSubtreeWidth(node.children[i], collapsedIds);
    if (i > 0) totalWidth += SIBLING_GAP;
  }
  return Math.max(width, totalWidth);
}

/** Room a row of siblings needs, stacked along the vertical axis. */
function stackHeight(children: MindmapNode[], collapsedIds: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child, i) => sum + measureSubtree(child, collapsedIds) + (i > 0 ? SIBLING_GAP : 0),
    0
  );
}

/** Room a row of siblings needs, stacked along the horizontal axis. */
function stackWidth(children: MindmapNode[], collapsedIds: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child, i) => sum + measureSubtreeWidth(child, collapsedIds) + (i > 0 ? SIBLING_GAP : 0),
    0
  );
}

/**
 * One placed node: the tree node, plus the position the layout chose for it.
 *
 * Shared by every layout so that a style field added to `MindmapNode` reaches
 * all of them at once. Three copies of this literal would be three places to
 * forget, and the symptom — a node that quietly loses its colour in one layout
 * only — would be found by a reader rather than by a test.
 */
function makeLayoutNode(
  node: MindmapNode,
  position: { x: number; y: number },
  dimensions: { width: number; height: number; lines: string[] },
  side: MindmapLayoutSide,
  colorIndex: number,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutNode {
  return {
    id: node.id,
    text: node.text,
    lines: dimensions.lines,
    level: node.level,
    line: node.line,
    x: position.x,
    y: position.y,
    width: dimensions.width,
    height: dimensions.height,
    children: [],
    hasChildren: !!(node.children && node.children.length > 0),
    collapsed: collapsedIds.has(node.id),
    colorIndex,
    side,
    color: node.color,
    shape: node.shape,
    lineColor: node.lineColor,
    lineStyle: node.lineStyle,
    fontSize: node.fontSize,
    fontWeight: node.fontWeight,
    textColor: node.textColor,
    borderColor: node.borderColor,
    textAlign: node.textAlign,
    customWidth: node.customWidth,
    customHeight: node.customHeight,
  };
}

/**
 * Moves a finished layout so its top-left corner sits at the origin.
 *
 * Done after placement rather than during it, because how far a map reaches in
 * each direction is only known once it is complete — the bidirectional layout
 * cannot know what to leave on the left until the left side has been laid out.
 * Connectors are built after this, since a path is absolute coordinates.
 */
function shiftToOrigin(nodes: MindmapLayoutNode[]): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
  }
  for (const node of nodes) {
    node.x += ORIGIN - minX;
    node.y += ORIGIN - minY;
  }
}

/**
 * The connector into a child, in the shape that child asked for.
 *
 * Shared rather than written once per layout, because layouts differ in which
 * edges they connect and in nothing else: a switched map keeps the same curves,
 * and a fix to how a bezier is drawn lands in all of them at once.
 *
 * The axis is what the shape is drawn along, and it matters: `step` and `bezier`
 * both bend a horizontal run into the child, and used unchanged on a map that
 * grows downwards they would bend sideways across the level below. Rotating the
 * shape keeps the reader's expectation that a connector leaves its parent
 * heading towards its child.
 */
function buildEdgePath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  style: MindmapLineStyle,
  axis: "horizontal" | "vertical" = "horizontal"
): string {
  if (style === "straight") {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }
  if (axis === "vertical") {
    const midY = (fromY + toY) / 2;
    return style === "step"
      ? `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`
      : `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  }
  const midX = (fromX + toX) / 2;
  return style === "step"
    ? `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

/** Everything that was placed, plus room to breathe. */
function layoutBounds(nodes: MindmapLayoutNode[]): MindmapLayoutResult["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  return {
    minX: Math.max(0, minX - BOUNDS_PADDING),
    minY: Math.max(0, minY - BOUNDS_PADDING),
    maxX: maxX + BOUNDS_PADDING,
    maxY: maxY + BOUNDS_PADDING,
    width: maxX - minX + BOUNDS_PADDING * 2,
    height: maxY - minY + BOUNDS_PADDING * 2,
  };
}

/**
 * Computes a 2D horizontal tree layout for the mindmap.
 *
 * Every node grows to the right, and the map hangs off the root's left edge at
 * the origin. This is the layout every existing document has, which is why it is
 * also the one that must not change.
 */
function layoutLogicTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  const allEdges: MindmapLayoutResult["edges"] = [];

  // Second pass: assign (x, y) coordinates
  function positionSubtree(
    node: MindmapNode,
    startX: number,
    topY: number,
    colorIndex: number
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
      collapsedIds
    );
    allNodes.push(layoutNode);

    if (!isCollapsed && hasChildren) {
      let currentChildTopY = topY;
      const childStartX = startX + width + LEVEL_GAP;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // Each top-level child gets its own branch color; deeper descendants inherit parent's branch color
        const childColorIndex = node.level === 0 ? i % BRANCH_COLORS.length : colorIndex;
        const childLayout = positionSubtree(
          child,
          childStartX,
          currentChildTopY,
          childColorIndex
        );
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
 * Only the first level is split. A branch dealt to the left grows further left
 * and its descendants inherit that side — turning each generation round again
 * produces a comb, not a map.
 */
function layoutBidirectionalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
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
    colorIndex: number
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
    colorIndex: number
  ): MindmapLayoutNode {
    const { width, height } = calculateNodeDimensions(node);
    const subtreeHeight = measureSubtree(node, collapsedIds);
    const x = direction === 1 ? anchorX : anchorX - width;
    const layoutNode = placeNode(node, x, topY + (subtreeHeight - height) / 2, side, colorIndex);

    const isCollapsed = collapsedIds.has(node.id);
    if (!isCollapsed && node.children && node.children.length > 0) {
      const childAnchorX = direction === 1 ? x + width + LEVEL_GAP : x - LEVEL_GAP;
      let childTop =
        layoutNode.y + height / 2 - stackHeight(node.children, collapsedIds) / 2;
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
      const target = totalHeight(leftSide) < totalHeight(rightSide) ? leftSide : rightSide;
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
          style
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

/**
 * Root at the top, levels going down, siblings side by side.
 *
 * The transpose of the default layout, for an outline that is wide and shallow:
 * twenty first-level items read as one row instead of as a column taller than
 * any screen. Placement and the branch-colour rule follow the default exactly,
 * so switching between the two keeps every branch the colour it had.
 */
function layoutVerticalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  /** Placed nodes by id, so the connector pass can read final coordinates. */
  const placed = new Map<string, MindmapLayoutNode>();

  function place(
    node: MindmapNode,
    centreX: number,
    topY: number,
    colorIndex: number
  ): MindmapLayoutNode {
    const dimensions = calculateNodeDimensions(node);
    const isCollapsed = collapsedIds.has(node.id);
    const layoutNode = makeLayoutNode(
      node,
      { x: centreX - dimensions.width / 2, y: topY },
      dimensions,
      "bottom",
      colorIndex,
      collapsedIds
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
  placed: Map<string, MindmapLayoutNode>
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
          "vertical"
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
