import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  FileText,
  Boxes,
  RotateCcw,
  RotateCw,
  BookOpen,
  X,
  Link,
  Save,
  BoxSelect,
  ArrowUpToLine,
  ArrowDownToLine,
  GitBranch,
  AlignLeft,
  AlignRight,
  AlignJustify,
  Image as ImageIcon,
  Grid,
  Minimize2,
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Share2,
  Play,
  Scan,
} from "lucide-react";
import type { ThemeMode } from "../../core/types";
import type { CanvasData, CanvasNode, CanvasViewport } from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import {
  alignNodesInCircle,
  computeRingSpacingLayout,
  syncLoopEdgeGeometry,
  type CanvasAlignDirection,
} from "../../services/canvasService";
import type { RefObject } from "react";
import type { SpawnModalState } from "./useCanvasConnect";
import { toolBtnStyle } from "./canvasModalStyles";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * The floating top toolbar of the canvas.
 *
 * Extracted from CanvasView (wave 4 of the CanvasView decomposition). The
 * markup moved verbatim; every state and handler is threaded in as a prop
 * under the name the markup already used.
 *
 * The align menu's open flag (`showAlignMenu`) is deliberately NOT local here:
 * CanvasView's context-menu keydown handler also closes it on Escape while a
 * context menu is open, so the state (and its outside-click / auto-close
 * effects) stay in the parent and are threaded down. The ring-radius slider
 * draft and its live ring metrics, by contrast, are read by nothing outside
 * this toolbar, so they moved in with the slider.
 */
type CanvasToolbarProps = {
  theme: ThemeMode;
  colors: CanvasThemeColors;
  isDark: boolean;
  isEink: boolean;
  /** The container is narrower than 860px — the title truncates sooner. */
  isNarrow: boolean;
  title: string;

  onSave?: () => void;
  isDirty: boolean;
  isSaving: boolean;
  handleSave: () => void;
  editable: boolean;

  handleAddTextCard: (atX?: number, atY?: number) => void;
  handleTriggerInsertMedia: () => void;
  setShowFilePicker: (show: boolean) => void;
  handleAddGroup: (atX?: number, atY?: number) => void;

  isBoxSelectMode: boolean;
  setIsBoxSelectMode: Dispatch<SetStateAction<boolean>>;

  selectedNodeIds: Set<string>;
  currentMultiRootNode: CanvasNode | undefined;
  currentMultiRootTitle: string;
  handleConnectOneToMany: (specifiedRootId?: string) => void;
  handleConnectSelectedNodes: () => void;
  handleConnectLoopNodes: () => void;

  showAlignMenu: boolean;
  setShowAlignMenu: Dispatch<SetStateAction<boolean>>;
  handleAlignSelected: (direction: CanvasAlignDirection) => void;

  /** Board nodes, read by the ring-slider metrics for the selected cards. */
  nodes: CanvasNode[];
  latestDataRef: RefObject<CanvasData>;
  setData: Dispatch<SetStateAction<CanvasData>>;
  pushHistory: (newData: CanvasData) => void;

  handleSpawnConnectedChild: (sourceNodeId: string, direction?: "right" | "bottom") => void;
  setSpawnModalState: Dispatch<SetStateAction<SpawnModalState | null>>;

  history: { past: CanvasData[]; future: CanvasData[] };
  handleUndo: () => void;
  handleRedo: () => void;

  handleOpenExtractModal: () => void;
  setShowExportModal: (show: boolean) => void;

  isPresentationMode: boolean;
  handleTogglePresentation: () => void;

  handleZoom: (deltaZoom: number, clientX?: number, clientY?: number) => void;
  viewport: CanvasViewport;
  setViewport: Dispatch<SetStateAction<CanvasViewport>>;
  handleZoomToFit: () => void;

  isFullscreenActive: boolean;
  handleToggleFullscreen: () => void;

  onClose?: () => void;
};

