import { useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Boxes,
  BoxSelect,
  CheckSquare,
  Clipboard,
  FileText,
  Grid,
  Image as ImageIcon,
  Link,
  Maximize2,
  Music,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Video,
  X,
  ZoomIn,
} from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ThemeMode } from "../../core/types";
import type {
  CanvasData,
  CanvasEdge,
  CanvasEdgeLabelShape,
  CanvasGroupNode,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasViewport,
} from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import type { CanvasAlignDirection } from "../../services/canvasService";
import type { LightboxMedia } from "../MediaLightbox";
import { MediaLightbox } from "../MediaLightbox";
import { CanvasToast } from "./CanvasToast";
import { EdgeContextMenu } from "./EdgeContextMenu";
import { NodeContextMenu } from "./NodeContextMenu";
import { ExtractModal } from "./ExtractModal";
import { FilePickerModal } from "./FilePickerModal";
import { ExportModal } from "./ExportModal";
import { SpawnBranchModal } from "./SpawnBranchModal";
import type { SpawnModalState } from "./useCanvasConnect";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/** Where the user right-clicked, and which node/edge (if any) it hit. */
export type CanvasContextMenuState = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  targetNodeId?: string;
  targetEdgeId?: string;
};

/**
 * The canvas overlay layer: the note-picker / extract / export / spawn modals,
 * the portalled right-click context menu (edge, node and background variants),
 * the floating toast and the media lightbox.
 *
 * Extracted from CanvasView (wave 4 of the CanvasView decomposition). The
 * overlay STATE stays in CanvasView because non-overlay code writes it too
 * (the document/connect/pointer hooks take `setContextMenu`, the keyboard
 * chains close the modals, the toolbar opens the export modal, …) — only
 * state that nothing outside this JSX touches moved in (`searchKeyword`).
 */
