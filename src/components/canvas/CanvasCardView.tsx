import { memo } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import {
  Check,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link,
  Music,
  Share2,
  Trash2,
  Video,
} from "lucide-react";
import type {
  CanvasFileNode,
  CanvasLinkNode,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
} from "../../types/canvasTypes";
import {
  CANVAS_COLOR_PALETTES,
  CANVAS_STANDARD_COLOR_IDS,
  getMediaFileType,
  resolveMediaSrc,
} from "../../services/canvasService";
import { renderCardMarkdown } from "../../services/markdown";
import { getCanvasThemeColors } from "../../services/canvasTheme";
import type { CanvasCardSuggestItem } from "./CanvasCardSuggestMenu";
import type { ConnectingState } from "./useCanvasConnect";
// Shared per-node chrome helpers — one definition lives in CanvasNodeLayer so
// the group and card views cannot drift apart.
import { SIDES, getAnchorDotStyle, hexToRgbString, resizeHandleStyle } from "./CanvasNodeLayer";

/** The suggestion popup state shared by the card editor and CanvasView. */
export type CanvasCardSuggestState = {
  /** Which list is open. */
  kind: "note" | "command";
  /** What has been typed after the trigger, lower-cased. */
  query: string;
  /** Where the trigger (`/` or `[[`) begins, in the textarea's value. */
  startIndex: number;
  selectedIndex: number;
  items: CanvasCardSuggestItem[];
  /** Where to draw the popup, in screen pixels. */
  x: number;
  y: number;
};

/**
 * A text card's body: the rendered Markdown, with its checkboxes and links live.
 *
 * Memoised on the text alone, and deliberately so. The canvas re-renders on
 * hover, on selection, on every pan frame — and React rewrites
 * `dangerouslySetInnerHTML` on each of those, which throws away every node
 * inside, including a checkbox that is mid-click. Keeping this subtree out of
 * the parent's render path is what makes "press on the box, release on the box"
 * survive as one click; the drag guard in `handleNodeDragStart` is the other
 * half, because it stops the mouseup that used to force such a re-render.
 */
const CanvasCardMarkdown = memo(function CanvasCardMarkdown({
  text,
  nodeId,
  onActivate,
}: {
  text: string;
  nodeId: string;
  onActivate: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="canvas-card-markdown"
      data-node-id={nodeId}
      onClick={onActivate}
      dangerouslySetInnerHTML={{ __html: renderCardMarkdown(text) }}
    />
  );
});

function cardHeaderBtnStyle(_colors: ReturnType<typeof getCanvasThemeColors>): CSSProperties {
  return {
    background: "none",
    border: "none",
    // No explicit colour: inherit from the header band, which flips to white
    // when a solid palette colour sits behind it.
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
  };
}

/**
 * One normal card on the board (text, file/media or link): the header drag
 * handle, the floating action menu of a single selection, the body (textarea
 * while editing, rendered Markdown, media or link), the connection anchors and
 * the resize handle.
 *
 * Extracted verbatim from CanvasView's node map (wave 3 of the CanvasView
 * decomposition). This component is deliberately NOT memoised: its parent
 * re-renders on every pan/hover frame anyway, and an inline arrow prop would
 * silently defeat memo while still paying for the double render. The memoised
 * `CanvasCardMarkdown` above keeps the rendered Markdown subtree out of this
 * render path — do not inline it back.
 */
