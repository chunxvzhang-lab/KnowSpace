import { memo } from "react";
import {
  ArrowLeftRight,
  Palette,
  Shuffle,
  Spline,
  Trash2,
  X,
} from "lucide-react";
import type {
  CanvasEdge,
  CanvasEdgeLabelShape,
  CanvasNode,
  CanvasNodeSide,
} from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import {
  CANVAS_COLOR_PALETTES,
  CANVAS_RELATION_PRESETS,
} from "../../services/canvasService";
import { renderEdgeShapeIcon } from "./canvasEdgeIcons";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * Right-click menu for one or more selected connectors.
 *
 * Extracted from CanvasView (R2 batch B3).
 *
 * This is the largest branch of the context menu. It renders two variants: a
 * batch panel when several edges are selected, and a single-edge panel
 * otherwise. Everything is read-only here — selecting colours, styles, arrow
 * modes and label shapes all report back to the parent through callbacks, which
 * is what keeps the history and gesture machinery in one place.
 *
 * The props are deliberately named after the identifiers the markup used before
 * extraction, so the body needed no rewriting.
 */
type EdgeContextMenuProps = {
  data: { nodes: CanvasNode[]; edges: CanvasEdge[] };
  nodeMap: Map<string, CanvasNode>;
  /** The context-menu state; \`targetEdgeId\` identifies the clicked edge. */
  contextMenu: { targetEdgeId?: string };
  selectedEdgeIds: Set<string>;
  /** Custom colour currently committed for the batch, if any. */
  batchEdgeCustomColor: string;
  colors: CanvasThemeColors;
  isDark: boolean;

  setContextMenu: (value: null) => void;

  handleToggleEdgeStyle: (edgeId: string) => void;
  handleToggleEdgeArrow: (edgeId: string) => void;
  handleToggleEdgeStrokePattern: (edgeId: string) => void;
  handleReverseEdge: (edgeId: string) => void;
  handleEdgeColorChange: (edgeId: string, color: string) => void;
  handleEdgeLabelChange: (edgeId: string, label: string) => void;
  handleEdgeLabelShapeChange: (edgeId: string, shape: CanvasEdgeLabelShape) => void;
  handleSetEdgeAnchorSide: (
    edgeId: string,
    end: "fromSide" | "toSide",
    side: CanvasNodeSide | undefined
  ) => void;
  handleDeleteEdge: (edgeId: string) => void;

  handleBatchSetEdgeStyle: (style: "bezier" | "step" | "straight") => void;
  handleBatchCycleStrokePattern: () => void;
  handleBatchToggleArrow: () => void;
  handleBatchSetEdgeColor: (colorKey: string) => void;
  handleBatchDeleteEdges: () => void;
  handleBatchReverseEdges: () => void;

  /**
   * Custom-colour picking previews live while the chooser is dragged and
   * commits a single history entry when it settles — the parent owns both the
   * snapshot and the debounce timer.
   */
  previewBatchEdgeColor: (color: string) => void;
  previewEdgeColor: (edgeId: string, color: string) => void;
  debounceCommitColorPick: () => void;
};