export function CanvasToolbar({
  theme,
  colors,
  isDark,
  isEink,
  isNarrow,
  title,
  onSave,
  isDirty,
  isSaving,
  handleSave,
  editable,
  handleAddTextCard,
  handleTriggerInsertMedia,
  setShowFilePicker,
  handleAddGroup,
  isBoxSelectMode,
  setIsBoxSelectMode,
  selectedNodeIds,
  currentMultiRootNode,
  currentMultiRootTitle,
  handleConnectOneToMany,
  handleConnectSelectedNodes,
  handleConnectLoopNodes,
  showAlignMenu,
  setShowAlignMenu,
  handleAlignSelected,
  nodes,
  latestDataRef,
  setData,
  pushHistory,
  handleSpawnConnectedChild,
  setSpawnModalState,
  history,
  handleUndo,
  handleRedo,
  handleOpenExtractModal,
  setShowExportModal,
  isPresentationMode,
  handleTogglePresentation,
  handleZoom,
  viewport,
  setViewport,
  handleZoomToFit,
  isFullscreenActive,
  handleToggleFullscreen,
  onClose,
}: CanvasToolbarProps) {
  // ── Ring spacing controls (toolbar-local) ────────────────────────────────
  // Live metrics for the alignment dropdown's radius slider. Only meaningful
  // while three or more selected cards actually sit on a common circle.
  const selectedRingInfo = useMemo(() => {
    if (selectedNodeIds.size < 3) return null;
    const cards = nodes.filter((n) => selectedNodeIds.has(n.id) && n.type !== "group");
    if (cards.length < 3) return null;
    const layout = computeRingSpacingLayout(cards);
    if (!layout) return null;
    return {
      layout,
      // Generous upper bound so the slider has usable travel without letting
      // the ring fly off the board.
      maxRadius: Math.max(layout.radius * 3, layout.minRadius * 4, 1200),
    };
  }, [selectedNodeIds, nodes]);

  // Non-null while the ring radius slider is being dragged; holds the radius
  // being previewed so the label and the board stay in step.
  const [ringRadiusDraft, setRingRadiusDraft] = useState<number | null>(null);

  // Frozen snapshot taken when a slider drag begins. Re-deriving the ring every
  // frame would let the seating order and start angle drift, making the cards
  // visibly jitter while the handle moves.
  const ringSliderSnapshotRef = useRef<typeof selectedRingInfo>(null);

  const applyRingRadius = useCallback(
    (radius: number, info: NonNullable<typeof selectedRingInfo>) => {
      const current = latestDataRef.current;
      const nextNodes = alignNodesInCircle(current.nodes, new Set(info.layout.orderedIds), {
        radius,
        startAngleDeg: info.layout.startAngleDeg,
        orderedIds: info.layout.orderedIds,
        clampToMinRadius: true,
        // Pin the centre so the ring grows in place rather than drifting.
        center: info.layout.center,
      });
      const nextData = {
        ...current,
        nodes: nextNodes,
        // Keep the closed loop's arc glued to the resized cards
        edges: syncLoopEdgeGeometry(nextNodes, current.edges),
      };
      latestDataRef.current = nextData;
      setData(nextData);
    },
    [latestDataRef, setData],
  );

  const handleRingSliderStart = useCallback(() => {
    ringSliderSnapshotRef.current = selectedRingInfo;
  }, [selectedRingInfo]);

  const handleRingSliderChange = useCallback(
    (radius: number) => {
      const info = ringSliderSnapshotRef.current ?? selectedRingInfo;
      if (!info) return;
      setRingRadiusDraft(radius);
      applyRingRadius(radius, info);
    },
    [selectedRingInfo, applyRingRadius],
  );

  const handleRingSliderCommit = useCallback(() => {
    if (!ringSliderSnapshotRef.current) return;
    ringSliderSnapshotRef.current = null;
    setRingRadiusDraft(null);
    // A single history entry for the whole gesture, not one per frame.
    pushHistory(latestDataRef.current);
  }, [pushHistory, latestDataRef]);

  return (
    <div
      className="canvas-toolbar"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 30,
        backgroundColor:
          theme === "eink"
            ? "rgba(244, 241, 234, 0.95)"
            : !isDark
              ? "rgba(255, 255, 255, 0.94)"
              : "rgba(15, 23, 42, 0.9)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        border: `1px solid ${colors.cardBorder}`,
        color: colors.cardText,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className="canvas-toolbar-title"
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginRight: 6,
          color: colors.edgeColor,
          whiteSpace: "nowrap",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          maxWidth: isNarrow ? 120 : 260,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={title || "空间白板"}
      >
        🪐 {title || "空间白板"}
      </span>

      <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

      {/* Save button (Ctrl+S) */}
      {onSave && (
        <button
          className={`canvas-tool-btn save-btn ${isDirty ? "is-dirty" : ""}`}
          onClick={handleSave}
          disabled={isSaving}
          title="保存白板 (Ctrl+S)"
          style={{
            ...toolBtnStyle(theme, colors),
            position: "relative",
            fontWeight: isDirty ? 600 : 500,
            color: isDirty ? "#0284c7" : colors.cardText,
          }}
        >
          <Save size={14} />
          <span className="canvas-btn-label">{isSaving ? "保存中..." : "保存"}</span>
          {isDirty && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#f59e0b",
                marginLeft: 2,
                display: "inline-block",
              }}
              title="有未保存修改"
            />
          )}
        </button>
      )}

      {editable && (
        <>
          <button
            className="canvas-tool-btn"
            onClick={() => handleAddTextCard()}
            title="新建 Markdown 文本卡片"
            style={toolBtnStyle(theme, colors)}
          >
            <Plus size={14} /> <span className="canvas-btn-label">文本卡片</span>
          </button>
          <button
            className="canvas-tool-btn"
            onClick={handleTriggerInsertMedia}
            title="插入多模态媒体卡片 (支持剪贴板图片与本地文件)"
            style={toolBtnStyle(theme, colors)}
          >
            <ImageIcon size={14} /> <span className="canvas-btn-label">图片卡片</span>
          </button>
          <button
            className="canvas-tool-btn"
            onClick={() => setShowFilePicker(true)}
            title="引入已有知识库笔记"
            style={toolBtnStyle(theme, colors)}
          >
            <FileText size={14} /> <span className="canvas-btn-label">引入笔记</span>
          </button>
          <button
            className="canvas-tool-btn"
            onClick={() => handleAddGroup()}
            title="新建概念分组容器"
            style={toolBtnStyle(theme, colors)}
          >
            <Boxes size={14} /> <span className="canvas-btn-label">分组容器</span>
          </button>
          <div style={{ width: 1, height: 18, background: colors.cardBorder }} />
        </>
      )}

      {/* Marquee Box Selection Toggle Button */}
      <button
        className={`canvas-tool-btn ${isBoxSelectMode ? "active" : ""}`}
        onClick={() => setIsBoxSelectMode((prev) => !prev)}
        title={
          isBoxSelectMode
            ? "退出框选模式 (可直接按 Shift+拖动)"
            : "开启框选模式 (或按住 Shift+鼠标拖动)"
        }
        style={{
          ...toolBtnStyle(theme, colors),
          backgroundColor: isBoxSelectMode
            ? isDark
              ? "rgba(56, 189, 248, 0.2)"
              : "rgba(2, 132, 199, 0.12)"
            : "transparent",
          color: isBoxSelectMode ? (isDark ? "#38bdf8" : "#0284c7") : colors.cardText,
        }}
      >
        <BoxSelect size={14} />
        <span className="canvas-btn-label">{isBoxSelectMode ? "框选中" : "框选"}</span>
      </button>

      {/* Multi-selection count indicator & quick relation actions */}
      {selectedNodeIds.size > 0 && (
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 10,
            backgroundColor: isDark ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.15)",
            color: isDark ? "#fbbf24" : "#d97706",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          已选 {selectedNodeIds.size} 项
        </span>
      )}

      {selectedNodeIds.size >= 2 && editable && (
        <>
          <button
            className="canvas-tool-btn"
            onClick={() => handleConnectOneToMany(currentMultiRootNode?.id)}
            title="以当前选中卡片为源，向其余所有选中卡片放射建立一对多关联"
            style={{
              ...toolBtnStyle(theme, colors),
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              fontWeight: 600,
            }}
          >
            <Share2 size={13} />
            <span className="canvas-btn-label">
              一对多关联 (以「{currentMultiRootTitle}」发起源)
            </span>
          </button>
          <button
            className="canvas-tool-btn"
            onClick={handleConnectSelectedNodes}
            title="在选中的卡片/分组之间自动建立顺序链式连线"
            style={{
              ...toolBtnStyle(theme, colors),
              backgroundColor: "rgba(2, 132, 199, 0.15)",
              color: "#0284c7",
              border: "1px solid rgba(2, 132, 199, 0.3)",
              fontWeight: 600,
            }}
          >
            <Link size={13} />
            <span className="canvas-btn-label">链式串联</span>
          </button>
          {selectedNodeIds.size >= 3 && (
            <button
              className="canvas-tool-btn"
              onClick={handleConnectLoopNodes}
              title="在选中的卡片/分组之间建立闭合环形连线 (A -> B -> C -> A)"
              style={{
                ...toolBtnStyle(theme, colors),
                backgroundColor: "rgba(168, 85, 247, 0.15)",
                color: "#a855f7",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                fontWeight: 600,
              }}
            >
              <RotateCw size={13} />
              <span className="canvas-btn-label">环形闭环</span>
            </button>
          )}
          {/* Unified align / distribute dropdown */}
          <div
            style={{ position: "relative", flexShrink: 0 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="canvas-tool-btn"
              onClick={() => setShowAlignMenu((v) => !v)}
              title="对齐与分布 (多选卡片)"
              style={{
                ...toolBtnStyle(theme, colors),
                backgroundColor: showAlignMenu
                  ? "rgba(2, 132, 199, 0.24)"
                  : "rgba(2, 132, 199, 0.12)",
                color: "#0284c7",
                border: "1px solid rgba(2, 132, 199, 0.25)",
                fontWeight: 600,
              }}
            >
              <AlignCenter size={13} />
              <span className="canvas-btn-label">对齐 ▾</span>
            </button>
            {showAlignMenu && (
              <div
                className="canvas-align-menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  zIndex: 300,
                  minWidth: 196,
                  padding: "6px 0",
                  borderRadius: 10,
                  backgroundColor: theme === "eink" ? "#f4f1ea" : !isDark ? "#ffffff" : "#1e293b",
                  border: `1px solid ${colors.cardBorder}`,
                  boxShadow: "0 12px 36px rgba(0,0,0,0.22)",
                  fontSize: 12.5,
                  color: colors.cardText,
                  userSelect: "none",
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="canvas-ctx-section-label">中心对齐</div>
                {(
                  [
                    ["horizontal", "水平中线对齐", AlignJustify],
                    ["vertical", "垂直中线对齐", AlignCenter],
                  ] as const
                ).map(([dir, label, Icon]) => (
                  <div
                    key={dir}
                    className="canvas-ctx-item"
                    onClick={() => {
                      handleAlignSelected(dir);
                      setShowAlignMenu(false);
                    }}
                  >
                    <Icon size={13} />
                    <span style={{ fontWeight: 600 }}>{label}</span>
                  </div>
                ))}

                <div className="canvas-ctx-divider" />
                <div className="canvas-ctx-section-label">整体排布</div>
                {selectedNodeIds.size >= 3 && (
                  <>
                    <div
                      className="canvas-ctx-item"
                      title="将选中卡片沿圆周均匀排布，配合「环形闭环连线」即可得到完全圆形的闭环"
                      onClick={() => handleAlignSelected("circle")}
                    >
                      <RotateCw size={13} color="#a855f7" />
                      <span style={{ fontWeight: 600 }}>环形对齐 (圆周等分)</span>
                    </div>
                    {selectedRingInfo && (
                      <div className="canvas-ctx-slider" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="canvas-ctx-section-label">
                          环半径 · {Math.round(ringRadiusDraft ?? selectedRingInfo.layout.radius)}
                          px
                        </div>
                        <input
                          type="range"
                          aria-label="环半径"
                          min={Math.round(selectedRingInfo.layout.minRadius)}
                          max={Math.round(selectedRingInfo.maxRadius)}
                          step={2}
                          value={Math.round(ringRadiusDraft ?? selectedRingInfo.layout.radius)}
                          onPointerDown={handleRingSliderStart}
                          onChange={(e) => handleRingSliderChange(Number(e.target.value))}
                          onPointerUp={handleRingSliderCommit}
                          onKeyUp={handleRingSliderCommit}
                          onBlur={handleRingSliderCommit}
                        />
                        <div className="canvas-ctx-slider-hint">
                          也可直接拖动环上的卡片实时调整间距
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div
                  className="canvas-ctx-item"
                  title="将选中卡片按规整的矩形网格矩阵排布"
                  onClick={() => {
                    handleAlignSelected("grid");
                    setShowAlignMenu(false);
                  }}
                >
                  <Grid size={13} color="#10b981" />
                  <span style={{ fontWeight: 600 }}>矩形排布 (网格矩阵)</span>
                </div>

                <div className="canvas-ctx-divider" />
                <div className="canvas-ctx-section-label">边缘对齐</div>
                {(
                  [
                    ["left", "左对齐", AlignLeft],
                    ["center", "水平居中", null],
                    ["right", "右对齐", AlignRight],
                    ["top", "顶端对齐", ArrowUpToLine],
                    ["bottom", "底端对齐", ArrowDownToLine],
                  ] as const
                ).map(([dir, label, Icon]) => (
                  <div
                    key={dir}
                    className="canvas-ctx-item"
                    onClick={() => {
                      handleAlignSelected(dir);
                      setShowAlignMenu(false);
                    }}
                  >
                    {Icon ? <Icon size={13} /> : <AlignCenter size={13} />}
                    <span>{label}</span>
                  </div>
                ))}

                {selectedNodeIds.size >= 3 && (
                  <>
                    <div className="canvas-ctx-divider" />
                    <div className="canvas-ctx-section-label">等距分布</div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleAlignSelected("distribute-h");
                        setShowAlignMenu(false);
                      }}
                    >
                      <AlignHorizontalJustifyCenter size={13} />
                      <span>水平等距分布</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleAlignSelected("distribute-v");
                        setShowAlignMenu(false);
                      }}
                    >
                      <AlignVerticalJustifyCenter size={13} />
                      <span>垂直等距分布</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {selectedNodeIds.size === 1 && editable && (
        <>
          <button
            className="canvas-tool-btn"
            onClick={() => handleSpawnConnectedChild(Array.from(selectedNodeIds)[0], "right")}
            title="从当前卡片派生子想法 (快捷键: Tab)"
            style={{
              ...toolBtnStyle(theme, colors),
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontWeight: 500,
            }}
          >
            <GitBranch size={13} />
            <span className="canvas-btn-label">派生想法</span>
          </button>
          <button
            className="canvas-tool-btn"
            onClick={() => {
              const id = Array.from(selectedNodeIds)[0];
              setSpawnModalState({ nodeId: id, count: 3, direction: "right" });
            }}
            title="从当前卡片批量派生多个分支 (弹窗设置数量与方向)"
            style={{
              ...toolBtnStyle(theme, colors),
              backgroundColor: "rgba(139, 92, 246, 0.12)",
              color: "#8b5cf6",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              fontWeight: 500,
            }}
          >
            <Share2 size={13} />
            <span className="canvas-btn-label">批量派生...</span>
          </button>
        </>
      )}

      <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

      <button
        className="canvas-tool-btn"
        onClick={handleUndo}
        disabled={history.past.length === 0}
        title="撤销 (Ctrl+Z)"
        style={{ ...toolBtnStyle(theme, colors), opacity: history.past.length > 0 ? 1 : 0.4 }}
      >
        <RotateCcw size={14} />
      </button>
      <button
        className="canvas-tool-btn"
        onClick={handleRedo}
        disabled={history.future.length === 0}
        title="重做 (Ctrl+Y)"
        style={{ ...toolBtnStyle(theme, colors), opacity: history.future.length > 0 ? 1 : 0.4 }}
      >
        <RotateCw size={14} />
      </button>

      <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

      <button
        className="canvas-tool-btn highlight"
        onClick={handleOpenExtractModal}
        title="将白板空间卡片逆向萃取为 Markdown 专著"
        style={{
          ...toolBtnStyle(theme, colors),
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          color: "#ffffff",
          fontWeight: 600,
        }}
      >
        <BookOpen size={14} /> <span className="canvas-btn-label">萃取长文</span>
      </button>

      <button
        className="canvas-tool-btn"
        onClick={() => setShowExportModal(true)}
        title="导出白板为高清图片 (PNG / 矢量 SVG)"
        style={{
          ...toolBtnStyle(theme, colors),
          color: "#0284c7",
          fontWeight: 600,
        }}
      >
        <ImageIcon size={14} /> <span className="canvas-btn-label">导出图片</span>
      </button>

      <button
        className={`canvas-tool-btn ${isPresentationMode ? "active" : ""}`}
        onClick={handleTogglePresentation}
        title={isPresentationMode ? "退出演示模式 (Esc)" : "进入白板分镜演示模式 (F5)"}
        style={{
          ...toolBtnStyle(theme, colors),
          color: isPresentationMode
            ? isDark
              ? "#818cf8"
              : isEink
                ? "#1e293b"
                : "#6366f1"
            : colors.cardText,
          fontWeight: 600,
          backgroundColor: isPresentationMode
            ? isDark
              ? "rgba(129, 140, 248, 0.22)"
              : isEink
                ? "rgba(30, 41, 59, 0.12)"
                : "rgba(99, 102, 241, 0.15)"
            : "transparent",
        }}
      >
        <Play size={14} />{" "}
        <span className="canvas-btn-label">{isPresentationMode ? "退出演示" : "演示 (F5)"}</span>
      </button>

      <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

      {/* Zoom Controls */}
      <button
        className="canvas-tool-btn"
        onClick={() => handleZoom(0.85)}
        title="缩小"
        style={toolBtnStyle(theme, colors)}
      >
        <ZoomOut size={14} />
      </button>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          minWidth: 42,
          textAlign: "center",
          cursor: "pointer",
        }}
        onClick={() => setViewport((prev) => ({ ...prev, zoom: 1.0 }))}
        title="重置为 100% 缩放"
      >
        {Math.round(viewport.zoom * 100)}%
      </span>
      <button
        className="canvas-tool-btn"
        onClick={() => handleZoom(1.15)}
        title="放大"
        style={toolBtnStyle(theme, colors)}
      >
        <ZoomIn size={14} />
      </button>
      <button
        className="canvas-tool-btn"
        onClick={handleZoomToFit}
        title="自适应全图"
        style={toolBtnStyle(theme, colors)}
      >
        <Scan size={14} />
      </button>
      <button
        className={`canvas-tool-btn ${isFullscreenActive ? "active" : ""}`}
        onClick={handleToggleFullscreen}
        title={isFullscreenActive ? "退出全屏 (F11 / Esc)" : "全屏沉浸白板 (F11)"}
        style={{
          ...toolBtnStyle(theme, colors),
          color: isFullscreenActive
            ? isDark
              ? "#818cf8"
              : isEink
                ? "#1e293b"
                : "#6366f1"
            : colors.cardText,
          backgroundColor: isFullscreenActive
            ? isDark
              ? "rgba(129, 140, 248, 0.22)"
              : isEink
                ? "rgba(30, 41, 59, 0.12)"
                : "rgba(99, 102, 241, 0.15)"
            : "transparent",
        }}
      >
        {isFullscreenActive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>

      {onClose && (
        <>
          <div style={{ width: 1, height: 18, background: colors.cardBorder }} />
          <button
            className="canvas-tool-btn close"
            onClick={onClose}
            title="退出白板模式"
            style={{ ...toolBtnStyle(theme, colors), color: "#f43f5e" }}
          >
            <X size={15} />
          </button>
        </>
      )}
    </div>
  );
}
