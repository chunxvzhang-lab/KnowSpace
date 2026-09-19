import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../core/types";
import type { MindmapSide } from "../core/mindmapSides";
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

export type MindmapLayoutId = "logic" | "bidirectional" | "vertical" | "radial" | "timeline";

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
  {
    id: "radial",
    label: "径向",
    description: "根居中，分支按体量分配扇区向外辐射。适合看整体结构，不适合长文本。",
  },
  {
    id: "timeline",
    label: "时间轴",
    description: "一级分支沿水平轴依次排开、上下交替，子分支向外展开。适合顺序性内容。",
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
 * because the renderer hangs the collapse toggle off it. Four values rather than
 * two because the vertical layout grows downwards and the timeline grows both
 * ways from its axis; a toggle that stayed on the right edge in either would sit
 * in the middle of the next row.
 */
export type MindmapLayoutSide = "left" | "right" | "top" | "bottom";

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
  /**
   * Where the toggle goes, in the node's own coordinates, when no single edge
   * answers the question.
   *
   * A radial node's children are spread around it, so "the edge they are on" is
   * a direction rather than one of four names. The layout that knows the
   * direction leaves the point here and the renderer uses it; every other layout
   * omits it and falls back to `side`.
   */
  toggleOffset?: { x: number; y: number };
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
  layoutId: MindmapLayoutId = DEFAULT_LAYOUT_ID,
  sides: Readonly<Record<string, MindmapSide>> = {}
): MindmapLayoutResult {
  switch (layoutId) {
    case "bidirectional":
      return layoutBidirectionalTree(rootNode, collapsedIds, sides);
    case "vertical":
      return layoutVerticalTree(rootNode, collapsedIds);
    case "radial":
      return layoutRadialTree(rootNode, collapsedIds);
    case "timeline":
      return layoutTimelineTree(rootNode, collapsedIds);
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
function layoutBidirectionalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>,
  sides: Readonly<Record<string, MindmapSide>> = {}
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
  towardsY: number
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
  style: MindmapLineStyle
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
function layoutRadialTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
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
    sector: number
  ): void {
    entries.push({ node, dimensions, depth, angle, colorIndex });
    if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) return;

    const weights = node.children.map((child) => subtreeSize(child, collapsedIds));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const equalShare = 1 / node.children.length;
    let start = angle - sector / 2;
    node.children.forEach((child, index) => {
      const share =
        sector * (SECTOR_WEIGHT_MIX * (weights[index] / total) + (1 - SECTOR_WEIGHT_MIX) * equalShare);
      assign(child, calculateNodeDimensions(child), depth + 1, start + share / 2, colorIndex, share);
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
        Math.PI * 2 * (SECTOR_WEIGHT_MIX * (weights[index] / total) + (1 - SECTOR_WEIGHT_MIX) * equalShare);
      // Each first-level branch carries its own colour; deeper nodes inherit the
      // branch's, exactly as in the other layouts.
      assign(child, calculateNodeDimensions(child), 1, angle + share / 2, index % BRANCH_COLORS.length, share);
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
      ...ring.map((entry) => radialHalfExtent(entry.dimensions, entry.angle))
    );
    const radius = Math.max(
      previousRadius + previousExtent + extent + SIBLING_GAP,
      ringRadius(ring)
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
    collapsedIds
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
      collapsedIds
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
      nodeCentreY + (awayY / length) * 1000
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
        childLayout.y + childLayout.height / 2
      );
      const to = boxEdgePoint(
        childLayout,
        parent.x + parent.width / 2,
        parent.y + parent.height / 2
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
function layoutTimelineTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
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
    colorIndex: number
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
      collapsedIds
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
    collapsedIds
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
      place(
        child,
        cursor + band / 2,
        outward * SPINE_GAP,
        outward,
        index % BRANCH_COLORS.length
      );
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
            "vertical"
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