type CanvasOverlayMenusProps = {
  theme: ThemeMode;
  colors: CanvasThemeColors;
  isDark: boolean;
  editable: boolean;

  data: CanvasData;
  nodeMap: Map<string, CanvasNode>;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  connectedInternalEdges: CanvasEdge[];
  batchCustomColor: string;
  batchEdgeCustomColor: string;

  contextMenu: CanvasContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | null>>;
  /** Attached to the portalled menu; CanvasView clamps it against the viewport. */
  contextMenuRef: RefObject<HTMLDivElement | null>;

  allChapters: Array<{ id: string; title: string; src: string; absolutePath?: string }>;
  showFilePicker: boolean;
  setShowFilePicker: (show: boolean) => void;
  handleAddFileCard: (chapter: { title: string; src: string }, atX?: number, atY?: number) => void;

  showExtractModal: boolean;
  setShowExtractModal: (show: boolean) => void;
  extractedMarkdown: string;
  copiedNotification: boolean;
  handleCopyExtracted: () => void;
  handleSaveAsNote: () => void;
  onExtractToNote?: (title: string, content: string) => void;

  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  exportFormat: "png" | "svg";
  setExportFormat: Dispatch<SetStateAction<"png" | "svg">>;
  exportBg: "theme" | "white" | "transparent";
  setExportBg: Dispatch<SetStateAction<"theme" | "white" | "transparent">>;
  isExporting: boolean;
  exportCopyFeedback: boolean;
  handleCopyExport: () => void;
  handleDownloadExport: () => void;

  spawnModalState: SpawnModalState | null;
  setSpawnModalState: Dispatch<SetStateAction<SpawnModalState | null>>;
  handleConfirmBatchSpawn: () => void;

  handleAddTextCard: (atX?: number, atY?: number) => void;
  handlePasteClipboardAsCard: (canvasX: number, canvasY: number) => void;
  handleTriggerInsertImage: (canvasX: number, canvasY: number) => void;
  handleTriggerInsertVideo: (canvasX: number, canvasY: number) => void;
  handleTriggerInsertAudio: (canvasX: number, canvasY: number) => void;
  handleAddGroup: (atX?: number, atY?: number) => void;

  isBoxSelectMode: boolean;
  setIsBoxSelectMode: Dispatch<SetStateAction<boolean>>;
  handleSelectAll: () => void;
  handleSelectAllEdges: () => void;
  handleAlignToGrid: () => void;
  handleZoomToFit: () => void;
  setViewport: Dispatch<SetStateAction<CanvasViewport>>;

  history: { past: CanvasData[]; future: CanvasData[] };
  handleUndo: () => void;
  handleRedo: () => void;
  onSave?: () => void;
  handleSave: () => void;
  handleOpenExtractModal: () => void;

  // ── Edge context menu callbacks ─────────────────────────────────────────
  handleToggleEdgeStyle: (edgeId: string) => void;
  handleToggleEdgeArrow: (edgeId: string) => void;
  handleToggleEdgeStrokePattern: (edgeId: string) => void;
  handleReverseEdge: (edgeId: string) => void;
  handleEdgeColorChange: (edgeId: string, color: string) => void;
  handleEdgeLabelChange: (edgeId: string, label: string) => void;
  handleEdgeLabelShapeChange: (edgeId: string, shape: CanvasEdgeLabelShape) => void;
  handleSetEdgeAnchorSide: (
    edgeId: string,
    sideKey: "fromSide" | "toSide",
    side: CanvasNodeSide | undefined,
  ) => void;
  handleDeleteEdge: (edgeId: string) => void;
  handleBatchSetEdgeStyle: (style: "bezier" | "step" | "straight") => void;
  handleBatchCycleStrokePattern: () => void;
  handleBatchToggleArrow: () => void;
  handleBatchSetEdgeColor: (colorKey: string) => void;
  handleBatchDeleteEdges: () => void;
  handleBatchReverseEdges: () => void;
  previewBatchEdgeColor: (color: string) => void;
  previewEdgeColor: (edgeId: string, color: string) => void;
  debounceCommitColorPick: () => void;

  // ── Node context menu callbacks ─────────────────────────────────────────
  handleAlignSelected: (direction: CanvasAlignDirection) => void;
  handleSpawnConnectedChild: (sourceNodeId: string, direction?: "right" | "bottom") => void;
  handleDisconnectSelectedNodesEdges: () => void;
  handleDisconnectNodeEdges: (nodeId: string) => void;
  handleCopyNodeText: (node: CanvasNode) => void;
  handleCopyNodeWikilink: (node: CanvasNode) => void;
  handleExtractCardToNote: (node: CanvasTextNode) => void;
  handleSelectGroupNodes: (groupNode: CanvasGroupNode) => void;
  handleFitGroupSize: (groupNode: CanvasGroupNode) => void;
  handleDissolveGroup: (groupNodeId: string) => void;
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
  handleConnectOneToMany: (specifiedRootId?: string) => void;
  handleConnectLoopNodes: () => void;
  previewNodeColor: (nodeId: string, color: string) => void;
  previewBatchNodeColor: (color: string) => void;
  setEditingNodeId: (id: string | null) => void;
  setEditingText: (text: string) => void;
  onOpenFile?: (filePath: string) => void;

  toastMessage: string | null;
  lightboxMedia: LightboxMedia | null;
  setLightboxMedia: (media: LightboxMedia | null) => void;
};

