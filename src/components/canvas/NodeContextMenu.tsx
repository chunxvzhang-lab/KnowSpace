import { memo } from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Boxes,
  CheckSquare,
  Clipboard,
  Copy,
  Edit2,
  ExternalLink,
  FilePlus,
  GitBranch,
  Grid,
  Link,
  Minimize2,
  Palette,
  RotateCw,
  Share2,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type {
  CanvasEdge,
  CanvasFileNode,
  CanvasGroupNode,
  CanvasNode,
  CanvasTextNode,
} from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { CANVAS_COLOR_PALETTES, type CanvasAlignDirection } from "../../services/canvasService";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * Right-click menu for a card or a group container.
 *
 * Extracted from CanvasView (R2 batch B4).
 *
 * Renders three variants: group-specific actions, a batch panel when several
 * cards are selected, and a single-card panel otherwise. Nothing is mutated in
 * here — colours, grouping, z-order, connections and deletion all report back
 * to the parent, which is what keeps history and the gesture machinery in one
 * place.
 *
 * The props are deliberately named after the identifiers the markup used before
 * extraction, so the body needed no rewriting.
 */
type NodeContextMenuProps = {
  data: { nodes: CanvasNode[]; edges: CanvasEdge[] };
  /** The context-menu state; `targetNodeId` identifies the clicked card. */
  contextMenu: { targetNodeId?: string };
  selectedNodeIds: Set<string>;
  /** Edges whose both endpoints are selected — the batch delete action uses it. */
  connectedInternalEdges: CanvasEdge[];
  /** Custom colour currently committed for the batch, if any. */
  batchCustomColor: string;
  colors: CanvasThemeColors;

  setContextMenu: (value: null) => void;
  setSpawnModalState: (
    value: { nodeId: string; count: number; direction: "right" | "bottom" } | null
  ) => void;

  handleAlignSelected: (direction: CanvasAlignDirection) => void;
  handleSpawnConnectedChild: (nodeId: string, direction?: "right" | "bottom") => void;
  handleDisconnectSelectedNodesEdges: () => void;
  handleDisconnectNodeEdges: (nodeId: string) => void;
  // These four take the node itself rather than an id — they read its content.
  handleCopyNodeText: (node: CanvasNode) => void;
  handleCopyNodeWikilink: (node: CanvasNode) => void;
  handleExtractCardToNote: (node: CanvasTextNode) => void;
  handleSelectGroupNodes: (groupNode: CanvasGroupNode) => void;
  handleFitGroupSize: (groupNode: CanvasGroupNode) => void;
  handleDissolveGroup: (groupId: string) => void;
  handleDeleteGroupWithContents: (groupNode: CanvasGroupNode) => void;
  handleGroupSelectedNodes: () => void;
  handleResetNodeSize: (nodeId: string) => void;
  handleNodeColorChange: (nodeId: string, color: string) => void;
  handleBatchColorChange: (color: string) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteSelected: () => void;
  handleDuplicateNode: (nodeId: string) => void;
  handleDuplicateSelected: () => void;
  handleBringToFront: (nodeId: string) => void;
  handleSendToBack: (nodeId: string) => void;
  handleConnectSelectedNodes: () => void;
  /** The clicked card becomes the "one" when it is passed as the root. */
  handleConnectOneToMany: (specifiedRootId?: string) => void;
  handleConnectLoopNodes: () => void;

  /** Editing is a parent-level gate; every mutating action checks it. */
  editable: boolean;
  setEditingNodeId: (nodeId: string | null) => void;
  setEditingText: (text: string) => void;
  onExtractToNote?: (title: string, content: string) => void;
  onOpenFile?: (filePath: string) => void;

  /**
   * Live colour preview while the native chooser is dragged; the parent owns
   * the snapshot and the debounce timer so a drag writes one history entry.
   */
  previewNodeColor: (nodeId: string, color: string) => void;
  previewBatchNodeColor: (color: string) => void;
  debounceCommitColorPick: () => void;
};

