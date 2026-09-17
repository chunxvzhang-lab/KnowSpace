import { memo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Check } from "lucide-react";
import type { CanvasEdge, CanvasNode, CanvasObstacle } from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import {
  CANVAS_COLOR_PALETTES,
  computeEdgeMidpoint,
  getEffectiveEdgeColorKey,
  getNodeAnchorPoint,
  getOptimalAnchorSides,
} from "../../services/canvasService";
import { getEdgeRing } from "./canvasEdgeUtils";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * Edge label badges, rendered above the cards so a connector's caption is never
 * buried under node content.
 *
 * Extracted from CanvasView (R2 batch B3) — see docs/CANVAS_SPLIT_DESIGN.md.
 * Labels are positioned at the geometric midpoint of the path (the line runs
 * through the badge centre), which is why this layer recomputes the midpoint
 * rather than reading it from the edge layer.
 */
type CanvasEdgeLabelLayerProps = {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  nodeMap: Map<string, CanvasNode>;
  /** Obstacles used for path routing; the endpoints are filtered per edge. */
  obstacles: CanvasObstacle[];
  selectedEdgeIds: Set<string>;
  editingEdgeId: string | null;
  editingLabel: string;
  onEditingLabelChange: (value: string) => void;
  onStartEditing: (edgeId: string) => void;
  onStopEditing: () => void;
  /** Shift/cmd-click toggles; a plain click replaces the selection. */
  onSelectionChange: (ids: Set<string>) => void;
  onClearNodeSelection: () => void;
  onSaveLabel: () => void;
  onContextMenu: (event: ReactMouseEvent, edge: CanvasEdge) => void;
  /** Viewport culling, kept in the parent where the bounds are computed. */
  isInViewport: (edge: CanvasEdge, from: CanvasNode, to: CanvasNode) => boolean;
  /** Source-based edge colour map shared with the exporter. */
  colorMap: Map<string, string>;
  colors: CanvasThemeColors;
  isDark: boolean;
  presentation: { active: boolean; sequence: string[]; index: number };
};