type CanvasCardViewProps = {
  node: CanvasTextNode | CanvasFileNode | CanvasLinkNode;
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
  selectedNodeIds: Set<string>;
  currentMultiRootNode: CanvasNode | undefined;
  /** Per-node outgoing edge info (the one-to-many source badge). */
  nodeOutgoingMap: Map<string, { count: number; color?: string; targets: string[] }>;
  sourceDisplayColorMap: Map<string, string>;
  connectingState: ConnectingState | null;
  /** Draft text of the card editor currently open ("" when none). */
  editingText: string;
  setEditingNodeId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string>>;
  cardSuggest: CanvasCardSuggestState | null;
  setCardSuggest: Dispatch<SetStateAction<CanvasCardSuggestState | null>>;
  cardEditorRef: RefObject<HTMLTextAreaElement | null>;
  /** Set once a press actually moves, so the click handler can ignore the click. */
  hasDraggedRef: RefObject<boolean>;
  currentFilePath: string | undefined;
  onOpenFile: ((filePath: string) => void) | undefined;
  setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  handleNodeDragStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleNodeResizeStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleAnchorMouseDown: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleAnchorMouseUp: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleCardMouseUpForConnect: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleContextMenuNode: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleJumpToSlide: (index: number) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDuplicateNode: (nodeId: string) => void;
  handleNodeColorChange: (nodeId: string, color: string) => void;
  handleSaveNodeEdit: () => void;
  handleSave: () => void;
  handleCardEditorChange: (e: ReactChangeEvent<HTMLTextAreaElement>) => void;
  moveCardSuggest: (delta: number) => void;
  pickCardSuggest: (index: number) => void;
  handleCardBodyActivate: (event: ReactMouseEvent<HTMLDivElement>) => void;
  openMediaPreview: (node: CanvasFileNode) => void;
};

