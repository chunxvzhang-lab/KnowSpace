import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../core/types";
import { calculateNodeDimensions } from "./mindmapService";

/**
 * Machinery every mind map layout runs through.
 *
 * A layout is a pure view-level function of the tree. It decides where every
 * node sits and how the connector into it is drawn, and it never touches the
 * tree, the document or a node's own styling — which is what makes switching
 * instant and free of anything to undo.
 *
 * What lives here is what the layouts agree on: the node and result shapes, the
 * spacing constants, and the measuring/placing/edge-building passes they all
 * share. The layouts themselves are in `mindmapLayoutPlanar` (the ones that grow
 * sideways), `mindmapLayoutOrthogonal` (the ones that grow downwards) and
 * `mindmapLayoutRadial` (the one that grows outwards), and the id table and
 * dispatch stay in `mindmapLayout`.
 *
 * The model the machinery reads stays in `./mindmapService`, which is also where
 * the measurement of one node lives (`calculateNodeDimensions`). Reading from
 * there rather than owning a copy keeps the palette and the model in one place;
 * the dependency runs one way, and the service does not know this module exists.
 */

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
export const LEVEL_GAP = 72;
/** Vertical gap between siblings. */
export const SIBLING_GAP = 18;
/**
 * Gap between levels in the layout that grows downwards.
 *
 * Smaller than LEVEL_GAP, which measures the space beside a node: nodes are
 * wider than they are tall, so the same number read vertically looks like a gap
 * rather than like structure.
 */
export const VERTICAL_LEVEL_GAP = 56;
/** Where the top-left corner of a layout lands. */
export const ORIGIN = 40;
/** Space kept around the content, beyond the outermost nodes. */
export const BOUNDS_PADDING = 60;

/**
 * Vertical extent of a subtree: what its siblings are stacked by.
 *
 * This is the first pass of both layouts, and the reason they can differ only in
 * the second: a subtree takes the same vertical room whichever way it grows.
 */
export function measureSubtree(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
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
export function measureSubtreeWidth(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
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
export function stackHeight(children: MindmapNode[], collapsedIds: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child, i) => sum + measureSubtree(child, collapsedIds) + (i > 0 ? SIBLING_GAP : 0),
    0,
  );
}

/** Room a row of siblings needs, stacked along the horizontal axis. */
export function stackWidth(children: MindmapNode[], collapsedIds: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child, i) => sum + measureSubtreeWidth(child, collapsedIds) + (i > 0 ? SIBLING_GAP : 0),
    0,
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
export function makeLayoutNode(
  node: MindmapNode,
  position: { x: number; y: number },
  dimensions: { width: number; height: number; lines: string[] },
  side: MindmapLayoutSide,
  colorIndex: number,
  collapsedIds: ReadonlySet<string>,
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
export function shiftToOrigin(nodes: MindmapLayoutNode[]): void {
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
export function buildEdgePath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  style: MindmapLineStyle,
  axis: "horizontal" | "vertical" = "horizontal",
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
export function layoutBounds(nodes: MindmapLayoutNode[]): MindmapLayoutResult["bounds"] {
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