export const CanvasEdgeLabelLayer = memo(function CanvasEdgeLabelLayer({
  edges,
  nodes,
  nodeMap,
  obstacles,
  selectedEdgeIds,
  editingEdgeId,
  editingLabel,
  onEditingLabelChange,
  onStartEditing,
  onStopEditing,
  onSelectionChange,
  onClearNodeSelection,
  onSaveLabel,
  onContextMenu,
  isInViewport,
  colorMap,
  colors,
  isDark,
  presentation,
}: CanvasEdgeLabelLayerProps) {
  return (
    <>
      {edges.map((edge) => {
        const fromNode = nodeMap.get(edge.fromNode);
        const toNode = nodeMap.get(edge.toNode);
        if (!fromNode || !toNode) return null;
        if (!isInViewport(edge, fromNode, toNode)) return null;

        const hasLabel = Boolean(edge.label && edge.label.trim().length > 0);
        const isEditing = editingEdgeId === edge.id;
        if (!hasLabel && !isEditing) return null;

        const optSides = getOptimalAnchorSides(fromNode, toNode);
        const fromSide = edge.fromSide || optSides.fromSide;
        const toSide = edge.toSide || optSides.toSide;
        const p1 = getNodeAnchorPoint(fromNode, fromSide);
        const p2 = getNodeAnchorPoint(toNode, toSide);
        const edgeObstacles = obstacles.filter(
          (o) => o.id !== edge.fromNode && o.id !== edge.toNode
        );
        // Place label exactly at geometric midpoint — the connection line passes THROUGH the label center
        const rawMid = computeEdgeMidpoint(
          p1,
          fromSide,
          p2,
          toSide,
          edge.gridPath ? "straight" : edge.style,
          edge.stepOffset,
          getEdgeRing(edge),
          edgeObstacles
        );

        const isSelected = selectedEdgeIds.has(edge.id);
        const effectiveColorKey = getEffectiveEdgeColorKey(edge, edges, nodes, colorMap);
        const edgeColor =
          effectiveColorKey && CANVAS_COLOR_PALETTES[effectiveColorKey]
            ? CANVAS_COLOR_PALETTES[effectiveColorKey].stroke
            : effectiveColorKey?.startsWith("#")
            ? effectiveColorKey
            : colors.edgeColor;

        const shape = edge.labelShape || "pill";
        const badgeBg = isDark ? "rgba(30, 41, 59, 0.98)" : "rgba(255, 255, 255, 0.98)";
        const badgeBorder = isSelected ? "#f59e0b" : edgeColor;
        const badgeColor = isSelected ? "#f59e0b" : colors.edgeLabelText;

        const isEdgeConnectedToCurrentSlide =
          presentation.active &&
          (edge.fromNode === presentation.sequence[presentation.index] ||
            edge.toNode === presentation.sequence[presentation.index]);
        const labelOpacity = presentation.active
          ? isEdgeConnectedToCurrentSlide
            ? 1
            : 0.1
          : 1;
        const labelFilter = presentation.active
          ? isEdgeConnectedToCurrentSlide
            ? "none"
            : "blur(2.2px)"
          : undefined;

        return (
          <div
            key={`edge-label-${edge.id}`}
            className={`canvas-edge-label-badge shape-${shape}`}
            style={{
              position: "absolute",
              left: rawMid.x,
              top: rawMid.y,
              transform: "translate(-50%, -50%)",
              zIndex: isSelected || isEditing ? 35 : 25,
              opacity: labelOpacity,
              filter: labelFilter,
              transition:
                "opacity 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), filter 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)",
              pointerEvents: "all",
              userSelect: "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                const next = new Set(selectedEdgeIds);
                if (next.has(edge.id)) next.delete(edge.id);
                else next.add(edge.id);
                onSelectionChange(next);
              } else {
                onSelectionChange(new Set([edge.id]));
                onClearNodeSelection();
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEditing(edge.id);
            }}
            onContextMenu={(e) => onContextMenu(e, edge)}
          >
            {isEditing ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: colors.cardBg,
                  border: "2px solid #f59e0b",
                  borderRadius: shape === "pill" ? 16 : shape === "rect" ? 6 : 10,
                  padding: "2px 8px",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editingLabel}
                  onChange={(e) => onEditingLabelChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveLabel();
                    if (e.key === "Escape") onStopEditing();
                  }}
                  onBlur={onSaveLabel}
                  autoFocus
                  placeholder="关系标签..."
                  style={{
                    width: 110,
                    border: "none",
                    background: "transparent",
                    color: colors.cardText,
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <button
                  onClick={onSaveLabel}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#10b981",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Check size={13} />
                </button>
              </div>
            ) : shape === "diamond" ? (
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "5px 18px",
                  color: badgeColor,
                  fontSize: 11.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  filter: isSelected
                    ? "drop-shadow(0 3px 10px rgba(245, 158, 11, 0.45))"
                    : "drop-shadow(0 2px 6px rgba(0,0,0,0.14))",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="双击编辑关系说明 (右键呼出关系菜单)"
              >
                <svg
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    overflow: "visible",
                    pointerEvents: "none",
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polygon
                    points="50,1.5 98.5,50 50,98.5 1.5,50"
                    vectorEffect="non-scaling-stroke"
                    fill={badgeBg}
                    stroke={badgeBorder}
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ position: "relative", zIndex: 1 }}>{edge.label}</span>
              </div>
            ) : (
              <div
                style={{
                  padding: shape === "rect" ? "3px 9px" : "3px 12px",
                  borderRadius: shape === "rect" ? 4 : 9999,
                  backgroundColor: badgeBg,
                  backdropFilter: "blur(6px)",
                  border: `1.5px solid ${badgeBorder}`,
                  color: badgeColor,
                  fontSize: 11.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  boxShadow: isSelected
                    ? "0 4px 12px rgba(245, 158, 11, 0.35)"
                    : "0 2px 8px rgba(0,0,0,0.12)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="双击编辑关系说明 (右键呼出关系菜单)"
              >
                {edge.label}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
});
