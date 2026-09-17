import type { CanvasEdge } from "../../types/canvasTypes";

/**
 * Reads the circular-arc metadata off an edge, if it has any.
 *
 * A loop that has been aligned to a circle stores its centre and radius on each
 * of its edges; the edge renderer and the label layer both need to turn that
 * back into the shape `computeEdgePath` expects, and the SVG exporter needs the
 * same thing. Extracted from CanvasView during the R2 split so all three agree.
 */
export function getEdgeRing(
  edge: CanvasEdge
): { center: { x: number; y: number }; radius: number } | undefined {
  return edge.ringCenter && edge.ringRadius
    ? { center: edge.ringCenter, radius: edge.ringRadius }
    : undefined;
}
