import { memo } from "react";
import type { ThemeMode } from "../../core/types";
import type { CanvasData, CanvasGroupNode, CanvasNode } from "../../types/canvasTypes";
import { getNodePalette } from "./canvasPalette";

/**
 * Bottom-right radar map with a live viewport camera box.
 *
 * Extracted from CanvasView (R2 batch B2) — see docs/CANVAS_SPLIT_DESIGN.md.
 * Clicking recentres the board; the parent owns the viewport, so that is
 * reported through `onNavigate` rather than mutating state in here.
 */
type CanvasMinimapProps = {
  data: CanvasData;
  viewport: { panX: number; panY: number; zoom: number };
  theme: ThemeMode;
  isDark: boolean;
  /** Border/edge colours come from the shared canvas theme. */
  colors: { edgeColor: string; cardBorder: string };
  nodeMap: Map<string, CanvasNode>;
  selectedNodeIds: Set<string>;
  /** Minimap projection, precomputed by the parent from the same bounds. */
  bounds: { minX: number; minY: number };
  scale: number;
  offsetX: number;
  offsetY: number;
  /**
   * The scroll container, used to size the camera box. Passed as an element
   * rather than a ref so the component stays a pure function of its props.
   */
  containerEl: HTMLElement | null;
  /** Receives canvas-space coordinates for a click on the minimap. */
  onNavigate: (canvasX: number, canvasY: number) => void;
};

export const CanvasMinimap = memo(function CanvasMinimap({
  data,
  viewport,
  theme,
  isDark,
  colors,
  nodeMap,
  selectedNodeIds,
  bounds,
  scale,
  offsetX,
  offsetY,
  containerEl,
  onNavigate,
}: CanvasMinimapProps) {
  const viewW = containerEl?.clientWidth ?? 0;
  const viewH = containerEl?.clientHeight ?? 0;

  return (
    <div
      className="canvas-minimap"
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        width: 180,
        height: 130,
        zIndex: 90,
        borderRadius: 10,
        backgroundColor:
          theme === "eink"
            ? "rgba(244, 241, 234, 0.9)"
            : !isDark
            ? "rgba(255, 255, 255, 0.94)"
            : "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${!isDark ? "#e2e8f0" : colors.cardBorder}`,
        boxShadow: !isDark ? "0 4px 16px rgba(0,0,0,0.06)" : "0 6px 20px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = (e.clientX - rect.left - offsetX) / scale + bounds.minX;
        const clickY = (e.clientY - rect.top - offsetY) / scale + bounds.minY;
        onNavigate(clickX, clickY);
      }}
    >
      <svg style={{ width: "100%", height: "100%" }}>
        {/* Layer A: Group Containers */}
        {data.nodes
          .filter((n): n is CanvasGroupNode => n.type === "group")
          .map((group) => {
            const rx = offsetX + (group.x - bounds.minX) * scale;
            const ry = offsetY + (group.y - bounds.minY) * scale;
            const rw = Math.max(6, group.width * scale);
            const rh = Math.max(6, group.height * scale);
            const pal = getNodePalette(group.color);
            return (
              <rect
                key={`mini-grp-${group.id}`}
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                fill={pal ? pal.bg : isDark ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.08)"}
                stroke={pal ? pal.stroke : "#3b82f6"}
                strokeWidth={0.8}
                strokeDasharray="2 2"
                rx={3}
              />
            );
          })}

        {/* Layer B: Edges preview */}
        {data.edges.map((edge) => {
          const fromNode = nodeMap.get(edge.fromNode);
          const toNode = nodeMap.get(edge.toNode);
          if (!fromNode || !toNode) return null;
          const x1 = offsetX + (fromNode.x + fromNode.width / 2 - bounds.minX) * scale;
          const y1 = offsetY + (fromNode.y + fromNode.height / 2 - bounds.minY) * scale;
          const x2 = offsetX + (toNode.x + toNode.width / 2 - bounds.minX) * scale;
          const y2 = offsetY + (toNode.y + toNode.height / 2 - bounds.minY) * scale;
          return (
            <line
              key={`mini-edge-${edge.id}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colors.edgeColor}
              strokeWidth={0.8}
              opacity={0.4}
            />
          );
        })}

        {/* Layer C: All Information Cards (Inside Groups & Standalone Outside Containers) */}
        {data.nodes
          .filter((n) => n.type !== "group")
          .map((card) => {
            const rx = offsetX + (card.x - bounds.minX) * scale;
            const ry = offsetY + (card.y - bounds.minY) * scale;
            const rw = Math.max(5, card.width * scale);
            const rh = Math.max(4, card.height * scale);
            const isSelected = selectedNodeIds.has(card.id);
            const pal = getNodePalette(card.color);
            const cardColor = isSelected
              ? "#f59e0b"
              : pal
              ? pal.stroke
              : card.type === "file"
              ? "#10b981"
              : card.type === "link"
              ? "#8b5cf6"
              : colors.edgeColor;
            return (
              <rect
                key={`mini-card-${card.id}`}
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                fill={cardColor}
                stroke={!isDark ? "#ffffff" : "#0f172a"}
                strokeWidth={0.8}
                rx={2}
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
              />
            );
          })}

        {/* Layer D: Viewport Camera Box */}
        {containerEl &&
          (() => {
            const camX = -viewport.panX / viewport.zoom;
            const camY = -viewport.panY / viewport.zoom;
            const camW = viewW / viewport.zoom;
            const camH = viewH / viewport.zoom;

            const vrx = offsetX + (camX - bounds.minX) * scale;
            const vry = offsetY + (camY - bounds.minY) * scale;
            const vrw = Math.max(12, camW * scale);
            const vrh = Math.max(8, camH * scale);

            return (
              <rect
                x={vrx}
                y={vry}
                width={vrw}
                height={vrh}
                fill="rgba(245, 158, 11, 0.08)"
                stroke="#f59e0b"
                strokeWidth={1.2}
                strokeDasharray="3 2"
                rx={2}
                pointerEvents="none"
              />
            );
          })()}
      </svg>
    </div>
  );
});