export function CanvasOverlayMenus({
  theme,
  colors,
  isDark,
  editable,
  data,
  nodeMap,
  selectedNodeIds,
  selectedEdgeIds,
  connectedInternalEdges,
  batchCustomColor,
  batchEdgeCustomColor,
  contextMenu,
  setContextMenu,
  contextMenuRef,
  allChapters,
  showFilePicker,
  setShowFilePicker,
  handleAddFileCard,
  showExtractModal,
  setShowExtractModal,
  extractedMarkdown,
  copiedNotification,
  handleCopyExtracted,
  handleSaveAsNote,
  onExtractToNote,
  showExportModal,
  setShowExportModal,
  exportFormat,
  setExportFormat,
  exportBg,
  setExportBg,
  isExporting,
  exportCopyFeedback,
  handleCopyExport,
  handleDownloadExport,
  spawnModalState,
  setSpawnModalState,
  handleConfirmBatchSpawn,
  handleAddTextCard,
  handlePasteClipboardAsCard,
  handleTriggerInsertImage,
  handleTriggerInsertVideo,
  handleTriggerInsertAudio,
  handleAddGroup,
  isBoxSelectMode,
  setIsBoxSelectMode,
  handleSelectAll,
  handleSelectAllEdges,
  handleAlignToGrid,
  handleZoomToFit,
  setViewport,
  history,
  handleUndo,
  handleRedo,
  onSave,
  handleSave,
  handleOpenExtractModal,
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
  setEditingNodeId,
  setEditingText,
  onOpenFile,
  toastMessage,
  lightboxMedia,
  setLightboxMedia,
}: CanvasOverlayMenusProps) {
  // The file picker's search draft. Nothing outside the picker wiring reads or
  // writes it, so it lives here; this component stays mounted, so the query
  // still persists across picker open/close exactly as it did in CanvasView.
  const [searchKeyword, setSearchKeyword] = useState("");

  return (
    <>
      {/* 5. MODAL: INSERT NOTE FILE PICKER */}
      {showFilePicker && (
        <FilePickerModal
          chapters={allChapters}
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
          theme={theme}
          colors={colors}
          onPick={handleAddFileCard}
          onClose={() => setShowFilePicker(false)}
        />
      )}

      {/* 6. MODAL: EXTRACT CANVAS TO ARTICLE PREVIEW */}
      {showExtractModal && (
        <ExtractModal
          markdown={extractedMarkdown}
          theme={theme}
          colors={colors}
          copied={copiedNotification}
          canSaveAsNote={Boolean(onExtractToNote)}
          onCopy={handleCopyExtracted}
          onSaveAsNote={handleSaveAsNote}
          onClose={() => setShowExtractModal(false)}
        />
      )}

      {/* 6.5. MODAL: EXPORT CANVAS AS IMAGE */}
      {showExportModal && (
        <ExportModal
          nodeCount={data.nodes.length}
          edgeCount={data.edges.length}
          format={exportFormat}
          onFormatChange={setExportFormat}
          background={exportBg}
          onBackgroundChange={setExportBg}
          isExporting={isExporting}
          copyFeedback={exportCopyFeedback}
          theme={theme}
          colors={colors}
          onCopy={handleCopyExport}
          onDownload={handleDownloadExport}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* 6.6. MODAL: BATCH SPAWN BRANCHES */}
      {spawnModalState && (
        <SpawnBranchModal
          count={spawnModalState.count}
          direction={spawnModalState.direction}
          onCountChange={(count) =>
            setSpawnModalState((prev) => (prev ? { ...prev, count } : null))
          }
          onDirectionChange={(direction) =>
            setSpawnModalState((prev) => (prev ? { ...prev, direction } : null))
          }
          theme={theme}
          colors={colors}
          onConfirm={handleConfirmBatchSpawn}
          onClose={() => setSpawnModalState(null)}
        />
      )}

      {/* 8. RIGHT-CLICK CONTEXT MENU (MINDMAP INSPIRED) */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="canvas-context-menu"
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 10000,
              backgroundColor: theme === "eink" ? "#f4f1ea" : !isDark ? "#ffffff" : "#1e293b",
              color: colors.cardText,
              border: `1px solid ${colors.cardBorder}`,
              boxShadow: !isDark ? "0 10px 32px rgba(0,0,0,0.14)" : "0 14px 40px rgba(0,0,0,0.55)",
              borderRadius: 10,
              padding: "6px 0",
              minWidth: 230,
              maxWidth: 300,
              maxHeight: "calc(100% - 24px)",
              overflowY: "auto",
              fontSize: 12.5,
              userSelect: "none",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            // The menu is portalled to `document.body`, so the canvas's wheel
            // ownership check cannot see it — that check walks up the *DOM* to the
            // canvas root, and this menu's ancestors are `body` and `html`. The
            // event still reaches the canvas because React propagates through the
            // component tree, so without this the menu scrolled and the whiteboard
            // panned at the same time. `NodeContextMenu` and `EdgeContextMenu` are
            // rendered inside this element, so this one handler covers all three.
            onWheel={(e) => e.stopPropagation()}
          >
            {contextMenu.targetEdgeId ? (
              <EdgeContextMenu
                data={data}
                nodeMap={nodeMap}
                contextMenu={contextMenu}
                selectedEdgeIds={selectedEdgeIds}
                batchEdgeCustomColor={batchEdgeCustomColor}
                colors={colors}
                isDark={isDark}
                setContextMenu={setContextMenu}
                handleToggleEdgeStyle={handleToggleEdgeStyle}
                handleToggleEdgeArrow={handleToggleEdgeArrow}
                handleToggleEdgeStrokePattern={handleToggleEdgeStrokePattern}
                handleReverseEdge={handleReverseEdge}
                handleEdgeColorChange={handleEdgeColorChange}
                handleEdgeLabelChange={handleEdgeLabelChange}
                handleEdgeLabelShapeChange={handleEdgeLabelShapeChange}
                handleSetEdgeAnchorSide={handleSetEdgeAnchorSide}
                handleDeleteEdge={handleDeleteEdge}
                handleBatchSetEdgeStyle={handleBatchSetEdgeStyle}
                handleBatchCycleStrokePattern={handleBatchCycleStrokePattern}
                handleBatchToggleArrow={handleBatchToggleArrow}
                handleBatchSetEdgeColor={handleBatchSetEdgeColor}
                handleBatchDeleteEdges={handleBatchDeleteEdges}
                handleBatchReverseEdges={handleBatchReverseEdges}
                previewBatchEdgeColor={previewBatchEdgeColor}
                previewEdgeColor={previewEdgeColor}
                debounceCommitColorPick={debounceCommitColorPick}
              />
            ) : contextMenu.targetNodeId ? (
              <NodeContextMenu
                data={data}
                contextMenu={contextMenu}
                selectedNodeIds={selectedNodeIds}
                connectedInternalEdges={connectedInternalEdges}
                batchCustomColor={batchCustomColor}
                colors={colors}
                setContextMenu={setContextMenu}
                setSpawnModalState={setSpawnModalState}
                handleAlignSelected={handleAlignSelected}
                handleSpawnConnectedChild={handleSpawnConnectedChild}
                handleDisconnectSelectedNodesEdges={handleDisconnectSelectedNodesEdges}
                handleDisconnectNodeEdges={handleDisconnectNodeEdges}
                handleCopyNodeText={handleCopyNodeText}
                handleCopyNodeWikilink={handleCopyNodeWikilink}
                handleExtractCardToNote={handleExtractCardToNote}
                handleSelectGroupNodes={handleSelectGroupNodes}
                handleFitGroupSize={handleFitGroupSize}
                handleDissolveGroup={handleDissolveGroup}
                handleDeleteGroupWithContents={handleDeleteGroupWithContents}
                handleGroupSelectedNodes={handleGroupSelectedNodes}
                handleResetNodeSize={handleResetNodeSize}
                handleNodeColorChange={handleNodeColorChange}
                handleBatchColorChange={handleBatchColorChange}
                handleDeleteNode={handleDeleteNode}
                handleDeleteSelected={handleDeleteSelected}
                handleDuplicateNode={handleDuplicateNode}
                handleDuplicateSelected={handleDuplicateSelected}
                handleBringToFront={handleBringToFront}
                handleSendToBack={handleSendToBack}
                handleConnectSelectedNodes={handleConnectSelectedNodes}
                handleConnectOneToMany={handleConnectOneToMany}
                handleConnectLoopNodes={handleConnectLoopNodes}
                previewNodeColor={previewNodeColor}
                previewBatchNodeColor={previewBatchNodeColor}
                debounceCommitColorPick={debounceCommitColorPick}
                editable={editable}
                setEditingNodeId={setEditingNodeId}
                setEditingText={setEditingText}
                onExtractToNote={onExtractToNote}
                onOpenFile={onOpenFile}
              />
            ) : (
              // 3. Canvas Background Context Menu
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
                  <span>白板快捷菜单</span>
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

                {editable && (
                  <>
                    <div className="canvas-ctx-section-label">🎯 新建与引入</div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => handleAddTextCard(contextMenu.canvasX, contextMenu.canvasY)}
                    >
                      <Plus size={13} />
                      <span>在此处新建文本卡片</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() =>
                        handlePasteClipboardAsCard(contextMenu.canvasX, contextMenu.canvasY)
                      }
                    >
                      <Clipboard size={13} color="#10b981" />
                      <span>从剪贴板粘贴为卡片</span>
                      <span className="canvas-ctx-shortcut">Ctrl+V</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleTriggerInsertImage(contextMenu.canvasX, contextMenu.canvasY);
                        setContextMenu(null);
                      }}
                    >
                      <ImageIcon size={13} color="#0284c7" />
                      <span>插入图片...</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleTriggerInsertVideo(contextMenu.canvasX, contextMenu.canvasY);
                        setContextMenu(null);
                      }}
                    >
                      <Video size={13} color="#ef4444" />
                      <span>插入视频...</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        handleTriggerInsertAudio(contextMenu.canvasX, contextMenu.canvasY);
                        setContextMenu(null);
                      }}
                    >
                      <Music size={13} color="#a855f7" />
                      <span>插入音频...</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => {
                        setShowFilePicker(true);
                        setContextMenu(null);
                      }}
                    >
                      <FileText size={13} />
                      <span>引入知识库笔记...</span>
                    </div>
                    <div
                      className="canvas-ctx-item"
                      onClick={() => handleAddGroup(contextMenu.canvasX, contextMenu.canvasY)}
                    >
                      <Boxes size={13} />
                      <span>在此处新建分组容器</span>
                    </div>
                    <div className="canvas-ctx-divider" />
                  </>
                )}

                <div className="canvas-ctx-section-label">📐 视图与选择</div>
                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    setIsBoxSelectMode((prev) => !prev);
                    setContextMenu(null);
                  }}
                >
                  <BoxSelect size={13} />
                  <span>{isBoxSelectMode ? "关闭框选模式" : "框选卡片 (Shift+拖动)"}</span>
                </div>

                <div className="canvas-ctx-item" onClick={handleSelectAll}>
                  <CheckSquare size={13} />
                  <span>全选所有卡片</span>
                  <span className="canvas-ctx-shortcut">Ctrl+A</span>
                </div>

                {data.edges.length > 0 && (
                  <div className="canvas-ctx-item" onClick={handleSelectAllEdges}>
                    <Link size={13} color="#0284c7" />
                    <span>全选所有连线 ({data.edges.length} 条)</span>
                  </div>
                )}

                {editable && (
                  <div className="canvas-ctx-item" onClick={handleAlignToGrid}>
                    <Grid size={13} color="#0284c7" />
                    <span>对齐所有卡片到网格 (20px)</span>
                  </div>
                )}

                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    handleZoomToFit();
                    setContextMenu(null);
                  }}
                >
                  <Maximize2 size={13} />
                  <span>自适应全图</span>
                </div>

                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    setViewport((prev) => ({ ...prev, zoom: 1.0 }));
                    setContextMenu(null);
                  }}
                >
                  <ZoomIn size={13} />
                  <span>重置为 100% 缩放</span>
                </div>

                <div className="canvas-ctx-divider" />
                <div className="canvas-ctx-section-label">⚡ 历史与保存</div>

                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    handleUndo();
                    setContextMenu(null);
                  }}
                  style={{ opacity: history.past.length > 0 ? 1 : 0.4 }}
                >
                  <RotateCcw size={13} />
                  <span>撤销上一步</span>
                  <span className="canvas-ctx-shortcut">Ctrl+Z</span>
                </div>

                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    handleRedo();
                    setContextMenu(null);
                  }}
                  style={{ opacity: history.future.length > 0 ? 1 : 0.4 }}
                >
                  <RotateCw size={13} />
                  <span>重做下一步</span>
                  <span className="canvas-ctx-shortcut">Ctrl+Y</span>
                </div>

                {onSave && (
                  <div className="canvas-ctx-item" onClick={handleSave}>
                    <Save size={13} />
                    <span>保存白板</span>
                    <span className="canvas-ctx-shortcut">Ctrl+S</span>
                  </div>
                )}

                <div className="canvas-ctx-divider" />
                <div className="canvas-ctx-section-label">📦 导出与发布</div>

                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    handleOpenExtractModal();
                    setContextMenu(null);
                  }}
                >
                  <BookOpen size={13} color="#10b981" />
                  <span>萃取为长文专著...</span>
                </div>

                <div
                  className="canvas-ctx-item"
                  onClick={() => {
                    setShowExportModal(true);
                    setContextMenu(null);
                  }}
                >
                  <ImageIcon size={13} color="#0284c7" />
                  <span>📸 导出白板为图片...</span>
                </div>
              </>
            )}
          </div>,
          document.body,
        )}

      {/* 9. Floating Toast Feedback */}
      <CanvasToast message={toastMessage} lifted={selectedEdgeIds.size > 1} isDark={isDark} />

      {/* Media preview lightbox (double-click an image / video / audio card) */}
      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />
    </>
  );
}
