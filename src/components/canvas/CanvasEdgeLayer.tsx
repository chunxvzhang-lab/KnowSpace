import { memo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeSide,
  CanvasObstacle,
} from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import {
  CANVAS_COLOR_PALETTES,
  computeEdgePath,
  getEffectiveEdgeColorKey,
  getNodeAnchorPoint,
  getOptimalAnchorSides,
  getStepBendHandleInfo,
  projectPointOntoRing,
} from "../../services/canvasService";
import { getEdgeRing } from "./canvasEdgeUtils";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * The SVG layer that draws every connector, plus the selected-edge handles.
 *
 * Extracted from CanvasView (R2 batch B3) — see docs/CANVAS_SPLIT_DESIGN.md.
 *
 * This layer carries the widest prop surface in the split: it both renders the
 * paths and hosts the interactive affordances (anchor cycling, the step-bend
 * drag handle). State still belongs to the parent, so every mutation is
 * reported through a callback — the layer owns nothing but its geometry maths.
 *
 * It is deliberately painted below the card layers: even when a connector's
 * geometry crosses a card, the card and its text paint on top, so lines never
 * cover a title.
 */
type CanvasEdgeLayerProps = {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  nodeMap: Map<string, CanvasNode>;
  /** Obstacles for path routing; endpoints are filtered out per edge. */
  obstacles: CanvasObstacle[];

  selectedEdgeIds: Set<string>;
  hoveredNodeId: string | null;
  /** In-progress anchor drag, drawn as a dashed rubber line. */
  connecting: {
    fromNodeId: string;
    fromSide: CanvasNodeSide;
    currentX: number;
    currentY: number;
  } | null;
  editable: boolean;
  isDark: boolean;
  isEink: boolean;
  colorMap: Map<string, string>;
  colors: CanvasThemeColors;
  presentation: { active: boolean; sequence: string[]; index: number };

  /** Viewport culling, kept in the parent where the bounds are computed. */
  isInViewport: (edge: CanvasEdge, from: CanvasNode, to: CanvasNode) => boolean;

  onSelectEdge: (ids: Set<string>) => void;
  onClearNodeSelection: () => void;
  onStartEditingLabel: (edgeId: string) => void;
  onContextMenu: (event: ReactMouseEvent, edge: CanvasEdge) => void;
  onCycleAnchor: (edgeId: string, end: "fromSide" | "toSide") => void;
  onStepBendMouseDown: (
    event: ReactMouseEvent,
    edgeId: string,
    orientation: "horizontal" | "vertical",
    offset: number
  ) => void;
  onResetStepOffset: (edgeId: string) => void;
};

