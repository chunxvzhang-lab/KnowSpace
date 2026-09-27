/**
 * Multi-card layout families: circular (ring) and rectangular (grid)
 * alignment, their layout detection, the interactive spacing re-flows, and the
 * `alignNodes` dispatcher that routes the batch-align directions.
 *
 * Split out of canvasGeometry during the phase-1 size split; the code is
 * byte-identical to the original there (which itself came from canvasService
 * in the R2 split). Pure computation — no DOM access. The family is
 * self-contained: the ring spacing re-flow calls alignNodesInCircle, the grid
 * re-flow calls alignNodesInGrid, and both live here. See canvasGeometry.ts
 * for the import surface.
 */

import type { CanvasNode } from "../types/canvasTypes";

/**
 * Alignment directions for batch-selected canvas cards
 */
export type CanvasAlignDirection =
  | "horizontal" // 水平对齐 (沿水平中线对齐，所有卡片 Y 居中齐平)
  | "vertical" // 垂直对齐 (沿垂直中线对齐，所有卡片 X 居中齐平)
  | "left" // 左对齐
  | "center" // 水平居中
  | "right" // 右对齐
  | "top" // 顶端对齐
  | "middle" // 垂直居中
  | "bottom" // 底端对齐
  | "distribute-h" // 水平等距分布
  | "distribute-v" // 垂直等距分布
  | "circle" // 环形对齐 (多张卡片沿圆周均匀排布，配合环形闭环连线使用)
  | "grid"; // 矩形排布 (多张卡片按规整网格矩阵排布)

/**
 * Options for circular (ring) alignment of multiple cards.
 */
export interface CircleAlignOptions {
  /**
   * Explicit radius in canvas units. When omitted, the radius is derived so
   * that the ring is never tighter than the current spread AND neighbouring
   * cards never overlap.
   */
  radius?: number;
  /**
   * Angle (in degrees) of the first card, -90 puts it at 12 o'clock.
   * Defaults to -90 (top).
   */
  startAngleDeg?: number;
  /**
   * Explicit clockwise seating order, outermost card first.
   *
   * The interactive spacing controls pass the order captured when the ring was
   * formed. Without it the order is re-derived from the current angles, and
   * shrinking the ring would let cards swap seats mid-drag.
   */
  orderedIds?: string[];
  /**
   * Applies the collision floor to an explicit `radius` too, so an
   * interactive resize can never collapse the ring into an unreadable pile.
   * Off by default to keep programmatic callers in full control.
   */
  clampToMinRadius?: boolean;
  /**
   * Explicit circle centre. Defaults to the selection's bounding-box centre.
   *
   * Interactive resizing pins the centre captured when the drag started —
   * otherwise the centre would be re-derived from the bounding box on every
   * frame and the whole ring would creep across the canvas as it grows.
   */
  center?: { x: number; y: number };
}

/**
 * Smallest radius at which neighbouring cards still clear each other.
 *
 * Adjacent card centres sit a chord of 2R·sin(π/N) apart, so requiring that
 * chord to cover (most of) the average card diagonal gives R. Shared by the
 * alignment routine and the interactive spacing controls so the slider's lower
 * bound and the drag's floor are always the same number.
 */
export function computeMinRingRadius(nodes: CanvasNode[]): number {
  const count = nodes.length;
  if (count < 3) return 0;
  const avgDiagonal = nodes.reduce((sum, n) => sum + Math.hypot(n.width, n.height), 0) / count;
  const requiredChord = avgDiagonal * 0.9;
  return requiredChord / (2 * Math.sin(Math.PI / count));
}

