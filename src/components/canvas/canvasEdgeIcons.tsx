import type { CanvasEdgeLabelShape } from "../../types/canvasTypes";

/**
 * Inline glyphs for the three label shapes, drawn with `currentColor` so they
 * inherit whatever the surrounding button is using.
 *
 * Extracted from CanvasView during the R2 split — the edge context menu renders
 * them and nothing else does.
 */
export function renderEdgeShapeIcon(shape: CanvasEdgeLabelShape, active: boolean) {
  if (shape === "pill") {
    return (
      <svg width="14" height="9" viewBox="0 0 14 9" fill="none" style={{ display: "block" }}>
        <rect
          x="1"
          y="1"
          width="12"
          height="7"
          rx="3.5"
          stroke="currentColor"
          strokeWidth="1.3"
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.25 : 0}
        />
      </svg>
    );
  }
  if (shape === "rect") {
    return (
      <svg width="14" height="9" viewBox="0 0 14 9" fill="none" style={{ display: "block" }}>
        <rect
          x="1"
          y="1"
          width="12"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.25 : 0}
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: "block" }}>
      <polygon
        points="6,1 11,6 6,11 1,6"
        stroke="currentColor"
        strokeWidth="1.3"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.25 : 0}
      />
    </svg>
  );
}
