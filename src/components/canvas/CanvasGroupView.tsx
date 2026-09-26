import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import { Share2, Trash2 } from "lucide-react";
import type { CanvasGroupNode, CanvasNode, CanvasNodeSide } from "../../types/canvasTypes";
import { isNodeInsideGroup } from "../../services/canvasService";
import { getCanvasThemeColors } from "../../services/canvasTheme";
import type { ConnectingState } from "./useCanvasConnect";
// Shared per-node chrome helpers — one definition lives in CanvasNodeLayer so
// the group and card views cannot drift apart.
import { SIDES, getAnchorDotStyle, hexToRgbString, resizeHandleStyle } from "./CanvasNodeLayer";

/**
 * One group container on the board: the dashed hull, its title badge (with the
 * rename editor and the one-to-many source badge), the connection anchors and
 * the resize handle.
 *
 * Extracted verbatim from CanvasView's node map (wave 3 of the CanvasView
 * decomposition). This component is deliberately NOT memoised: its parent
 * re-renders on every pan/hover frame anyway, and an inline arrow prop would
 * silently defeat memo while still paying for the double render.
 */
type CanvasGroupViewProps = {
  node: CanvasGroupNode;
  isSelected: boolean;
  isHovered: boolean;
  isEditing: boolean;
  palette: { label: string; stroke: string; bg: string } | undefined;
  editable: boolean;
  colors: ReturnType<typeof getCanvasThemeColors>;
  isDark: boolean;
  isEink: boolean;
  isPresentationMode: boolean;
  presentationSequence: string[];
  currentSlideIndex: number;
  /** Slide lookup for the "contains the current slide" presentation context. */
  nodeMap: Map<string, CanvasNode>;
  /** Per-node outgoing edge info (the one-to-many source badge). */
  nodeOutgoingMap: Map<string, { count: number; color?: string; targets: string[] }>;
  selectedNodeIds: Set<string>;
  currentMultiRootNode: CanvasNode | undefined;
  connectingState: ConnectingState | null;
  /** Draft text of the group rename editor currently open ("" when none). */
  editingText: string;
  setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setEditingNodeId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string>>;
  /** Set once a press actually moves, so the click handler can ignore the click. */
  hasDraggedRef: RefObject<boolean>;
  handleNodeDragStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleNodeResizeStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleAnchorMouseDown: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleAnchorMouseUp: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleCardMouseUpForConnect: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleContextMenuNode: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleJumpToSlide: (index: number) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleSaveNodeEdit: () => void;
};

