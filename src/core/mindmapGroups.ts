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

/** How far a summary's bracket stands off the group it embraces. */
export const SUMMARY_BRACKET_GAP = 14;
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