export const NodeContextMenu = memo(function NodeContextMenu({
  data,
  contextMenu,
  selectedNodeIds,
  connectedInternalEdges,
  batchCustomColor,
  colors,
  setContextMenu,
  setSpawnModalState,
  handleAlignSelected,
  handleSpawnConnectedChild,
  handleDisconnectSelectedNodesEdges,
  handleDisconnectNodeEdges,
  handleCopyNodeText,
  handleCopyNodeWikilink,
  handleExtractCardToNote,
  handleSelectGroupNodes,
  handleFitGroupSize,
  handleDissolveGroup,
  handleDeleteGroupWithContents,
  handleGroupSelectedNodes,
  handleResetNodeSize,
  handleNodeColorChange,
  handleBatchColorChange,
  handleDeleteNode,
  handleDeleteSelected,
  handleDuplicateNode,
  handleDuplicateSelected,
  handleBringToFront,
  handleSendToBack,
  handleConnectSelectedNodes,
  handleConnectOneToMany,
  handleConnectLoopNodes,
  previewNodeColor,
  previewBatchNodeColor,
  debounceCommitColorPick,
  editable,
  setEditingNodeId,
  setEditingText,
  onExtractToNote,
  onOpenFile,
}: NodeContextMenuProps) {
  return (
    <>
      {(() => {
              const targetNode = data.nodes.find((n) => n.id === contextMenu.targetNodeId);
              const isMulti = selectedNodeIds.size > 1;
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
                      title={
                        isMulti
                          ? `已选中 ${selectedNodeIds.size} 个卡片`
                          : targetNode?.type === "group"
                          ? `分组: ${targetNode.label || "未命名"}`
                          : `卡片: ${targetNode?.type === "file" ? targetNode.file : "思维便签"}`
                      }
                    >
                      {isMulti
                        ? `批量操作 (${selectedNodeIds.size} 项)`
                        : targetNode?.type === "group"
                        ? `分组: ${targetNode.label || "未命名"}`
                        : `卡片: ${targetNode?.type === "file" ? targetNode.file : "思维便签"}`}
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

                  {/* ═══ GROUP-SPECIFIC CONTEXT MENU ═══ */}
                  {editable && !isMulti && targetNode?.type === "group" && (
                    <>
                      <div className="canvas-ctx-section-label">容器管理</div>
                      {/* Rename Group */}
                      <div
                        className="canvas-ctx-item"
                        onClick={() => {
                          setEditingNodeId(targetNode.id);
                          setEditingText((targetNode as CanvasGroupNode).label || "");
                          setContextMenu(null);
                        }}
                      >
                        <Edit2 size={13} />
                        <span>重命名分组标签</span>
                        <span className="canvas-ctx-shortcut">双击</span>
                      </div>

                      {/* Select contained cards */}
                      <div
                        className="canvas-ctx-item"
                        onClick={() => handleSelectGroupNodes(targetNode as CanvasGroupNode)}
                      >
                        <CheckSquare size={13} color="#0284c7" />
                        <span>选中组内所有卡片</span>
                      </div>

                      {/* Fit group size */}
                      <div
                        className="canvas-ctx-item"
                        onClick={() => handleFitGroupSize(targetNode as CanvasGroupNode)}
                      >
                        <Minimize2 size={13} color="#10b981" />
                        <span>自适应贴合组内卡片尺寸</span>
                      </div>

                      <div className="canvas-ctx-divider" />
                      <div className="canvas-ctx-section-label">分组色彩</div>

                      {/* Group Color Palette */}
                      <div style={{ padding: "4px 12px 6px" }}>
                        <div className="canvas-ctx-colors" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
                            <div
                              key={key}
                              className="canvas-color-dot"
                              onClick={() => {
                                handleNodeColorChange(targetNode.id, key);
                                setContextMenu(null);
                              }}
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                backgroundColor: col.stroke,
                                cursor: "pointer",
                                border: targetNode.color === key ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.2)",
                              }}
                              title={col.label}
                            />
                          ))}
                          <label
                            title="自定义色彩"
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
                              defaultValue={targetNode.color?.startsWith("#") ? targetNode.color : "#3b82f6"}
                              onChange={(e) => {
                                // Live preview only; one history entry is
                                // written once the pick settles
                                previewNodeColor(targetNode.id, e.target.value);
                                debounceCommitColorPick();
                              }}
                              style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
                            />
                            <span style={{ fontSize: 10 }}>🎨</span>
                          </label>
                        </div>
                      </div>

                      {/* Alt-drag hint */}
                      <div style={{ padding: "2px 12px 6px", fontSize: 11, opacity: 0.55, lineHeight: "1.4" }}>
                        💡 按住 <b>Alt</b> 拖动容器框架不带走内部卡片
                      </div>

                      <div className="canvas-ctx-divider" />
                      <div className="canvas-ctx-section-label">组织与副本</div>

                      {/* Duplicate Group */}
                      <div
                        className="canvas-ctx-item"
                        onClick={() => {
                          handleDuplicateNode(targetNode.id);
                          setContextMenu(null);
                        }}
                      >
                        <Copy size={13} />
                        <span>复制分组副本</span>
                        <span className="canvas-ctx-shortcut">Ctrl+D</span>
                      </div>

                      {/* Dissolve Group */}
                      <div
                        className="canvas-ctx-item"
                        onClick={() => handleDissolveGroup(targetNode.id)}
                      >
                        <Boxes size={13} color="#f59e0b" />
                        <span>解散分组 (保留内部卡片)</span>
                      </div>

                      {/* Disconnect edges for this group */}
                      {data.edges.some(
                        (e) => e.fromNode === targetNode.id || e.toNode === targetNode.id
                      ) && (
                        <div
                          className="canvas-ctx-item danger"
                          onClick={() => handleDisconnectNodeEdges(targetNode.id)}
                        >
                          <Unlink size={13} />
                          <span>✂️ 断开分组所有关联连线</span>
                        </div>
                      )}

                      <div className="canvas-ctx-divider" />
                      <div className="canvas-ctx-section-label">删除</div>

                      {/* Delete Group */}
                      <div
                        className="canvas-ctx-item danger"
                        onClick={() => handleDeleteNode(targetNode.id)}
                      >
                        <Trash2 size={13} />
                        <span>删除分组容器</span>
                        <span className="canvas-ctx-shortcut">Delete</span>
                      </div>

                      {/* Delete Group with contents */}
                      <div
                        className="canvas-ctx-item danger"
                        onClick={() => handleDeleteGroupWithContents(targetNode as CanvasGroupNode)}
                      >
                        <Trash2 size={13} />
                        <span>删除容器及内部卡片</span>
                      </div>
                    </>
                  )}

                  {/* ═══ MULTI-SELECTION CONTEXT MENU ═══ */}
                  {editable && isMulti && (
                    <>
                      <div className="canvas-ctx-section-label">组合与连线</div>
                      {/* Group selected nodes */}
                      <div className="canvas-ctx-item" onClick={handleGroupSelectedNodes}>
                        <Boxes size={13} color="#8b5cf6" />
                        <span>打包为新分组容器</span>
                      </div>

                      {/* Connect One to Many (Star) */}
                      {(() => {
                        const targetTitle = targetNode
                          ? targetNode.type === "text"
                            ? targetNode.text.split("\n")[0].replace(/^[#\s*->]+/, "").slice(0, 10) || "卡片"
                            : targetNode.type === "group"
                            ? targetNode.label || "分组"
                            : targetNode.type === "file"
                            ? targetNode.file || "笔记"
                            : targetNode.type === "link"
                            ? targetNode.url || "链接"
                            : "卡片"
                          : "";
                        return (
                          <div
                            className="canvas-ctx-item"
                            onClick={() => handleConnectOneToMany(contextMenu.targetNodeId)}
                          >
                            <Share2 size={13} color="#10b981" />
                            <span>🌱 以此{targetNode?.type === "group" ? "分组" : "卡片"}{targetTitle ? `「${targetTitle}」` : ""}为发起节点建立一对多 (连接其余 {selectedNodeIds.size - 1} 项)</span>
                          </div>
                        );
                      })()}

                      {/* Connect selected nodes (Chain) */}
                      <div className="canvas-ctx-item" onClick={handleConnectSelectedNodes}>
                        <Link size={13} color="#0284c7" />
                        <span>🔗 建立顺序链式连线 ({selectedNodeIds.size} 项)</span>
                      </div>

                      {/* Connect loop nodes (Loop / Ring) */}
                      {selectedNodeIds.size >= 3 && (
                        <div className="canvas-ctx-item" onClick={handleConnectLoopNodes}>
                          <RotateCw size={13} color="#a855f7" />
                          <span>🔄 建立闭环环形连线 ({selectedNodeIds.size} 项)</span>
                        </div>
                      )}

                      {/* Disconnect internal edges between selected cards */}
                      {connectedInternalEdges.length > 0 && (
                        <div
                          className="canvas-ctx-item danger"
                          onClick={handleDisconnectSelectedNodesEdges}
                        >
                          <Unlink size={13} />
                          <span>⚡ 断开所选卡片间的连线 ({connectedInternalEdges.length} 条)</span>
                        </div>
                      )}

                      {/* Disconnect edges for this node */}
                      {contextMenu.targetNodeId &&
                        data.edges.some(
                          (e) =>
                            e.fromNode === contextMenu.targetNodeId ||
                            e.toNode === contextMenu.targetNodeId
                        ) && (
                          <div
                            className="canvas-ctx-item danger"
                            onClick={() => handleDisconnectNodeEdges(contextMenu.targetNodeId!)}
                          >
                            <Unlink size={13} />
                            <span>✂️ 断开此{targetNode?.type === "group" ? "分组" : "卡片"}的所有关联连线</span>
                          </div>
                        )}

                      <div className="canvas-ctx-divider" />
                      <div className="canvas-ctx-section-label">对齐与分布</div>

                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("horizontal")}>
                        <AlignJustify size={13} color="#0284c7" />
                        <span style={{ fontWeight: 600 }}>水平中线对齐 (中心 Y 对齐)</span>
                      </div>
                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("vertical")}>
                        <AlignCenter size={13} color="#0284c7" />
                        <span style={{ fontWeight: 600 }}>垂直中线对齐 (中心 X 对齐)</span>
                      </div>

                      {selectedNodeIds.size >= 3 && (
                        <div
                          className="canvas-ctx-item"
                          onClick={() => handleAlignSelected("circle")}
                          title="将选中卡片沿圆周均匀排布，配合环形闭环连线即得到完全圆形的闭环"
                        >
                          <RotateCw size={13} color="#a855f7" />
                          <span style={{ fontWeight: 600 }}>🔄 环形对齐 (圆周等分)</span>
                        </div>
                      )}
                      <div
                        className="canvas-ctx-item"
                        onClick={() => handleAlignSelected("grid")}
                        title="将选中卡片按规整的矩形网格矩阵排布"
                      >
                        <Grid size={13} color="#10b981" />
                        <span style={{ fontWeight: 600 }}>▦ 矩形排布 (网格矩阵)</span>
                      </div>

                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("left")}>
                        <AlignLeft size={13} />
                        <span>左对齐</span>
                      </div>
                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("center")}>
                        <AlignCenter size={13} />
                        <span>水平居中</span>
                      </div>
                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("right")}>
                        <AlignRight size={13} />
                        <span>右对齐</span>
                      </div>
                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("top")}>
                        <ArrowUpToLine size={13} />
                        <span>顶端对齐</span>
                      </div>
                      <div className="canvas-ctx-item" onClick={() => handleAlignSelected("bottom")}>
                        <ArrowDownToLine size={13} />
                        <span>底端对齐</span>
                      </div>
                      {selectedNodeIds.size >= 3 && (
                        <>
                          <div className="canvas-ctx-item" onClick={() => handleAlignSelected("distribute-h")}>
                            <AlignHorizontalJustifyCenter size={13} />
                            <span>水平等距分布</span>
                          </div>
                          <div className="canvas-ctx-item" onClick={() => handleAlignSelected("distribute-v")}>
                            <AlignVerticalJustifyCenter size={13} />
                            <span>垂直等距分布</span>
                          </div>
                        </>
                      )}

                      <div className="canvas-ctx-divider" />
                      <div className="canvas-ctx-section-label">批量操作</div>

                      {/* Duplicate Selected */}
                      <div className="canvas-ctx-item" onClick={handleDuplicateSelected}>
                        <Copy size={13} />
                        <span>复制副本</span>
                        <span className="canvas-ctx-shortcut">Ctrl+D</span>
                      </div>

                      {/* Color Palette Selector */}
                      <div style={{ padding: "4px 12px 6px" }}>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          <Palette size={11} /> 批量修改色彩
                        </div>
                        <div className="canvas-ctx-colors" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
                            <div
                              key={key}
                              className="canvas-color-dot"
                              onClick={() => {
                                handleBatchColorChange(key);
                                // No native dialog involved, so closing now is safe
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
                          {/* Custom colour applied to the whole selection */}
                          <label
                            title="自定义色彩（应用到所选全部卡片）"
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
                              aria-label="自定义批量色彩"
                              defaultValue={batchCustomColor}
                              onChange={(e) => {
                                // Live preview only; one history entry is
                                // written once the pick settles
                                previewBatchNodeColor(e.target.value);
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

                      <div className="canvas-ctx-item danger" onClick={handleDeleteSelected}>
                        <Trash2 size={13} />
                        <span>删除所选项</span>
                        <span className="canvas-ctx-shortcut">Delete</span>
                      </div>
                    </>
                  )}

                  {/* ═══ SINGLE CARD CONTEXT MENU ═══ */}
                  {!isMulti && (!targetNode || targetNode.type !== "group") && (
                    <>
                      {/* Mindmap Brainstorming Actions */}
                      {editable && targetNode && (
                        <>
                          <div className="canvas-ctx-section-label">脑暴与衍生</div>
                          <div
                            className="canvas-ctx-item"
                            onClick={() => handleSpawnConnectedChild(targetNode.id, "right")}
                          >
                            <GitBranch size={13} color="#10b981" />
                            <span>🌱 派生右侧子想法</span>
                            <span className="canvas-ctx-shortcut">Tab</span>
                          </div>
                          <div
                            className="canvas-ctx-item"
                            onClick={() => handleSpawnConnectedChild(targetNode.id, "bottom")}
                          >
                            <GitBranch size={13} color="#06b6d4" />
                            <span>🌿 派生下方子想法</span>
                          </div>
                          <div
                            className="canvas-ctx-item"
                            onClick={() => {
                              setSpawnModalState({
                                nodeId: targetNode.id,
                                count: 3,
                                direction: "right",
                              });
                              setContextMenu(null);
                            }}
                          >
                            <Share2 size={13} color="#8b5cf6" />
                            <span>🔱 批量派生分支 (自定义数量)...</span>
                          </div>
                          {data.edges.some(
                            (e) => e.fromNode === targetNode.id || e.toNode === targetNode.id
                          ) && (
                            <div
                              className="canvas-ctx-item danger"
                              onClick={() => handleDisconnectNodeEdges(targetNode.id)}
                            >
                              <Unlink size={13} />
                              <span>✂️ 断开所有关联连线</span>
                            </div>
                          )}
                          <div className="canvas-ctx-divider" />
                        </>
                      )}

                      <div className="canvas-ctx-section-label">编辑与复制</div>

                      {editable && targetNode?.type === "text" && (
                        <div
                          className="canvas-ctx-item"
                          onClick={() => {
                            setEditingNodeId(targetNode.id);
                            setEditingText(targetNode.text);
                            setContextMenu(null);
                          }}
                        >
                          <Edit2 size={13} />
                          <span>编辑卡片</span>
                          <span className="canvas-ctx-shortcut">Enter</span>
                        </div>
                      )}

                      {/* Copy Text */}
                      {targetNode && (
                        <div className="canvas-ctx-item" onClick={() => handleCopyNodeText(targetNode)}>
                          <Clipboard size={13} />
                          <span>复制文本内容</span>
                        </div>
                      )}

                      {/* Copy Wikilink */}
                      {targetNode && (
                        <div className="canvas-ctx-item" onClick={() => handleCopyNodeWikilink(targetNode)}>
                          <Link size={13} color="#0284c7" />
                          <span>复制双链引用 [[...]]</span>
                        </div>
                      )}

                      {/* Reset Node Size */}
                      {editable && targetNode && (
                        <div className="canvas-ctx-item" onClick={() => handleResetNodeSize(targetNode.id)}>
                          <Minimize2 size={13} />
                          <span>重置标准尺寸</span>
                        </div>
                      )}

                      {/* Extract to note */}
                      {editable && onExtractToNote && targetNode?.type === "text" && (
                        <div
                          className="canvas-ctx-item"
                          onClick={() => handleExtractCardToNote(targetNode as CanvasTextNode)}
                        >
                          <FilePlus size={13} color="#10b981" />
                          <span>提取为新知识库笔记</span>
                        </div>
                      )}

                      {/* Open original file in workspace */}
                      {targetNode?.type === "file" && onOpenFile && (
                        <div
                          className="canvas-ctx-item"
                          onClick={() => {
                            onOpenFile((targetNode as CanvasFileNode).file);
                            setContextMenu(null);
                          }}
                        >
                          <ExternalLink size={13} />
                          <span>在工作区打开原笔记</span>
                        </div>
                      )}

                      {editable && targetNode && (
                        <>
                          <div
                            className="canvas-ctx-item"
                            onClick={() => {
                              handleDuplicateNode(targetNode.id);
                              setContextMenu(null);
                            }}
                          >
                            <Copy size={13} />
                            <span>复制副本</span>
                            <span className="canvas-ctx-shortcut">Ctrl+D</span>
                          </div>

                          <div className="canvas-ctx-divider" />
                          <div className="canvas-ctx-section-label">视觉与图层</div>

                          {/* Color Palette Selector + Custom Picker */}
                          <div style={{ padding: "4px 12px 6px" }}>
                            <div
                              style={{
                                fontSize: 11,
                                opacity: 0.7,
                                marginBottom: 4,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Palette size={11} /> 标签色彩
                            </div>
                            <div className="canvas-ctx-colors" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
                                <div
                                  key={key}
                                  className="canvas-color-dot"
                                  onClick={() => {
                                    handleNodeColorChange(targetNode.id, key);
                                    setContextMenu(null);
                                  }}
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    backgroundColor: col.stroke,
                                    cursor: "pointer",
                                    border:
                                      targetNode?.color === key
                                        ? "2px solid #f59e0b"
                                        : "1px solid rgba(0,0,0,0.2)",
                                  }}
                                  title={col.label}
                                />
                              ))}
                              {/* Custom Color Native Picker */}
                              <label
                                title="自定义色彩"
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
                                  defaultValue={
                                    targetNode?.color?.startsWith("#") ? targetNode.color : "#3b82f6"
                                  }
                                  onChange={(e) => {
                                    // Live preview only; one history entry is
                                    // written once the pick settles
                                    previewNodeColor(targetNode.id, e.target.value);
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

                          {/* Layer order */}
                          <div
                            className="canvas-ctx-item"
                            onClick={() => handleBringToFront(targetNode.id)}
                          >
                            <ArrowUpToLine size={13} />
                            <span>置于顶层</span>
                          </div>
                          <div
                            className="canvas-ctx-item"
                            onClick={() => handleSendToBack(targetNode.id)}
                          >
                            <ArrowDownToLine size={13} />
                            <span>置于底层</span>
                          </div>

                          <div className="canvas-ctx-divider" />
                          <div className="canvas-ctx-section-label">删除</div>

                          <div
                            className="canvas-ctx-item danger"
                            onClick={() => handleDeleteNode(targetNode.id)}
                          >
                            <Trash2 size={13} />
                            <span>删除卡片</span>
                            <span className="canvas-ctx-shortcut">Delete</span>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              );
            })()}
    </>
  );
});