export function CanvasCardView({
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
  selectedNodeIds,
  currentMultiRootNode,
  nodeOutgoingMap,
  sourceDisplayColorMap,
  connectingState,
  editingText,
  setEditingNodeId,
  setEditingText,
  cardSuggest,
  setCardSuggest,
  cardEditorRef,
  hasDraggedRef,
  currentFilePath,
  onOpenFile,
  setHoveredNodeId,
  setSelectedNodeId,
  setSelectedEdgeId,
  handleNodeDragStart,
  handleNodeResizeStart,
  handleAnchorMouseDown,
  handleAnchorMouseUp,
  handleCardMouseUpForConnect,
  handleContextMenuNode,
  handleJumpToSlide,
  handleDeleteNode,
  handleDuplicateNode,
  handleNodeColorChange,
  handleSaveNodeEdit,
  handleSave,
  handleCardEditorChange,
  moveCardSuggest,
  pickCardSuggest,
  handleCardBodyActivate,
  openMediaPreview,
}: CanvasCardViewProps) {
  // 青色族走 CSS 令牌（阶段 C1）：这些样式都渲染在主题 DOM 里，var() 直接跟随。
  const accentInfo = "var(--accent-info)";
  const accentSoft = "rgba(var(--accent-info-rgb), 0.6)";
  const isConnectingTarget = connectingState !== null && connectingState.fromNodeId !== node.id;
  const outgoingInfo = nodeOutgoingMap.get(node.id);
  const isOneToManySource = !!outgoingInfo && outgoingInfo.count >= 2;
  const effectiveSourceColor = sourceDisplayColorMap.get(node.id) || outgoingInfo?.color;
  const sourceColorPalette =
    effectiveSourceColor && CANVAS_COLOR_PALETTES[effectiveSourceColor]
      ? CANVAS_COLOR_PALETTES[effectiveSourceColor]
      : undefined;
  const isCurrentSlide = isPresentationMode && presentationSequence[currentSlideIndex] === node.id;
  const isMultiRoot = selectedNodeIds.size >= 2 && currentMultiRootNode?.id === node.id;

  const defaultGlowRgb = isDark ? "129, 140, 248" : isEink ? "30, 41, 59" : "99, 102, 241";
  const defaultRingColor = isDark ? "#818cf8" : isEink ? "#1e293b" : "#6366f1";
  const customGlowRgb = palette?.stroke ? hexToRgbString(palette.stroke) : null;
  const slideGlowRgb = customGlowRgb || defaultGlowRgb;
  const slideRingColor = palette?.stroke || defaultRingColor;

  const cardOpacity = isPresentationMode ? (isCurrentSlide ? 1 : 0.18) : 1;
  const cardFilter = isPresentationMode ? (isCurrentSlide ? "none" : "blur(3.5px)") : undefined;
  const cardTransform = isPresentationMode
    ? isCurrentSlide
      ? "translateZ(0) scale(1.008)"
      : "translateZ(0) scale(0.985)"
    : undefined;

  return (
    <div
      className={`canvas-node card-${node.type} ${isSelected ? "selected" : ""} ${isConnectingTarget ? "connecting-target" : ""} ${isCurrentSlide ? "current-slide" : ""}`}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: isCurrentSlide ? 60 : 10,
        borderRadius: 12,
        backgroundColor: colors.cardBg,
        opacity: cardOpacity,
        filter: cardFilter,
        transform: cardTransform,
        border: isCurrentSlide
          ? isEink
            ? "2.5px solid #1e293b"
            : `2.5px solid ${slideRingColor}`
          : isSelected
            ? "2px solid #f59e0b"
            : isConnectingTarget && isHovered
              ? `2px solid ${accentInfo}`
              : isConnectingTarget
                ? `2px dashed ${accentSoft}`
                : isOneToManySource && sourceColorPalette
                  ? `2px solid ${sourceColorPalette.stroke}`
                  : palette
                    ? `2px solid ${palette.stroke}`
                    : `1px solid ${colors.cardBorder}`,
        boxShadow: isCurrentSlide
          ? isEink
            ? "0 0 0 4px rgba(30, 41, 59, 0.35), 0 16px 40px rgba(0, 0, 0, 0.25)"
            : `0 0 0 1.5px rgba(255, 255, 255, ${isDark ? "0.2" : "0.5"}), 0 0 0 4px rgba(${slideGlowRgb}, 0.38), 0 12px 36px rgba(${slideGlowRgb}, ${isDark ? "0.32" : "0.22"}), 0 24px 60px rgba(0, 0, 0, ${isDark ? "0.65" : "0.22"})`
          : isSelected
            ? "0 12px 36px rgba(245,158,11,0.35)"
            : isConnectingTarget && isHovered
              ? "0 0 0 3px rgba(var(--accent-info-rgb), 0.4), 0 12px 36px rgba(var(--accent-info-rgb), 0.35)"
              : isOneToManySource && sourceColorPalette
                ? `0 0 0 1px ${sourceColorPalette.stroke}88, 0 8px 24px ${sourceColorPalette.stroke}22`
                : colors.cardShadow,
        display: "flex",
        flexDirection: "column",
        color: colors.cardText,
        cursor: isPresentationMode
          ? "pointer"
          : isConnectingTarget
            ? "crosshair"
            : isEditing
              ? "text"
              : "move",
        transition:
          "border-color 0.2s ease, box-shadow 0.25s ease, opacity 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), filter 0.4s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)",
        ...((isCurrentSlide
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
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isPresentationMode) return;
        if (editable && node.type === "text") {
          setEditingNodeId(node.id);
          setEditingText(node.text);
        }
      }}
    >
      {/* Multi-select One-to-Many Root indicator on Card */}
      {isMultiRoot && (
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
      {/* Drop-to-connect visual badge */}
      {isConnectingTarget && isHovered && (
        <div
          style={{
            position: "absolute",
            top: -24,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: accentInfo,
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
          松开以建立关联
        </div>
      )}
      {/* Floating Action Menu for Selected Card */}
      {isSelected && editable && selectedNodeIds.size === 1 && (
        <div
          className="canvas-card-floating-actions"
          style={{
            position: "absolute",
            top: -38,
            left: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: 8,
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.cardBorder}`,
            boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
            zIndex: 50,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color Palette Dots — the compact card toolbar keeps to the
              six standard colours; the batch pickers (and the
              right-click menus) offer the full extended set. */}
          {CANVAS_STANDARD_COLOR_IDS.map((key) => {
            const col = CANVAS_COLOR_PALETTES[key];
            return (
              <div
                key={key}
                onClick={() => handleNodeColorChange(node.id, key)}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  backgroundColor: col.stroke,
                  cursor: "pointer",
                  border: node.color === key ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.2)",
                  transition: "transform 0.1s ease",
                }}
                title={col.label}
              />
            );
          })}
          <div style={{ width: 1, height: 14, background: colors.cardBorder, margin: "0 2px" }} />
          {node.type === "text" && (
            <button
              onClick={() => {
                setEditingNodeId(node.id);
                setEditingText(node.text);
              }}
              title="编辑卡片 (Enter)"
              style={cardHeaderBtnStyle(colors)}
            >
              <Edit2 size={13} />
            </button>
          )}
          <button
            onClick={() => handleDuplicateNode(node.id)}
            title="复制副本 (Ctrl+D)"
            style={cardHeaderBtnStyle(colors)}
          >
            <Copy size={13} />
          </button>
          <button
            onClick={() => handleDeleteNode(node.id)}
            title="删除卡片 (Delete)"
            style={{ ...cardHeaderBtnStyle(colors), color: "#f43f5e" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* Card Header (Drag Handle) */}
      <div
        className="canvas-card-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: `1px solid ${colors.cardHeaderBorder}`,
          // The header band takes the swatch colour itself — exactly the
          // colour the user picked, not a washed-out tint of it. Text
          // flips to white so it stays readable on the solid band.
          background: palette ? palette.stroke : colors.cardHeaderBg,
          color: palette ? "#ffffff" : colors.cardHeaderText,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          cursor: "move",
        }}
        onMouseDown={(e) => handleNodeDragStart(e, node)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isEditing ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#f59e0b",
                background: "rgba(245, 158, 11, 0.15)",
                padding: "1px 6px",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Edit2 size={11} /> 编辑中
            </span>
          ) : (
            <>
              {node.type === "file" &&
                (() => {
                  const mType = getMediaFileType(node.file);
                  if (mType === "image") return <ImageIcon size={13} color="var(--accent-info)" />;
                  if (mType === "audio") return <Music size={13} color="#a855f7" />;
                  if (mType === "video") return <Video size={13} color="#ef4444" />;
                  return <FileText size={13} color="#10b981" />;
                })()}
              {node.type === "text" && <Edit2 size={13} color={colors.edgeColor} />}
              {node.type === "link" && <Link size={13} color="#a855f7" />}
              <span style={{ fontSize: 11, fontWeight: 600 }}>
                {node.type === "file"
                  ? node.file.startsWith("data:")
                    ? "嵌入图片"
                    : node.file.length > 28
                      ? "..." + node.file.slice(-24)
                      : node.file
                  : node.type === "text"
                    ? "便签卡片"
                    : "外部参考"}
              </span>
              {isOneToManySource && (
                <span
                  title={`该卡片是一对多发起源，向外辐射连接了 ${outgoingInfo.count} 张卡片`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 8,
                    backgroundColor: sourceColorPalette
                      ? sourceColorPalette.bg
                      : "rgba(16, 185, 129, 0.15)",
                    color: sourceColorPalette ? sourceColorPalette.stroke : "#10b981",
                    border: `1px solid ${sourceColorPalette ? sourceColorPalette.stroke : "#10b981"}`,
                    marginLeft: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  🌱 发起源 · {outgoingInfo.count}
                </span>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {isEditing ? (
            <button
              className="card-header-btn"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleSaveNodeEdit();
              }}
              title="完成编辑 (Ctrl+Enter)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "#10b981",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Check size={12} />
              <span>完成</span>
            </button>
          ) : (
            <>
              {node.type === "file" && onOpenFile && !node.file.startsWith("data:") && (
                <button
                  className="card-header-btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFile(node.file);
                  }}
                  title="在工作区打开对应文件"
                  style={cardHeaderBtnStyle(colors)}
                >
                  <ExternalLink size={12} />
                </button>
              )}
              {isSelected && editable && (
                <button
                  className="card-header-btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNode(node.id);
                  }}
                  title="删除卡片"
                  style={{ ...cardHeaderBtnStyle(colors), color: "#f43f5e" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div
        style={{
          flex: 1,
          padding: "8px 12px",
          overflowY: "auto",
          fontSize: 13,
          lineHeight: 1.6,
          color: colors.cardText,
        }}
      >
        {isEditing ? (
          <textarea
            ref={cardEditorRef}
            value={editingText}
            onChange={handleCardEditorChange}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // The suggestion popup owns the keys while it is open.
              if (cardSuggest && cardSuggest.items.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveCardSuggest(1);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  moveCardSuggest(-1);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickCardSuggest(cardSuggest.selectedIndex);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setCardSuggest(null);
                  return;
                }
              }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                handleSave();
                return;
              }
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                handleSaveNodeEdit();
                return;
              }
              if (e.key === "Escape") setEditingNodeId(null);
            }}
            onBlur={() => {
              // A click on a suggestion is a mousedown, so the popup has
              // already acted by the time the textarea loses focus.
              setCardSuggest(null);
              handleSaveNodeEdit();
            }}
            autoFocus
            placeholder="输入 Markdown 内容（支持标题、清单、加粗、代码块）；键入 / 打开命令，键入 [[ 引用其他笔记"
            style={{
              width: "100%",
              height: "100%",
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: colors.cardText,
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 13,
              lineHeight: 1.6,
              userSelect: "text",
              cursor: "text",
            }}
          />
        ) : node.type === "text" ? (
          <CanvasCardMarkdown
            text={node.text}
            nodeId={node.id}
            onActivate={handleCardBodyActivate}
          />
        ) : node.type === "file" ? (
          (() => {
            const mType = getMediaFileType(node.file);
            if (mType === "image") {
              return (
                <div
                  onDoubleClick={() => openMediaPreview(node)}
                  title="双击全屏预览"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderRadius: 6,
                    backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.04)",
                    cursor: "zoom-in",
                  }}
                >
                  <img
                    src={resolveMediaSrc(node.file, currentFilePath)}
                    alt="canvas image"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: 4,
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              );
            }
            if (mType === "video") {
              return (
                <div
                  onDoubleClick={() => openMediaPreview(node)}
                  title="双击全屏预览"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: "#000000",
                    cursor: "zoom-in",
                  }}
                >
                  <video
                    src={resolveMediaSrc(node.file, currentFilePath)}
                    controls
                    style={{ maxWidth: "100%", maxHeight: "100%" }}
                  />
                </div>
              );
            }
            if (mType === "audio") {
              return (
                <div
                  onDoubleClick={() => openMediaPreview(node)}
                  title="双击全屏预览"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 10,
                    cursor: "zoom-in",
                  }}
                >
                  <Music size={28} color="#a855f7" />
                  <audio
                    src={resolveMediaSrc(node.file, currentFilePath)}
                    controls
                    style={{ width: "95%" }}
                  />
                </div>
              );
            }
            return (
              <div style={{ opacity: 0.9, fontSize: 12 }}>
                <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: colors.cardText }}>
                  {node.file}
                </p>
                <p style={{ margin: 0, opacity: 0.7, fontSize: 11.5 }}>
                  库内文档卡片。点击右上角图标可在主阅读区全屏打开。
                </p>
              </div>
            );
          })()
        ) : (
          <a
            href={node.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.edgeColor, textDecoration: "underline" }}
          >
            {node.url}
          </a>
        )}
      </div>

      {/* 4 Connection Anchors (Only shown on Hover / Select / Connecting) */}
      {editable &&
        !isPresentationMode &&
        (isSelected || isHovered || connectingState !== null) &&
        SIDES.map((side) => {
          const style = getAnchorDotStyle(side, colors);
          return (
            <div
              key={side}
              className="canvas-anchor-dot"
              style={style}
              onMouseDown={(e) => handleAnchorMouseDown(e, node.id, side)}
              onMouseUp={(e) => handleAnchorMouseUp(e, node.id, side)}
              title={`从 ${side} 边缘拉出连线`}
            />
          );
        })}

      {/* Resize Handle */}
      {isSelected && editable && !isPresentationMode && (
        <div
          style={resizeHandleStyle}
          onMouseDown={(e) => handleNodeResizeStart(e, node)}
          title="拖拽拉伸卡片尺寸"
        />
      )}
    </div>
  );
}