/** Reorders `nodes` to match `orderedIds`, appending anything unlisted. */
function orderByExplicitIds(
  nodes: CanvasNode[],
  orderedIds: string[],
  centerOf: (n: CanvasNode) => { x: number; y: number },
  cx: number,
  cy: number,
): CanvasNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: CanvasNode[] = [];
  for (const id of orderedIds) {
    const n = byId.get(id);
    if (n) {
      out.push(n);
      byId.delete(id);
    }
  }
  // Anything not named explicitly keeps its relative angular position.
  const rest = [...byId.values()].sort((a, b) => {
    const pa = centerOf(a);
    const pb = centerOf(b);
    return Math.atan2(pa.y - cy, pa.x - cx) - Math.atan2(pb.y - cy, pb.x - cx);
  });
  return [...out, ...rest];
}

/** Andrew's monotone chain. Returns the hull in counter-clockwise order. */
function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (input: Array<{ x: number; y: number }>) => {
    const chain: Array<{ x: number; y: number }> = [];
    for (const p of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    return chain;
  };

  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  // Drop the duplicated endpoints
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Ray-casting point-in-polygon test. */
function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y;
    if (intersects && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * True when `point` falls inside the convex hull of the given cards' centres.
 *
 * This is what lets a click on the hollow middle of a ring or a grid grab the
 * whole selection. That area is empty canvas, so without this check the press
 * would fall through to the background handler and pan the board — while the
 * user's intent, having just arranged and selected the cards, is clearly to
 * move the group.
 *
 * Points genuinely outside the group (but still within the bounding box of a
 * concave arrangement) are correctly rejected, which a plain bounding-box test
 * would not manage.
 */
export function isPointInsideNodeHull(
  point: { x: number; y: number },
  nodes: CanvasNode[],
): boolean {
  if (nodes.length < 3) return false;
  const centres = nodes.map((n) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 }));
  const hull = convexHull(centres);
  if (hull.length < 3) return false;
  return isPointInPolygon(point, hull);
}

/**
 * A ring captured for interactive spacing adjustment.
 */
export interface RingSpacingLayout {
  center: { x: number; y: number };
  radius: number;
  count: number;
  /** Radius below which neighbouring cards would collide. */
  minRadius: number;
  startAngleDeg: number;
  /** Clockwise seating order, frozen for the duration of the interaction. */
  orderedIds: string[];
}

/**
 * Captures the current ring so a slider or a card drag can resize it.
 *
 * Returns null when fewer than three cards are involved or when they do not
 * already sit on a common circle — in that case the caller should fall back to
 * plain card dragging.
 */