export const CanvasEdgeLayer = memo(function CanvasEdgeLayer({
  edges,
  nodes,
  nodeMap,
  obstacles,
  selectedEdgeIds,
  hoveredNodeId,
  connecting,
  editable,
  isDark,
  isEink,
  colorMap,
  colors,
  presentation,
  isInViewport,
  onSelectEdge,
  onClearNodeSelection,
  onStartEditingLabel,
  onContextMenu,
  onCycleAnchor,
  onStepBendMouseDown,
  onResetStepOffset,
}: CanvasEdgeLayerProps) {
  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <defs>
        <marker
          id="canvas-arrow-default"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill={colors.edgeColor} />
        </marker>
        <marker
          id="canvas-arrow-selected"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
        </marker>
        {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
          <marker
            key={key}
            id={`canvas-arrow-${key}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill={col.stroke} />
          </marker>
        ))}
        {Array.from(
          new Set(
            edges
              .map((e) => e.color)
              .filter((c): c is string => typeof c === "string" && c.startsWith("#"))
          )
        ).map((hex) => (
          <marker
            key={hex}
            id={`canvas-arrow-${hex.replace("#", "hex-")}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill={hex} />
          </marker>
        ))}
      </defs>

      {/* Render Existing Edges */}
      {edges.map((edge) => {
        const fromNode = nodeMap.get(edge.fromNode);
        const toNode = nodeMap.get(edge.toNode);
        if (!fromNode || !toNode) return null;
        if (!isInViewport(edge, fromNode, toNode)) return null;

        const optSides = getOptimalAnchorSides(fromNode, toNode);
        const fromSide = edge.fromSide || optSides.fromSide;
        const toSide = edge.toSide || optSides.toSide;
        const p1 = getNodeAnchorPoint(fromNode, fromSide);
        const p2 = getNodeAnchorPoint(toNode, toSide);
        // A rectangular grid layout connects its cards with straight
        // orthogonal segments so the loop reads as a rectangular frame;
        // any leftover arc metadata is ignored in that case.
        const ringArc = edge.gridPath ? undefined : getEdgeRing(edge);
        const effectiveStyle = edge.gridPath ? "straight" : edge.style;
        const edgeObstacles = obstacles.filter(
          (o) => o.id !== edge.fromNode && o.id !== edge.toNode
        );
        const pathData = computeEdgePath(
          p1,
          fromSide,
          p2,
          toSide,
          effectiveStyle,
          edge.stepOffset,
          ringArc,
          edgeObstacles
        );
        // On a ring the origin dot must sit on the circle, not on the raw
        // card anchor point.
        const originPoint = ringArc ? projectPointOntoRing(p1, ringArc) : p1;

        const isSelected = selectedEdgeIds.has(edge.id);
        const effectiveColorKey = getEffectiveEdgeColorKey(edge, edges, nodes, colorMap);
        const edgeColor =
          effectiveColorKey && CANVAS_COLOR_PALETTES[effectiveColorKey]
            ? CANVAS_COLOR_PALETTES[effectiveColorKey].stroke
            : effectiveColorKey?.startsWith("#")
            ? effectiveColorKey
            : colors.edgeColor;

        const getMarkerUrl = (col?: string, selected?: boolean) => {
          if (selected && !edge.color) return "url(#canvas-arrow-selected)";
          const activeCol = col || effectiveColorKey;
          if (!activeCol) return "url(#canvas-arrow-default)";
          if (CANVAS_COLOR_PALETTES[activeCol]) return `url(#canvas-arrow-${activeCol})`;
          if (activeCol.startsWith("#")) return `url(#canvas-arrow-${activeCol.replace("#", "hex-")})`;
          return "url(#canvas-arrow-default)";
        };

        const strokeDash =
          edge.strokePattern === "dashed"
            ? "7 4"
            : edge.strokePattern === "dotted"
            ? "2.5 4"
            : undefined;

        const isEdgeConnectedToCurrentSlide =
          presentation.active &&
          (edge.fromNode === presentation.sequence[presentation.index] ||
            edge.toNode === presentation.sequence[presentation.index]);
        const edgeOpacity = presentation.active
          ? isEdgeConnectedToCurrentSlide
            ? 1
            : 0.1
          : 1;
        const edgeFilter = presentation.active
          ? isEdgeConnectedToCurrentSlide
            ? isDark
              ? "drop-shadow(0 0 4px rgba(129, 140, 248, 0.6))"
              : isEink
              ? undefined
              : "drop-shadow(0 0 4px rgba(99, 102, 241, 0.5))"
            : "blur(1.8px)"
          : undefined;

        return (
          <g
            key={edge.id}
            style={{
              pointerEvents: "all",
              opacity: edgeOpacity,
              filter: edgeFilter,
              transition:
                "opacity 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), filter 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)",
            }}
            onContextMenu={(e) => onContextMenu(e, edge)}
          >
            {/* Thick invisible hit area */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  const next = new Set(selectedEdgeIds);
                  if (next.has(edge.id)) next.delete(edge.id);
                  else next.add(edge.id);
                  onSelectEdge(next);
                } else {
                  onSelectEdge(new Set([edge.id]));
                  onClearNodeSelection();
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartEditingLabel(edge.id);
              }}
            />
            {/* Selection Halo Glow */}
            {isSelected && (
              <path
                d={pathData}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={7}
                strokeOpacity={0.28}
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
            )}
            {/* Visual stroke */}
            <path
              d={pathData}
              fill="none"
              stroke={isSelected && !edge.color ? "#f59e0b" : edgeColor}
              strokeWidth={isSelected ? 2.5 : hoveredNodeId === edge.fromNode ? 2.8 : 2}
              strokeDasharray={strokeDash}
              markerStart={
                edge.fromEnd === "arrow" ? getMarkerUrl(effectiveColorKey, isSelected) : undefined
              }
              markerEnd={
                edge.toEnd === "arrow" ? getMarkerUrl(effectiveColorKey, isSelected) : undefined
              }
              style={{
                transition: "stroke 0.2s, stroke-width 0.2s, filter 0.2s",
                filter: isSelected
                  ? "drop-shadow(0 0 5px rgba(245,158,11,0.5))"
                  : hoveredNodeId === edge.fromNode
                  ? `drop-shadow(0 0 6px ${edgeColor})`
                  : undefined,
              }}
            />
            {/* Source Origin Anchor Dot (起点端点指示器: 明确发起源) */}
            {edge.fromEnd !== "arrow" && (
              <circle
                cx={originPoint.x}
                cy={originPoint.y}
                r={isSelected ? 4.5 : hoveredNodeId === edge.fromNode ? 4.2 : 3.8}
                fill={isSelected ? "#f59e0b" : edgeColor}
                stroke={isDark ? "#0f172a" : "#ffffff"}
                strokeWidth={1.4}
                style={{ pointerEvents: "none", transition: "r 0.15s ease" }}
              />
            )}
            {/* Interactive Endpoint Anchor Handles when Selected */}
            {isSelected && editable && (
              <g className="canvas-edge-anchor-handles">
                <circle
                  cx={p1.x}
                  cy={p1.y}
                  r={5}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCycleAnchor(edge.id, "fromSide");
                  }}
                >
                  <title>{`起点锚点: ${fromSide} (点击切换边)`}</title>
                </circle>
                <circle
                  cx={p2.x}
                  cy={p2.y}
                  r={5}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCycleAnchor(edge.id, "toSide");
                  }}
                >
                  <title>{`终点锚点: ${toSide} (点击切换边)`}</title>
                </circle>
              </g>
            )}
            {/* Interactive Step Bend Drag Handle when Selected */}
            {isSelected &&
              edge.style === "step" &&
              editable &&
              (() => {
                const bendInfo = getStepBendHandleInfo(p1, fromSide, p2, toSide, edge.stepOffset);
                const isHoriz = bendInfo.orientation === "horizontal";
                return (
                  <g
                    className="canvas-step-bend-handle"
                    style={{ cursor: isHoriz ? "ew-resize" : "ns-resize" }}
                    onMouseDown={(e) =>
                      onStepBendMouseDown(e, edge.id, bendInfo.orientation, edge.stepOffset || 0)
                    }
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onResetStepOffset(edge.id);
                    }}
                  >
                    <title>{`拖拽平移折线转折位置 (双击复位)`}</title>
                    <circle cx={bendInfo.x} cy={bendInfo.y} r={11} fill="transparent" />
                    <rect
                      x={bendInfo.x - (isHoriz ? 4 : 8)}
                      y={bendInfo.y - (isHoriz ? 8 : 4)}
                      width={isHoriz ? 8 : 16}
                      height={isHoriz ? 16 : 8}
                      rx={4}
                      fill="#ffffff"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      style={{
                        pointerEvents: "none",
                        filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))",
                      }}
                    />
                    <circle
                      cx={bendInfo.x}
                      cy={bendInfo.y}
                      r={1.5}
                      fill="#f59e0b"
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })()}
          </g>
        );
      })}

      {/* Active Connecting Dragging Line */}
      {connecting &&
        (() => {
          const fromNode = nodeMap.get(connecting.fromNodeId);
          const startPt = fromNode
            ? getNodeAnchorPoint(fromNode, connecting.fromSide)
            : { x: connecting.currentX, y: connecting.currentY };
          return (
            <path
              d={`M ${startPt.x} ${startPt.y} L ${connecting.currentX} ${connecting.currentY}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              markerEnd="url(#canvas-arrow-default)"
            />
          );
        })()}
    </svg>
  );
});
