/**
 * Whose wheel is it — the canvas's, or something inside it?
 *
 * The canvas pans on wheel. A card body scrolls on wheel. Both used to happen at
 * once: the wheel reached the card, scrolled it, and then bubbled up to the
 * canvas, which panned as well — so scrolling a checklist dragged the whole
 * whiteboard sideways. The card body and the suggestion popup now say so before
 * the canvas acts.
 *
 * The rule is the one browsers use for scroll chaining, and it is deliberately
 * narrower than "is this element scrollable": an inner region only owns the wheel
 * while it still has somewhere to scroll. Once it is pinned at its edge the wheel
 * goes back to the canvas, so a wheel over a card never becomes a dead zone.
 */

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/** Rounding and fractional-layout slack, in CSS pixels. */
const EDGE_SLACK = 1;

/** Does `el` still have room to scroll in the wheel's direction? */
export function canConsumeWheel(el: Element, deltaX: number, deltaY: number): boolean {
  const style = getComputedStyle(el);

  if (deltaY !== 0 && SCROLLABLE_OVERFLOW.has(style.overflowY)) {
    const room = el.scrollHeight - el.clientHeight;
    if (room > EDGE_SLACK) {
      const atEdge = deltaY < 0 ? el.scrollTop <= 0 : el.scrollTop >= room - EDGE_SLACK;
      if (!atEdge) return true;
    }
  }

  if (deltaX !== 0 && SCROLLABLE_OVERFLOW.has(style.overflowX)) {
    const room = el.scrollWidth - el.clientWidth;
    if (room > EDGE_SLACK) {
      const atEdge = deltaX < 0 ? el.scrollLeft <= 0 : el.scrollLeft >= room - EDGE_SLACK;
      if (!atEdge) return true;
    }
  }

  return false;
}

/**
 * Should this wheel scroll something inside the canvas instead of moving it?
 *
 * Walks from the event target up to `boundary` (the canvas root, which is
 * excluded), and stops at the first ancestor that can still take the wheel.
 */
export function wheelBelongsToInnerScroller(
  target: EventTarget | null,
  deltaX: number,
  deltaY: number,
  boundary: Element | null
): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== boundary) {
    if (canConsumeWheel(el, deltaX, deltaY)) return true;
    el = el.parentElement;
  }
  return false;
}