export function computeRingSpacingLayout(
  nodes: CanvasNode[],
  tolerance = 0.18,
): RingSpacingLayout | null {
  if (nodes.length < 3) return null;

  const ring = computeRingLayout(nodes, tolerance);
  if (!ring) return null;

  const cx = ring.center.x;
  const cy = ring.center.y;
  const centerOf = (n: CanvasNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

  const ordered = [...nodes].sort((a, b) => {
    const pa = centerOf(a);
    const pb = centerOf(b);
    return Math.atan2(pa.y - cy, pa.x - cx) - Math.atan2(pb.y - cy, pb.x - cx);
  });

  // Match alignNodesInCircle's default so the first resize is a no-op.
  const startAngleDeg =
    (Math.atan2(centerOf(ordered[0]).y - cy, centerOf(ordered[0]).x - cx) * 180) / Math.PI;

  return {
    center: ring.center,
    radius: ring.radius,
    count: ordered.length,
    minRadius: computeMinRingRadius(ordered),
    startAngleDeg,
    orderedIds: ordered.map((n) => n.id),
  };
}

/**
 * Re-flows a ring while one of its cards is dragged, turning the drag into a
 * live radius (and therefore spacing) adjustment.
 *
 * The dragged card follows the pointer; every other card keeps its seat and
 * re-distributes around the centre at the new radius. The centre is pinned to
 * where the ring was when the drag started, so the whole ring does not drift
 * across the canvas.
 */
export function resizeRingSpacing(
  allNodes: CanvasNode[],
  layout: RingSpacingLayout,
  draggedNodeId: string,
  draggedCenter: { x: number; y: number },
): CanvasNode[] {
  const radius = Math.max(
    layout.minRadius,
    Math.hypot(draggedCenter.x - layout.center.x, draggedCenter.y - layout.center.y),
  );

  return alignNodesInCircle(allNodes, new Set(layout.orderedIds), {
    radius,
    startAngleDeg: layout.startAngleDeg,
    orderedIds: layout.orderedIds,
    clampToMinRadius: true,
    // Pin the centre so the ring grows/shrinks in place instead of creeping.
    center: layout.center,
  });
}

/**
 * Arranges the selected cards evenly around a circle — the visual companion of
 * "建立闭环环形连线".
 *
 * Behaviour:
 * 1. The circle is centred on the current bounding-box centre of the
 *    selection, so the ring stays where the user already laid it out.
 * 2. Angular order is preserved from the cards' current positions (the same
 *    clockwise ordering used by connectLoopNodes), so the resulting ring
 *    reads in the order the user expects.
 * 3. Each card is placed by its own centre on the circle, which keeps the ring
 *    balanced even when card sizes differ.
 * 4. The radius never shrinks below the current spread, and never below the
 *    value that would make adjacent cards collide.
 */
export function alignNodesInCircle(
  allNodes: CanvasNode[],
  selectedNodeIds: Set<string> | string[],
  options?: CircleAlignOptions,
): CanvasNode[] {
  const selSet = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  const selNodes = allNodes.filter((n) => selSet.has(n.id));
  if (selNodes.length < 3) return allNodes;

  const centerOf = (n: CanvasNode) => ({
    x: n.x + n.width / 2,
    y: n.y + n.height / 2,
  });

  // Circle centre = bounding-box centre of the current selection, unless the
  // caller pinned one (interactive resizing does, to stop the ring drifting).
  const minX = Math.min(...selNodes.map((n) => n.x));
  const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
  const minY = Math.min(...selNodes.map((n) => n.y));
  const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
  const cx = options?.center?.x ?? minX + (maxX - minX) / 2;
  const cy = options?.center?.y ?? minY + (maxY - minY) / 2;

  // Clockwise seating order. An explicit order (passed by the interactive
  // spacing controls) wins, so cards keep their seats while the radius
  // changes; otherwise the order is derived from the current angles.
  const ordered = options?.orderedIds
    ? orderByExplicitIds(selNodes, options.orderedIds, centerOf, cx, cy)
    : [...selNodes].sort((a, b) => {
        const pa = centerOf(a);
        const pb = centerOf(b);
        const angleA = Math.atan2(pa.y - cy, pa.x - cx);
        const angleB = Math.atan2(pb.y - cy, pb.x - cx);
        return angleA - angleB;
      });

  const count = ordered.length;
  const minRadius = computeMinRingRadius(ordered);

  // Radius: never collapse inward, never let neighbours overlap
  let radius = options?.radius;
  if (!radius || radius <= 0) {
    const currentSpread = Math.max(
      ...ordered.map((n) => {
        const p = centerOf(n);
        return Math.hypot(p.x - cx, p.y - cy);
      }),
    );
    radius = Math.max(currentSpread, minRadius);
  } else if (options?.clampToMinRadius) {
    radius = Math.max(radius, minRadius);
  }

  const startAngle = ((options?.startAngleDeg ?? -90) * Math.PI) / 180;

  const positions = new Map<string, { x: number; y: number }>();
  ordered.forEach((n, i) => {
    const angle = startAngle + (i * 2 * Math.PI) / count;
    positions.set(n.id, {
      x: Math.round(cx + radius * Math.cos(angle) - n.width / 2),
      y: Math.round(cy + radius * Math.sin(angle) - n.height / 2),
    });
  });

  return allNodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
}

/**
 * Options for rectangular (grid) alignment of multiple cards.
 */
export interface GridAlignOptions {
  /** Number of columns. Defaults to ceil(sqrt(N)) — the squarish layout. */
  columns?: number;
  /** Horizontal gutter between cards (default 40). */
  gapX?: number;
  /** Vertical gutter between cards (default 40). */
  gapY?: number;
  /**
   * When set, this card keeps its current coordinates and the whole grid is
   * translated so that it lands exactly where it already is. Used by the
   * drag-to-resize-spacing interaction so the card under the cursor acts as
   * the anchor while every other card re-flows around it.
   */
  anchorNodeId?: string;
}

/**
 * Arranges the selected cards into a neat rectangular grid.
 *
 * Behaviour:
 * 1. Reading order is preserved (top-to-bottom, left-to-right), so cards keep
 *    the sequence the user already established.
 * 2. All cells share one uniform size (the largest card, plus the gutter), so
 *    rows and columns line up perfectly.
 * 3. Each card is centred inside its own cell.
 * 4. The grid stays centred on the selection's original bounding-box centre.
 */
export function alignNodesInGrid(
  allNodes: CanvasNode[],
  selectedNodeIds: Set<string> | string[],
  options?: GridAlignOptions,
): CanvasNode[] {
  const selSet = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  const selNodes = allNodes.filter((n) => selSet.has(n.id));
  if (selNodes.length < 2) return allNodes;

  const gapX = options?.gapX ?? 40;
  const gapY = options?.gapY ?? 40;

  // Preserve reading order: rows first (with a tolerance), then columns
  const ordered = [...selNodes].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 40) return a.y - b.y;
    return a.x - b.x;
  });

  const count = ordered.length;
  const requestedCols = options?.columns && options.columns > 0 ? Math.floor(options.columns) : 0;
  const cols = Math.max(1, Math.min(count, requestedCols || Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / cols);

  const cellW = Math.max(...ordered.map((n) => n.width)) + gapX;
  const cellH = Math.max(...ordered.map((n) => n.height)) + gapY;

  // Keep the grid centred on the original selection centre
  const minX = Math.min(...selNodes.map((n) => n.x));
  const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
  const minY = Math.min(...selNodes.map((n) => n.y));
  const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
  const cx = minX + (maxX - minX) / 2;
  const cy = minY + (maxY - minY) / 2;

  const gridW = cols * cellW - gapX;
  const gridH = rows * cellH - gapY;
  const startX = cx - gridW / 2;
  const startY = cy - gridH / 2;

  const positions = new Map<string, { x: number; y: number }>();
  ordered.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(n.id, {
      x: Math.round(startX + col * cellW + (cellW - gapX - n.width) / 2),
      y: Math.round(startY + row * cellH + (cellH - gapY - n.height) / 2),
    });
  });

  // Anchor support: pin the referenced card exactly where it already is and
  // shift the whole grid accordingly, so the card under the cursor can drive
  // the layout during a drag without jumping.
  let shiftX = 0;
  let shiftY = 0;
  if (options?.anchorNodeId) {
    const anchor = ordered.find((n) => n.id === options.anchorNodeId);
    const anchorPos = anchor ? positions.get(anchor.id) : undefined;
    if (anchor && anchorPos) {
      shiftX = anchor.x - anchorPos.x;
      shiftY = anchor.y - anchorPos.y;
    }
  }

  return allNodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, x: pos.x + shiftX, y: pos.y + shiftY } : n;
  });
}

