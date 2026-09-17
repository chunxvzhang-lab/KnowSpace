import { memo } from "react";

/**
 * The rubber-band rectangle drawn while box-selecting cards.
 *
 * Extracted from CanvasView (R2 batch B2) — see docs/CANVAS_SPLIT_DESIGN.md.
 * The box is stored in canvas coordinates, so it is converted to screen space
 * with the viewport transform here rather than keeping a second, screen-space
 * copy in the parent.
 */
export type MarqueeBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type MarqueeSelectionBoxProps = {
  box: MarqueeBox | null;
  viewport: { panX: number; panY: number; zoom: number };
};

export const MarqueeSelectionBox = memo(function MarqueeSelectionBox({
  box,
  viewport,
}: MarqueeSelectionBoxProps) {
  if (!box) return null;

  return (
    <div
      className="canvas-selection-box"
      style={{
        position: "absolute",
        left: Math.min(box.startX, box.currentX) * viewport.zoom + viewport.panX,
        top: Math.min(box.startY, box.currentY) * viewport.zoom + viewport.panY,
        width: Math.abs(box.currentX - box.startX) * viewport.zoom,
        height: Math.abs(box.currentY - box.startY) * viewport.zoom,
        zIndex: 80,
        pointerEvents: "none",
      }}
    />
  );
});