export const EdgeContextMenu = memo(function EdgeContextMenu({
  data,
  nodeMap,
  contextMenu,
  selectedEdgeIds,
  batchEdgeCustomColor,
  colors,
  isDark,
  setContextMenu,
  handleToggleEdgeStyle,
  handleToggleEdgeArrow,
  handleToggleEdgeStrokePattern,
  handleReverseEdge,
  handleEdgeColorChange,
  handleEdgeLabelChange,
  handleEdgeLabelShapeChange,
  handleSetEdgeAnchorSide,
  handleDeleteEdge,
  handleBatchSetEdgeStyle,
  handleBatchCycleStrokePattern,
  handleBatchToggleArrow,
  handleBatchSetEdgeColor,
  handleBatchDeleteEdges,
  handleBatchReverseEdges,
  previewBatchEdgeColor,
  previewEdgeColor,
  debounceCommitColorPick,
}: EdgeContextMenuProps) {
  return (
    <>
      {(() => {
              const isMultiEdge = selectedEdgeIds.size > 1;
              if (isMultiEdge) {
                return (
                  <>
                    <div
                      className="canvas-ctx-header"
                      style={{
                        padding: "6px 12px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: colors.edgeColor,
                        borderBottom: `1px solid ${colors.cardHeaderBorder}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 165,
                        }}
                      >
                        🔗 批量连线操作 ({selectedEdgeIds.size} 条)
                      </span>
                      <button
                        onClick={() => setContextMenu(null)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: colors.cardText,
                          opacity: 0.6,
                          display: "flex",
                          alignItems: "center",
                        }}
                        title="关闭菜单"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    <div className="canvas-ctx-section-label">连线形态</div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleBatchSetEdgeStyle("bezier");
                        setContextMenu(null);
                      }}
                    >
                      <Spline size={13} />
                      <span>批量设为: 贝塞尔曲线</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleBatchSetEdgeStyle("step");
                        setContextMenu(null);
                      }}
                    >
                      <Spline size={13} />
                      <span>批量设为: 直角折线</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleBatchSetEdgeStyle("straight");
                        setContextMenu(null);
                      }}
                    >
                      <Spline size={13} />
                      <span>批量设为: 直线</span>
                    </div>

                    <div className="canvas-ctx-divider" />
                    <div className="canvas-ctx-section-label">虚实与箭头</div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleBatchCycleStrokePattern();
                        setContextMenu(null);
                      }}
                    >
                      <Spline size={13} />
                      <span>批量切换虚实 (实线 / 虚线 / 点线)</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleBatchToggleArrow();
                        setContextMenu(null);
                      }}
                    >
                      <ArrowLeftRight size={13} />
                      <span>批量切换箭头 (无 / 单向 / 双向)</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleBatchReverseEdges();
                        setContextMenu(null);
                      }}
                    >
                      <Shuffle size={13} color="#0284c7" />
                      <span>批量反转连线流向</span>
                      <span className="canvas-ctx-shortcut">R</span>
                    </div>

                    <div className="canvas-ctx-divider" />
                    <div className="canvas-ctx-section-label">批量色彩</div>
                    <div style={{ padding: "4px 12px 6px" }}>
                      <div className="canvas-ctx-colors">
                        {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
                          <div
                            key={key}
                            className="canvas-color-dot"
                            onClick={() => {
                              handleBatchSetEdgeColor(key);
                              setContextMenu(null);
                            }}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              backgroundColor: col.stroke,
                              cursor: "pointer",
                              border: "1px solid rgba(0,0,0,0.2)",
                            }}
                            title={col.label}
                          />
                        ))}
                        {/* Custom colour applied to every selected edge */}
                        <label
                          title="自定义色彩（应用到所选全部连线）"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            border: "1px dashed rgba(128,128,128,0.5)",
                            cursor: "pointer",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <input
                            type="color"
                            aria-label="自定义批量连线色彩"
                            defaultValue={batchEdgeCustomColor}
                            onChange={(e) => {
                              // Live preview only; one history entry is
                              // written once the pick settles
                              previewBatchEdgeColor(e.target.value);
                              debounceCommitColorPick();
                            }}
                            style={{
                              position: "absolute",
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              cursor: "pointer",
                            }}
                          />
                          <span style={{ fontSize: 10 }}>🎨</span>
                        </label>
                      </div>
                    </div>

                    <div className="canvas-ctx-divider" />
                    <div className="canvas-ctx-section-label">删除</div>
                    <div
                      className="canvas-ctx-item danger"
                      onClick={handleBatchDeleteEdges}
                    >
                      <Trash2 size={13} />
                      <span>批量删除连线 ({selectedEdgeIds.size} 条)</span>
                      <span className="canvas-ctx-shortcut">Delete</span>
                    </div>
                  </>
                );
              }

              const targetEdge = data.edges.find((e) => e.id === contextMenu.targetEdgeId);
              if (!targetEdge) return null;
              const fromNode = nodeMap.get(targetEdge.fromNode);
              const toNode = nodeMap.get(targetEdge.toNode);
              const fromTitle =
                fromNode?.type === "file"
                  ? fromNode.file
                  : fromNode?.type === "group"
                  ? fromNode.label || "分组"
                  : "卡片";
              const toTitle =
                toNode?.type === "file"
                  ? toNode.file
                  : toNode?.type === "group"
                  ? toNode.label || "分组"
                  : "卡片";

              const arrowDesc =
                targetEdge.fromEnd === "arrow" && targetEdge.toEnd === "arrow"
                  ? "双向箭头 (⇄)"
                  : targetEdge.toEnd === "arrow"
                  ? "单向箭头 (→)"
                  : "无箭头";

              const styleDesc =
                targetEdge.style === "straight"
                  ? "直线"
                  : targetEdge.style === "step"
                  ? "直角折线"
                  : "贝塞尔曲线";

              return (
                <>
                  <div
                    className="canvas-ctx-header"
                    style={{
                      padding: "6px 12px 6px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: colors.edgeColor,
                      borderBottom: `1px solid ${colors.cardHeaderBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 165,
                      }}
                      title={`连线关系: ${fromTitle} → ${toTitle}`}
                    >
                      🔗 关系连线
                    </span>
                    <button
                      onClick={() => setContextMenu(null)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: colors.cardText,
                        opacity: 0.6,
                        display: "flex",
                        alignItems: "center",
                      }}
                      title="关闭菜单"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* Section 1: Preset relation tags */}
                  <div className="canvas-ctx-section-label">快捷关系预设:</div>
                  <div style={{ padding: "4px 12px 6px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {CANVAS_RELATION_PRESETS.map((preset) => (
                        <span
                          key={preset}
                          onClick={() => {
                            handleEdgeLabelChange(targetEdge.id, preset);
                            setContextMenu(null);
                          }}
                          style={{
                            padding: "2px 7px",
                            fontSize: 11,
                            borderRadius: 10,
                            cursor: "pointer",
                            border:
                              targetEdge.label === preset
                                ? "1px solid #f59e0b"
                                : `1px solid ${colors.cardBorder}`,
                            background:
                              targetEdge.label === preset ? "rgba(245,158,11,0.18)" : "transparent",
                            color: targetEdge.label === preset ? "#f59e0b" : colors.cardText,
                            fontWeight: targetEdge.label === preset ? 600 : 400,
                          }}
                        >
                          {preset}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="canvas-ctx-divider" />
                  <div className="canvas-ctx-section-label">连线形态与流向</div>

                  {/* Line Style Toggle */}
                  <div
                    className="canvas-ctx-item"
                    onClick={() => {
                      handleToggleEdgeStyle(targetEdge.id);
                    }}
                  >
                    <Spline size={13} />
                    <span>线型: {styleDesc}</span>
                    <span className="canvas-ctx-shortcut">切换</span>
                  </div>

                  {/* Stroke Pattern Toggle */}
                  <div
                    className="canvas-ctx-item"
                    onClick={() => {
                      handleToggleEdgeStrokePattern(targetEdge.id);
                    }}
                  >
                    <Spline size={13} />
                    <span>
                      虚实:{" "}
                      {targetEdge.strokePattern === "dashed"
                        ? "虚线"
                        : targetEdge.strokePattern === "dotted"
                        ? "点线"
                        : "实线"}
                    </span>
                    <span className="canvas-ctx-shortcut">切换</span>
                  </div>

                  {/* Arrow Mode Toggle */}
                  <div
                    className="canvas-ctx-item"
                    onClick={() => {
                      handleToggleEdgeArrow(targetEdge.id);
                    }}
                  >
                    <ArrowLeftRight size={13} />
                    <span>箭头: {arrowDesc}</span>
                    <span className="canvas-ctx-shortcut">切换</span>
                  </div>

                  {/* Reverse Direction */}
                  <div
                    className="canvas-ctx-item"
                    onClick={() => {
                      handleReverseEdge(targetEdge.id);
                      setContextMenu(null);
                    }}
                    title={`反转连线流向: ${fromTitle} ⇄ ${toTitle}`}
                  >
                    <Shuffle size={13} color="#0284c7" />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>反转连线流向</span>
                      <span
                        style={{
                          fontSize: 10,
                          opacity: 0.65,
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                        }}
                      >
                        {fromTitle} ⇄ {toTitle}
                      </span>
                    </span>
                    <span className="canvas-ctx-shortcut">R</span>
                  </div>

                  {/* Endpoint Anchors Customization */}
                  <div className="canvas-ctx-divider" />
                  <div className="canvas-ctx-section-label">连线端点锚点</div>
                  <div style={{ padding: "4px 12px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ opacity: 0.8 }}>起点锚点:</span>
                      <div style={{ display: "flex", gap: 3 }}>
                        {([undefined, "top", "right", "bottom", "left"] as const).map((side) => {
                          const isActive = targetEdge.fromSide === side;
                          const label = !side ? "自适应" : side === "top" ? "上" : side === "right" ? "右" : side === "bottom" ? "下" : "左";
                          return (
                            <button
                              key={String(side)}
                              onClick={() => handleSetEdgeAnchorSide(targetEdge.id, "fromSide", side)}
                              style={{
                                padding: "2px 5px",
                                fontSize: 10.5,
                                borderRadius: 4,
                                border: isActive ? "1px solid #f59e0b" : `1px solid ${colors.cardBorder}`,
                                background: isActive ? "rgba(245,158,11,0.2)" : "transparent",
                                color: isActive ? "#f59e0b" : colors.cardText,
                                cursor: "pointer",
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ opacity: 0.8 }}>终点锚点:</span>
                      <div style={{ display: "flex", gap: 3 }}>
                        {([undefined, "top", "right", "bottom", "left"] as const).map((side) => {
                          const isActive = targetEdge.toSide === side;
                          const label = !side ? "自适应" : side === "top" ? "上" : side === "right" ? "右" : side === "bottom" ? "下" : "左";
                          return (
                            <button
                              key={String(side)}
                              onClick={() => handleSetEdgeAnchorSide(targetEdge.id, "toSide", side)}
                              style={{
                                padding: "2px 5px",
                                fontSize: 10.5,
                                borderRadius: 4,
                                border: isActive ? "1px solid #f59e0b" : `1px solid ${colors.cardBorder}`,
                                background: isActive ? "rgba(245,158,11,0.2)" : "transparent",
                                color: isActive ? "#f59e0b" : colors.cardText,
                                cursor: "pointer",
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="canvas-ctx-divider" />
                  <div className="canvas-ctx-section-label">外观与标签</div>

                  {/* Stroke Color Selector */}
                  <div style={{ padding: "4px 12px 6px" }}>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        marginBottom: 5,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Palette size={11} /> 连线色彩
                    </div>
                    <div className="canvas-ctx-colors">
                      {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
                        <div
                          key={key}
                          className="canvas-color-dot"
                          onClick={() => {
                            handleEdgeColorChange(targetEdge.id, key);
                            setContextMenu(null);
                          }}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            backgroundColor: col.stroke,
                            cursor: "pointer",
                            border:
                              targetEdge.color === key
                                ? "2px solid #f59e0b"
                                : "1px solid rgba(0,0,0,0.2)",
                          }}
                          title={col.label}
                        />
                      ))}
                      {/* Custom colour applied to the edge */}
                      <label
                        title="自定义连线色彩"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          border: targetEdge.color?.startsWith("#")
                            ? "2px solid #f59e0b"
                            : "1px dashed rgba(128,128,128,0.5)",
                          cursor: "pointer",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <input
                          type="color"
                          aria-label="自定义连线色彩"
                          defaultValue={
                            targetEdge.color?.startsWith("#") ? targetEdge.color : "#3b82f6"
                          }
                          onChange={(e) => {
                            // Live preview only; one history entry is
                            // written once the pick settles
                            previewEdgeColor(targetEdge.id, e.target.value);
                            debounceCommitColorPick();
                          }}
                          style={{
                            position: "absolute",
                            opacity: 0,
                            width: "100%",
                            height: "100%",
                            cursor: "pointer",
                          }}
                        />
                        <span style={{ fontSize: 10 }}>🎨</span>
                      </label>
                    </div>
                  </div>

                  {/* Label Shape Selector */}
                  <div style={{ padding: "4px 12px 6px" }}>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        color: colors.cardText,
                      }}
                    >
                      <span style={{ fontSize: 11 }}>⬡</span> 标签形状
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {(["pill", "rect", "diamond"] as const).map((s) => {
                        const isActive = (targetEdge.labelShape || "pill") === s;
                        const labelName = s === "pill" ? "胶囊" : s === "rect" ? "矩形" : "菱形";
                        return (
                          <div
                            key={s}
                            onClick={() => {
                              handleEdgeLabelShapeChange(targetEdge.id, s);
                              setContextMenu(null);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              flex: 1,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 5,
                              padding: "4px 6px",
                              fontSize: 11,
                              borderRadius: 6,
                              border: isActive
                                ? "1.5px solid #f59e0b"
                                : `1px solid ${colors.cardBorder}`,
                              background: isActive
                                ? "rgba(245,158,11,0.18)"
                                : isDark
                                ? "rgba(255,255,255,0.03)"
                                : "rgba(0,0,0,0.02)",
                              color: isActive ? "#f59e0b" : colors.cardText,
                              cursor: "pointer",
                              fontWeight: isActive ? 600 : 400,
                              transition: "all 0.15s ease",
                            }}
                            title={s === "pill" ? "胶囊型标签" : s === "rect" ? "矩形标签" : "菱形标签"}
                          >
                            {renderEdgeShapeIcon(s, isActive)}
                            <span>{labelName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="canvas-ctx-divider" />

                  {/* Delete Edge */}
                  <div
                    className="canvas-ctx-item danger"
                    onClick={() => handleDeleteEdge(targetEdge.id)}
                  >
                    <Trash2 size={13} />
                    <span>删除连线</span>
                    <span className="canvas-ctx-shortcut">Delete</span>
                  </div>
                </>
              );
      })()}
    </>
  );
});