/**
 * Detected rectangular-grid layout of a set of cards.
 */
export interface GridLayoutInfo {
  cols: number;
  rows: number;
  gapX: number;
  gapY: number;
  cellW: number;
  cellH: number;
  /** nodeId -> cell coordinates */
  positions: Map<string, { row: number; col: number }>;
  /** Ordered node ids in reading order (row by row). */
  orderedIds: string[];
}

/**
 * Detects whether a set of cards forms a complete rectangular grid.
 *
 * A layout qualifies when:
 * 1. it has at least 2 columns and 2 rows,
 * 2. every card sits on a shared column X and row Y (within `tolerance`),
 * 3. the number of cards exactly fills cols × rows (no holes).
 *
 * Returns null for free-form layouts so callers can fall back to normal
 * behaviour.
 */
export function computeGridLayout(nodes: CanvasNode[], tolerance = 10): GridLayoutInfo | null {
  if (nodes.length < 4) return null;

  const clusterValues = (values: number[]): number[] => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      if (out.length === 0 || v - out[out.length - 1] > tolerance) out.push(v);
    }
    return out;
  };

  const colXs = clusterValues(nodes.map((n) => n.x));
  const rowYs = clusterValues(nodes.map((n) => n.y));
  const cols = colXs.length;
  const rows = rowYs.length;

  if (cols < 2 || rows < 2) return null;
  if (cols * rows !== nodes.length) return null;

  const positions = new Map<string, { row: number; col: number }>();
  for (const n of nodes) {
    const col = colXs.findIndex((x) => Math.abs(x - n.x) <= tolerance);
    const row = rowYs.findIndex((y) => Math.abs(y - n.y) <= tolerance);
    if (col < 0 || row < 0) return null;
    positions.set(n.id, { row, col });
  }
  if (positions.size !== nodes.length) return null;

  const cellW = cols > 1 ? colXs[1] - colXs[0] : 0;
  const cellH = rows > 1 ? rowYs[1] - rowYs[0] : 0;

  const maxW = Math.max(...nodes.map((n) => n.width));
  const maxH = Math.max(...nodes.map((n) => n.height));

  const orderedIds = [...nodes]
    .sort((a, b) => {
      const pa = positions.get(a.id)!;
      const pb = positions.get(b.id)!;
      return pa.row - pb.row || pa.col - pb.col;
    })
    .map((n) => n.id);

  return {
    cols,
    rows,
    gapX: cellW - maxW,
    gapY: cellH - maxH,
    cellW,
    cellH,
    positions,
    orderedIds,
  };
}

