import type { ReactNode, RefObject } from "react";
import type { MindmapTheme } from "../../core/mindmapThemes";
import { branchColorFor } from "../../core/mindmapThemes";
import type { MindmapLayoutResult } from "../../services/mindmapLayout";

/**
 * The SVG scaffolding of the mind map canvas: the `<svg>` itself with the
 * canvas-level gestures, the glow filter defs, the marquee rect, the viewport
 * `<g>` that carries the pan & zoom, the edge paths group, and the drag ghost
 * that follows the cursor outside the svg.
 *
 * Extracted from MindmapView (batch 3, wave 3 of the decomposition — the final
 * wave). The `<svg>` element comes with the scaffolding because the drag ghost
 * is its sibling: a component cannot span the svg boundary, so owning one means
 * owning the other. The layers the view still owns arrive as three explicit
 * slots and land inside the viewport group in the same paint order as before —
 * the boundaries and relations under the outline, then the edge paths, then the
 * per-node layer (`MindmapNodeLayer`, mounted by the view), then the summaries
 * and free topics above it. Everything is threaded as explicit props — no
 * context, no memo — and the JSX (including the inline closures) is carried
 * over verbatim.
 */
type MindmapCanvasLayersProps = {
  /** The on-screen svg; the print path swaps its view box for the page. */
  svgRef: RefObject<SVGSVGElement | null>;
  /** The camera transform the viewport group renders. */
  transform: { x: number; y: number; scale: number };
  // The svg's three canvas-level gestures, from the view.
  handleCanvasMouseDown: (e: React.MouseEvent) => void;
  handleCanvasDoubleClick: (e: React.MouseEvent) => void;
  handleCanvasContextMenu: (e: React.MouseEvent) => void;
  /** The marquee box, in canvas coordinates, while a press on empty space drags. */
  marquee: { x1: number; y1: number; x2: number; y2: number } | null;
  /** The laid-out map: the edges draw here; the drag ghost looks its label up here. */
  layout: MindmapLayoutResult;
  /** Where branch colours come from — an edge with its own colour keeps it. */
  mindmapTheme: MindmapTheme;
  /** An edge highlights while either of its endpoints is hovered or selected. */
  hoveredNodeId: string | null;
  selectedNodeIds: Set<string>;
  /** The drag-and-drop state the ghost badge reads, from useMindmapViewport. */
  draggingNodeId: string | null;
  dragGhostPos: { x: number; y: number } | null;
  dropTargetId: string | null;
  /** The view's own layers that sit UNDER the outline: boundaries, relations. */
  backLayers: ReactNode;
  /** The per-node layer — `MindmapNodeLayer`, mounted by the view. */
  nodeLayer: ReactNode;
  /** The view's own layers that sit ABOVE the outline: summaries, free topics. */
  frontLayers: ReactNode;
};

export function MindmapCanvasLayers({
  svgRef,
  transform,
  handleCanvasMouseDown,
  handleCanvasDoubleClick,
  handleCanvasContextMenu,
  marquee,
  layout,
  mindmapTheme,
  hoveredNodeId,
  selectedNodeIds,
  draggingNodeId,
  dragGhostPos,
  dropTargetId,
  backLayers,
  nodeLayer,
  frontLayers,
}: MindmapCanvasLayersProps) {
  return (
    <>
      <svg
        ref={svgRef}
        className="mindmap-svg-canvas"
        width="100%"
        height="100%"
        // Canvas-level gestures. Each one asks isBlankCanvasTarget first, so
        // a click on a node does not also count as a click on the canvas.
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={handleCanvasContextMenu}
      >
        <defs>
          <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Marquee box. Inside the viewport group so its coordinates are the
            same canvas coordinates the nodes are laid out in — drawing it
            outside would mean converting by hand on every frame. */}
        {marquee && (
          <rect
            className="mindmap-marquee"
            x={Math.min(marquee.x1, marquee.x2)}
            y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)}
            height={Math.abs(marquee.y2 - marquee.y1)}
            fill="rgba(var(--accent-info-rgb), 0.12)"
            stroke="var(--accent-info)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        <g
          className="mindmap-viewport"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          {backLayers}

          {/* Render Bezier / Step / Straight Connecting Edges */}
          <g className="mindmap-edges-group">
            {layout.edges.map((edge) => {
              // The theme is where branch colours come from. An edge that
              // carries its own colour keeps it; only the default changes.
              const defaultColor = branchColorFor(mindmapTheme, edge.colorIndex);
              const color = edge.color || defaultColor;
              const isHighlighted =
                hoveredNodeId === edge.fromId ||
                hoveredNodeId === edge.toId ||
                selectedNodeIds.has(edge.fromId) ||
                selectedNodeIds.has(edge.toId);
              return (
                <path
                  key={`${edge.fromId}->${edge.toId}`}
                  d={edge.d}
                  className={`mindmap-branch-path ${isHighlighted ? "is-highlighted" : ""}`}
                  stroke={color}
                  strokeWidth={isHighlighted ? 2.5 : 1.8}
                  fill="none"
                  strokeOpacity={isHighlighted ? 0.95 : 0.65}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {nodeLayer}

          {frontLayers}
        </g>
      </svg>

      {/* Dragging Ghost Node Badge Following Cursor */}
      {draggingNodeId && dragGhostPos && (
        <div
          className="mindmap-drag-ghost"
          style={{
            position: "fixed",
            left: dragGhostPos.x + 14,
            top: dragGhostPos.y + 14,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          <span className="ghost-icon">📦</span>
          <span className="ghost-text">
            {layout.nodes.find((n) => n.id === draggingNodeId)?.text || "主题"}
          </span>
          {dropTargetId && <span className="ghost-target-hint">➔ 移为子主题</span>}
        </div>
      )}
    </>
  );
}
