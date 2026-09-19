/** A rectangle in canvas coordinates: what a view has to frame. */
export interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * The bounds that hold both rectangles.
 *
 * Needed because floating topics sit outside the outline's bounds — the layout
 * engine has never heard of them, and rightly so. Anything that has to frame the
 * whole canvas (an export, "fit to screen") takes the union, or a topic dragged
 * into open space would be cropped out of the file it was dragged into.
 *
 * Pure, so the arithmetic is checked once rather than trusted in two places.
 */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.minX + a.width, b.minX + b.width);
  const maxY = Math.max(a.minY + a.height, b.minY + b.height);

  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** The bounds of a set of boxes, in the shape the layout's own bounds come in. */
export function boundsOfBoxes(
  boxes: { x: number; y: number; width: number; height: number }[],
  padding: number
): Bounds | null {
  if (boxes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