/**
 * Re-flows a rectangular grid while the user drags one of its cards, so the
 * drag turns into an interactive spacing adjustment:
 *
 * - the dragged card follows the pointer exactly (it is the anchor),
 * - the horizontal gutter grows with the horizontal drag distance, spread
 *   across the columns,
 * - the vertical gutter grows with the vertical drag distance, spread across
 *   the rows.
 *
 * Returns nodes unchanged when the layout is not a proper grid.
 */
export function resizeGridSpacing(
  allNodes: CanvasNode[],
  layout: GridLayoutInfo,
  draggedNodeId: string,
  deltaX: number,
  deltaY: number,
  baseGapX: number,
  baseGapY: number,
  minGap = 4,
): CanvasNode[] {
  const ids = new Set(layout.orderedIds);
  const spreadX = Math.max(1, layout.cols - 1);
  const spreadY = Math.max(1, layout.rows - 1);

  const gapX = Math.max(minGap, baseGapX + deltaX / spreadX);
  const gapY = Math.max(minGap, baseGapY + deltaY / spreadY);

  // The dragged card has already been moved to the pointer position by the
  // caller; passing it as the anchor keeps it exactly there while every other
  // card re-flows around it with the new gutters.
  return alignNodesInGrid(allNodes, ids, {
    columns: layout.cols,
    gapX,
    gapY,
    anchorNodeId: draggedNodeId,
  });
}

/**
 * Detects whether a set of nodes is laid out on a common circle.
 * Returns the centre and the mean radius when the deviation across all cards
 * is within `tolerance` (relative), otherwise null.
 */
