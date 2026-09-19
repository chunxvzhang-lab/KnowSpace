/**
 * The markers that say how urgent a node is and how far along it is.
 *
 * Icons cover what a node *is* — a star, a question, a person. These two cover
 * what a glance has to tell: which of nine priorities, how much of the work is
 * done. Numbers rather than more pictures, because "3" and "5/8" are read faster
 * than any glyph that would stand for them.
 *
 * Both ranges are deliberately finite. A free-form number would need a scale, a
 * scale would need a legend, and a legend on a mind map is a document nobody
 * reads; nine priorities and eighths of a task are what a person can hold in
 * mind while looking at a map.
 */

/** Priorities run 1 (most urgent) to 9. */
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 9;

/**
 * Progress steps run 1/8 to 8/8.
 *
 * There is no zero: 0/8 is a mark that says nothing, which is the same as having
 * no mark, and the picker says that by being empty rather than by drawing a
 * circle with nothing in it.
 */
export const PROGRESS_MIN = 1;
export const PROGRESS_MAX = 8;

/** One priority: the number, and what it is drawn in. */
export interface PriorityMark {
  value: number;
  label: string;
  color: string;
}

/** One progress step. */
export interface ProgressMark {
  value: number;
  label: string;
}

/**
 * A heat scale: urgent is red, calm is violet.
 *
 * Every colour here is dark enough to carry white numerals; a lighter scale
 * would need per-colour text colours and would still fail at 13 pixels.
 */
const PRIORITY_COLORS = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#059669",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
];

export const MINDMAP_PRIORITIES: PriorityMark[] = PRIORITY_COLORS.map((color, index) => ({
  value: PRIORITY_MIN + index,
  label: String(PRIORITY_MIN + index),
  color,
}));

export const MINDMAP_PROGRESS_STEPS: ProgressMark[] = Array.from(
  { length: PROGRESS_MAX - PROGRESS_MIN + 1 },
  (_, index) => ({ value: PROGRESS_MIN + index, label: `${PROGRESS_MIN + index}/${PROGRESS_MAX}` })
);

/** Whether a value is a priority this map can draw. */
export function isPriorityInRange(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PRIORITY_MIN &&
    value <= PRIORITY_MAX
  );
}

/** Whether a value is a progress step this map can draw. */
export function isProgressInRange(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PROGRESS_MIN &&
    value <= PROGRESS_MAX
  );
}

/** The priority with this value, or null — a value out of range is not an error. */
export function findPriorityMark(value: number | null | undefined): PriorityMark | null {
  if (!isPriorityInRange(value)) return null;
  return MINDMAP_PRIORITIES[value - PRIORITY_MIN] ?? null;
}

/** The progress step with this value, or null. */
export function findProgressMark(value: number | null | undefined): ProgressMark | null {
  if (!isProgressInRange(value)) return null;
  return MINDMAP_PROGRESS_STEPS[value - PROGRESS_MIN] ?? null;
}

/**
 * The filled wedge of a progress mark, as an SVG path.
 *
 * Starts at twelve o'clock and sweeps clockwise, which is how a reader expects a
 * dial to fill, and means two marks can be compared without counting anything.
 *
 * The centre and radius are the caller's, so one function draws both the small
 * glyph in the picker and the one on the node. A full circle is two half arcs
 * rather than one: an arc that ends where it began draws nothing at all.
 */
export function progressSlicePath(value: number, radius: number, cx: number, cy: number): string {
  const fraction = Math.min(1, Math.max(0, value / PROGRESS_MAX));

  if (fraction >= 1) {
    return [
      `M ${cx} ${cy - radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`,
      "Z",
    ].join(" ");
  }

  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  const x = cx + radius * Math.cos(angle);
  const y = cy + radius * Math.sin(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;

  return `M ${cx} ${cy} L ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y} Z`;
}
