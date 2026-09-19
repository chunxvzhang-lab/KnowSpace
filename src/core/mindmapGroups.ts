import type { Bounds } from "./mindmapBounds";

/**
 * The drawings that say something about a *group* of nodes rather than about one
 * of them — a summary's bracket today, a boundary's box next.
 *
 * The geometry lives here, away from the components, because a bracket that is
 * two pixels off its group looks deliberate: nobody eyeballs that and files it.
 * The rules are short enough to state and to check — it spans the group's height,
 * it sits just outside its right edge, and its hooks point back at the group.
 */

/** How much air a boundary leaves between itself and the topics it holds. */
export const BOUNDARY_PADDING = 16;

/**
 * How far a summary's bracket stands off the group it embraces.
 *
 * Measured from the group, so it has to clear a boundary drawn around the same
 * group — the two may be on one map at once, and that is the case where a bracket
 * inside a box would read as part of it. The margin is the point: whenever one of
 * these two numbers moves, this is why the other follows.
 */
export const SUMMARY_BRACKET_GAP = BOUNDARY_PADDING + 8;
/** How far the bracket's hooks reach back towards the group. */
export const SUMMARY_HOOK = 6;

/**
 * The path for a summary's bracket, to the right of the group it spans.
 *
 * A bracket rather than a box: a box around the group would read as a boundary
 * (which is a different feature with a different meaning — "these belong
 * together" against "this is the group being summarised"), and the two have to be
 * tellable apart when both are on the same map.
 */
export function summaryBracketPath(bounds: Bounds, gap = SUMMARY_BRACKET_GAP): string {
  const x = bounds.minX + bounds.width + gap;
  const top = bounds.minY;
  const bottom = bounds.minY + bounds.height;

  return `M ${x - SUMMARY_HOOK} ${top} L ${x} ${top} L ${x} ${bottom} L ${x - SUMMARY_HOOK} ${bottom}`;
}

/** Where a summary's label starts: past the bracket, centred on the group. */
export function summaryLabelAnchor(bounds: Bounds, gap = SUMMARY_BRACKET_GAP): { x: number; y: number } {
  return { x: bounds.minX + bounds.width + gap + 6, y: bounds.minY + bounds.height / 2 };
}

/**
 * Extra air at the top, where the title sits.
 *
 * Above the box rather than in a band of its own, so the title never covers a
 * topic: a box drawn tight around a group has room for neither, and a title laid
 * over the first topic would make the reader choose between reading the two.
 */
export const BOUNDARY_TITLE_BAND = 14;
/** Corner rounding, so a boundary reads as "around" rather than "at". */
export const BOUNDARY_RADIUS = 10;

export interface BoundaryRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

/**
 * The box around a group, in absolute coordinates.
 *
 * A summary and a boundary may span the same group, so the two drawings have to
 * be told apart without reading them: the bracket stands off to the right and the
 * box encloses — which is also why this is a rounded rectangle and not a tighter
 * shape, and why the gap is generous rather than snug.
 */
export function boundaryRect(bounds: Bounds, padding = BOUNDARY_PADDING): BoundaryRect {
  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding - BOUNDARY_TITLE_BAND,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2 + BOUNDARY_TITLE_BAND,
    rx: BOUNDARY_RADIUS,
  };
}

/** Where a boundary's title starts, in the band above its top edge. */
export function boundaryTitleAnchor(bounds: Bounds, padding = BOUNDARY_PADDING): { x: number; y: number } {
  return { x: bounds.minX - padding + 10, y: bounds.minY - padding - BOUNDARY_TITLE_BAND / 2 };
}

/**
 * The colours a boundary can be drawn in.
 *
 * A short list rather than a picker: a boundary's job is to group, and a map with
 * six boundaries in six hues is a map nobody can read. The id is what goes in the
 * file, for the same reason icon ids are — the hex value is a rendering decision
 * and may change; which colour the reader picked may not.
 */
export const MINDMAP_BOUNDARY_COLORS = [
  { id: "slate", label: "灰", color: "#94a3b8" },
  { id: "sky", label: "蓝", color: "#38bdf8" },
  { id: "emerald", label: "绿", color: "#34d399" },
  { id: "amber", label: "琥珀", color: "#f59e0b" },
  { id: "rose", label: "玫红", color: "#fb7185" },
  { id: "violet", label: "紫", color: "#a78bfa" },
] as const;

export const DEFAULT_BOUNDARY_COLOR = MINDMAP_BOUNDARY_COLORS[0];

/**
 * A boundary's colour, by id.
 *
 * An id this build does not know falls back to the default rather than drawing
 * nothing — the opposite of the icon table, and deliberately: an icon *is* a
 * decoration and omitting it loses nothing, while a boundary's box *is* the thing
 * the reader asked for, so it has to be drawn whatever colour it can be.
 */
export function findBoundaryColor(
  id?: string
): (typeof MINDMAP_BOUNDARY_COLORS)[number] {
  return MINDMAP_BOUNDARY_COLORS.find((entry) => entry.id === id) ?? DEFAULT_BOUNDARY_COLOR;
}