export function computeRingLayout(
  nodes: CanvasNode[],
  tolerance = 0.18,
): { center: { x: number; y: number }; radius: number } | null {
  if (nodes.length < 3) return null;

  const cx = nodes.reduce((sum, n) => sum + (n.x + n.width / 2), 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nodes.length;

  const distances = nodes.map((n) => Math.hypot(n.x + n.width / 2 - cx, n.y + n.height / 2 - cy));
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  if (mean < 1) return null;

  const maxDeviation = Math.max(...distances.map((d) => Math.abs(d - mean)));
  if (maxDeviation / mean > tolerance) return null;

  return { center: { x: cx, y: cy }, radius: mean };
}

/**
 * Aligns or distributes selected nodes along the specified direction
 */
export function alignNodes(
  allNodes: CanvasNode[],
  selectedNodeIds: Set<string> | string[],
  direction: CanvasAlignDirection,
): CanvasNode[] {
  const selSet = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  const selNodes = allNodes.filter((n) => selSet.has(n.id));
  if (selNodes.length < 2) return allNodes;

  // Ring layout needs at least 3 cards to form a meaningful circle
  if (direction === "circle") {
    return alignNodesInCircle(allNodes, selSet);
  }

  if (direction === "grid") {
    return alignNodesInGrid(allNodes, selSet);
  }

  if (direction === "horizontal" || direction === "middle") {
    const minY = Math.min(...selNodes.map((n) => n.y));
    const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
    const centerY = minY + (maxY - minY) / 2;
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, y: Math.round(centerY - n.height / 2) } : n,
    );
  }

  if (direction === "vertical" || direction === "center") {
    const minX = Math.min(...selNodes.map((n) => n.x));
    const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
    const centerX = minX + (maxX - minX) / 2;
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, x: Math.round(centerX - n.width / 2) } : n,
    );
  }

  if (direction === "left") {
    const minX = Math.min(...selNodes.map((n) => n.x));
    return allNodes.map((n) => (selSet.has(n.id) ? { ...n, x: minX } : n));
  }

  if (direction === "right") {
    const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
    return allNodes.map((n) => (selSet.has(n.id) ? { ...n, x: maxX - n.width } : n));
  }

  if (direction === "top") {
    const minY = Math.min(...selNodes.map((n) => n.y));
    return allNodes.map((n) => (selSet.has(n.id) ? { ...n, y: minY } : n));
  }

  if (direction === "bottom") {
    const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
    return allNodes.map((n) => (selSet.has(n.id) ? { ...n, y: maxY - n.height } : n));
  }

  if (direction === "distribute-h") {
    if (selNodes.length < 3) return allNodes;
    const sorted = [...selNodes].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalCardsWidth = sorted.reduce((sum, n) => sum + n.width, 0);
    const totalSpan = last.x + last.width - first.x;
    const availableGap = totalSpan - totalCardsWidth;
    const gap = Math.max(20, Math.round(availableGap / (sorted.length - 1)));

    const newXMap = new Map<string, number>();
    let curX = first.x;
    for (let i = 0; i < sorted.length; i++) {
      newXMap.set(sorted[i].id, curX);
      curX += sorted[i].width + gap;
    }

    return allNodes.map((n) => (newXMap.has(n.id) ? { ...n, x: newXMap.get(n.id)! } : n));
  }

  if (direction === "distribute-v") {
    if (selNodes.length < 3) return allNodes;
    const sorted = [...selNodes].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalCardsHeight = sorted.reduce((sum, n) => sum + n.height, 0);
    const totalSpan = last.y + last.height - first.y;
    const availableGap = totalSpan - totalCardsHeight;
    const gap = Math.max(20, Math.round(availableGap / (sorted.length - 1)));

    const newYMap = new Map<string, number>();
    let curY = first.y;
    for (let i = 0; i < sorted.length; i++) {
      newYMap.set(sorted[i].id, curY);
      curY += sorted[i].height + gap;
    }

    return allNodes.map((n) => (newYMap.has(n.id) ? { ...n, y: newYMap.get(n.id)! } : n));
  }

  return allNodes;
}