export function CanvasGroupView({
  node,
  isSelected,
  isHovered,
  isEditing,
  palette,
  editable,
  colors,
  isDark,
  isEink,
  isPresentationMode,
  presentationSequence,
  currentSlideIndex,
  nodeMap,
  nodeOutgoingMap,
  selectedNodeIds,
  currentMultiRootNode,
  connectingState,
  editingText,
  setHoveredNodeId,
  setSelectedNodeId,
  setSelectedEdgeId,
  setEditingNodeId,
  setEditingText,
  hasDraggedRef,
  handleNodeDragStart,
  handleNodeResizeStart,
  handleAnchorMouseDown,
  handleAnchorMouseUp,
  handleCardMouseUpForConnect,
  handleContextMenuNode,
  handleJumpToSlide,
  handleDeleteNode,
  handleSaveNodeEdit,
}: CanvasGroupViewProps) {
  const currentSlideNodeId = isPresentationMode ? presentationSequence[currentSlideIndex] : null;
  const currentSlideNode = currentSlideNodeId ? nodeMap.get(currentSlideNodeId) : null;
  const isCurrentGroupSlide = isPresentationMode && currentSlideNodeId === node.id;
  const isGroupContainingCurrentSlide =
    isPresentationMode && currentSlideNode ? isNodeInsideGroup(currentSlideNode, node) : false;

  const defaultGlowRgb = isDark ? "129, 140, 248" : isEink ? "30, 41, 59" : "99, 102, 241";
  const defaultRingColor = isDark ? "#818cf8" : isEink ? "#1e293b" : "#6366f1";
  const customGlowRgb = palette?.stroke ? hexToRgbString(palette.stroke) : null;
  const slideGlowRgb = customGlowRgb || defaultGlowRgb;
  const slideRingColor = palette?.stroke || defaultRingColor;

  const groupOpacity = isPresentationMode
    ? isCurrentGroupSlide
      ? 1
      : isGroupContainingCurrentSlide
        ? 0.88
        : 0.12
    : 1;

  const groupFilter = isPresentationMode
    ? isCurrentGroupSlide || isGroupContainingCurrentSlide
      ? "none"
      : "blur(3.5px)"
    : undefined;

  const groupTransform = isPresentationMode
    ? isCurrentGroupSlide
      ? "translateZ(0) scale(1.004)"
      : isGroupContainingCurrentSlide
        ? "translateZ(0)"
        : "translateZ(0) scale(0.99)"
    : undefined;

  const isGroupConnectingTarget =
    connectingState !== null && connectingState.fromNodeId !== node.id;
  const groupOutgoingInfo = nodeOutgoingMap.get(node.id);
  const isGroupOneToManySource = !!groupOutgoingInfo && groupOutgoingInfo.count >= 2;
  const isGroupMultiRoot = selectedNodeIds.size >= 2 && currentMultiRootNode?.id === node.id;
  return (
    <div
      className={`canvas-node canvas-group ${isSelected ? "selected" : ""} ${isGroupConnectingTarget ? "connecting-target" : ""} ${isCurrentGroupSlide ? "current-slide" : ""} ${isGroupContainingCurrentSlide ? "group-active-context" : ""}`}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: isCurrentGroupSlide ? 60 : isGroupContainingCurrentSlide ? 4 : 2,
        opacity: groupOpacity,
        filter: groupFilter,
        transform: groupTransform,
        borderRadius: 16,
        border: isCurrentGroupSlide
          ? isEink
            ? "2.5px solid #1e293b"
            : `2.5px solid ${slideRingColor}`
          : isGroupContainingCurrentSlide
            ? isEink
              ? "2px dashed #1e293b"
              : `2px solid rgba(${slideGlowRgb}, 0.5)`
            : isSelected
              ? "2px solid #f59e0b"
              : isGroupConnectingTarget && isHovered
                ? "2px solid #0284c7"
                : isGroupConnectingTarget
                  ? "2px dashed rgba(2, 132, 199, 0.7)"
                  : palette
                    ? `2px dashed ${palette.stroke}`
                    : `2px dashed ${colors.groupBorder}`,
        backgroundColor: palette ? palette.bg : colors.groupBg,
        boxShadow: isCurrentGroupSlide
          ? isEink
            ? "0 0 0 4px rgba(30, 41, 59, 0.3), 0 12px 36px rgba(0, 0, 0, 0.2)"
            : `0 0 0 1.5px rgba(255, 255, 255, ${isDark ? "0.2" : "0.5"}), 0 0 0 4px rgba(${slideGlowRgb}, 0.38), 0 12px 36px rgba(${slideGlowRgb}, ${isDark ? "0.32" : "0.22"}), 0 24px 60px rgba(0, 0, 0, ${isDark ? "0.65" : "0.22"})`
          : isGroupContainingCurrentSlide
            ? isEink
              ? "0 0 16px rgba(0,0,0,0.08)"
              : `0 0 28px rgba(${slideGlowRgb}, 0.16)`
            : isSelected
              ? "0 0 16px rgba(245,158,11,0.3)"
              : isGroupConnectingTarget && isHovered
                ? "0 0 0 3px rgba(2, 132, 199, 0.4), 0 0 16px rgba(2, 132, 199, 0.3)"
                : undefined,
        display: "flex",
        flexDirection: "column",
        cursor: isPresentationMode ? "pointer" : isGroupConnectingTarget ? "crosshair" : "move",
        transition:
          "opacity 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), filter 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), border-color 0.2s ease, box-shadow 0.25s ease",
        ...((isCurrentGroupSlide
          ? {
              "--slide-glow-rgb": slideGlowRgb,
              "--slide-ring-color": slideRingColor,
              "--slide-elevation-alpha": isDark ? "0.55" : "0.15",
            }
          : {}) as CSSProperties),
      }}
      onMouseEnter={() => setHoveredNodeId(node.id)}
      onMouseLeave={() => setHoveredNodeId((prev) => (prev === node.id ? null : prev))}
      onMouseDown={(e) => handleNodeDragStart(e, node)}
      onMouseUp={(e) => {
        if (connectingState && connectingState.fromNodeId !== node.id) {
          handleCardMouseUpForConnect(e, node);
        }
      }}
      onContextMenu={(e) => handleContextMenuNode(e, node)}
      onClick={(e) => {
        e.stopPropagation();
        if (isPresentationMode) {
          const idx = presentationSequence.indexOf(node.id);
          if (idx !== -1) {
            handleJumpToSlide(idx);
          }
          return;
        }
        if (e.shiftKey || e.ctrlKey || e.metaKey || hasDraggedRef.current) return;
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
      }}
    >
      {/* Multi-select One-to-Many Root indicator on Group */}
      {isGroupMultiRoot && (
        <div
          style={{
            position: "absolute",
            top: -28,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#10b981",
            color: "#ffffff",
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 10px",
            borderRadius: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 10px rgba(16, 185, 129, 0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Share2 size={11} />
          <span>一对多发起源</span>
        </div>
      )}

      {/* Drop-to-connect visual badge on group */}
      {isGroupConnectingTarget && isHovered && (
        <div
          style={{
            position: "absolute",
            top: -24,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#0284c7",
            color: "#ffffff",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            zIndex: 100,
          }}
        >
          松开以建立与此分组的关联
        </div>
      )}

      {/* Group Title Badge */}
      <div
        className="canvas-group-header"
        style={{
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: palette ? palette.stroke : colors.edgeColor,
          color: "#ffffff",
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          cursor: isPresentationMode ? "pointer" : "grab",
        }}
        onMouseDown={(e) => handleNodeDragStart(e, node)}
      >
        {isEditing ? (
          <input
            type="text"
            aria-label="编辑分组标题"
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveNodeEdit();
              if (e.key === "Escape") setEditingNodeId(null);
            }}
            onBlur={handleSaveNodeEdit}
            autoFocus
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "none",
              color: "#ffffff",
              borderRadius: 4,
              padding: "2px 6px",
              flex: 1,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (isPresentationMode) return;
                setEditingNodeId(node.id);
                setEditingText(node.label || "");
              }}
              title={isPresentationMode ? node.label || "分组" : "双击重命名 | 拖动移动分组"}
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              📁 {node.label || "未命名分组"}
            </span>
            {isGroupOneToManySource && (
              <span
                title={`该分组容器是一对多发起源，向外辐射连接了 ${groupOutgoingInfo.count} 项`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  padding: "1px 6px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                <Share2 size={10} />
                <span>{groupOutgoingInfo.count} 分支</span>
              </span>
            )}
          </div>
        )}
        {isSelected && editable && !isPresentationMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteNode(node.id);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
              }}
              title="删除分组"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 4 Connection Anchors on Group Container */}
      {editable &&
        !isPresentationMode &&
        (isSelected || isHovered || connectingState !== null) &&
        SIDES.map((side) => {
          const dotStyle = getAnchorDotStyle(side, colors);
          return (
            <div
              key={side}
              className="canvas-anchor-dot"
              style={{
                ...dotStyle,
                zIndex: 30,
              }}
              onMouseDown={(e) => handleAnchorMouseDown(e, node.id, side)}
              onMouseUp={(e) => handleAnchorMouseUp(e, node.id, side)}
              title={`从分组 ${side} 边缘拉出连线`}
            />
          );
        })}

      {/* Resize Handle */}
      {isSelected && editable && !isPresentationMode && (
        <div
          style={resizeHandleStyle}
          onMouseDown={(e) => handleNodeResizeStart(e, node)}
          title="拖拽拉伸分组尺寸"
        />
      )}
    </div>
  );
}
