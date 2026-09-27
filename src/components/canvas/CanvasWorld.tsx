import { createPortal } from "react-dom";
import {
  type ChangeEvent,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ThemeMode } from "../../core/types";
import type {
  CanvasData,
  CanvasEdge,
  CanvasFileNode,
  CanvasNode,
  CanvasNodeSide,
  CanvasObstacle,
  CanvasViewport,
} from "../../types/canvasTypes";
import type { CanvasThemeColors } from "../../services/canvasTheme";
import { CanvasEdgeLayer } from "./CanvasEdgeLayer";
import { CanvasNodeLayer } from "./CanvasNodeLayer";
import { CanvasEdgeLabelLayer } from "./CanvasEdgeLabelLayer";
import { CanvasMinimap } from "./CanvasMinimap";
import { MarqueeSelectionBox } from "./MarqueeSelectionBox";
import { CanvasEdgeBatchToolbar } from "./CanvasEdgeBatchToolbar";
import { CanvasCardSuggestMenu } from "./CanvasCardSuggestMenu";
import type { CanvasCardSuggestState } from "./CanvasCardView";
import type { ConnectingState } from "./useCanvasConnect";
import type { CanvasSelectionBox } from "./useCanvasSelection";

/**
 * The canvas render tree: the hidden media file inputs, the transformed
 * `.canvas-world` board (edge layer, card layer, edge-label layer), the
 * minimap, the marquee box, the batch edge toolbar and the card-suggestion
 * portal.
 *
 * Extracted from CanvasView (wave 7 of the CanvasView decomposition), which
 * keeps the root container element and the toolbar / overlay / presentation
 * chrome. Everything is threaded as explicit props — no context, no memo —
 * and the JSX (including the inline closures) is carried over verbatim.
 *
 * CanvasView mounts this AFTER CanvasOverlayMenus. Every overlay child here
 * carries a distinct z-index (marquee 80, minimap 90, batch toolbar 1000,
 * suggest portal 10001) while the modal stack the overlay renders sits at
 * 200/1100/99999, so paint order is z-index-determined and the sibling
 * reorder is not observable.
 */
type CanvasWorldProps = {
  theme: ThemeMode;
  colors: CanvasThemeColors;
  isDark: boolean;
  isEink: boolean;
  editable: boolean;
  /** The board. */
  data: CanvasData;
  /** Node id → node lookup. */
  nodeMap: Map<string, CanvasNode>;
  /** The camera transform. */
  viewport: CanvasViewport;
  isPresentationMode: boolean;
  presentationSequence: string[];
  currentSlideIndex: number;
  // ── Interaction state ────────────────────────────────────────────────────
  hoveredNodeId: string | null;
  setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  selectedEdgeIds: Set<string>;
  setSelectedEdgeIds: Dispatch<SetStateAction<Set<string>>>;
  editingNodeId: string | null;
  setEditingNodeId: Dispatch<SetStateAction<string | null>>;
  editingText: string;
  setEditingText: Dispatch<SetStateAction<string>>;
  editingEdgeId: string | null;
  setEditingEdgeId: Dispatch<SetStateAction<string | null>>;
  editingEdgeLabel: string;
  setEditingEdgeLabel: Dispatch<SetStateAction<string>>;
  connectingState: ConnectingState | null;
  // ── Derived geometry (from useCanvasDerived) ─────────────────────────────
  canvasObstacles: CanvasObstacle[];
  sourceDisplayColorMap: Map<string, string>;
  isEdgeInViewport: (edge: CanvasEdge, from: CanvasNode, to: CanvasNode) => boolean;
  isNodeInViewport: (node: CanvasNode) => boolean;
  nodeOutgoingMap: Map<string, { count: number; color?: string; targets: string[] }>;
  currentMultiRootNode: CanvasNode | undefined;
  // ── Selection / suggest refs & state ─────────────────────────────────────
  hasDraggedRef: RefObject<boolean>;
  selectionBox: CanvasSelectionBox | null;
  cardSuggest: CanvasCardSuggestState | null;
  setCardSuggest: Dispatch<SetStateAction<CanvasCardSuggestState | null>>;
  cardEditorRef: RefObject<HTMLTextAreaElement | null>;
  // ── File wiring ──────────────────────────────────────────────────────────
  currentFilePath: string | undefined;
  onOpenFile: ((filePath: string) => void) | undefined;
  // ── Selection shorthand writers ──────────────────────────────────────────
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  // ── Node-gesture / connect / pointer handlers ────────────────────────────
  handleNodeDragStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleNodeResizeStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleAnchorMouseDown: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleAnchorMouseUp: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleCardMouseUpForConnect: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleStepBendMouseDown: (
    e: ReactMouseEvent,
    edgeId: string,
    orientation: "horizontal" | "vertical",
    offset: number,
  ) => void;
  handleResetEdgeStepOffset: (edgeId: string) => void;
  handleCardBodyActivate: (event: ReactMouseEvent<HTMLDivElement>) => void;
  // ── Context-menu openers & edge mutations ────────────────────────────────
  handleContextMenuNode: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleContextMenuEdge: (e: ReactMouseEvent, edge: CanvasEdge) => void;
  handleSaveEdgeLabel: () => void;
  handleCycleEdgeAnchor: (edgeId: string, end: "fromSide" | "toSide") => void;
  // ── Presentation & card ops ──────────────────────────────────────────────
  handleJumpToSlide: (index: number) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDuplicateNode: (nodeId: string) => void;
  handleNodeColorChange: (nodeId: string, color: string) => void;
  handleSaveNodeEdit: () => void;
  handleSave: () => void;
  handleCardEditorChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  moveCardSuggest: (delta: number) => void;
  pickCardSuggest: (index: number) => void;
  openMediaPreview: (node: CanvasFileNode) => void;
  // ── Batch edge toolbar ops ───────────────────────────────────────────────
  handleBatchSetEdgeStyle: (style: "bezier" | "step" | "straight") => void;
  handleBatchCycleStrokePattern: () => void;
  handleBatchToggleArrow: () => void;
  handleBatchReverseEdges: () => void;
  handleBatchSetEdgeColor: (colorKey: string) => void;
  handleBatchDeleteEdges: () => void;
  // ── Minimap projection (from useCanvasDerived) ───────────────────────────
  minimapBBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  minimapScale: number;
  minimapOffsetX: number;
  minimapOffsetY: number;
  containerRef: RefObject<HTMLDivElement | null>;
  handleMinimapNavigate: (canvasX: number, canvasY: number) => void;
  // ── Hidden media inputs (from useCanvasMediaClipboard) ───────────────────
  mediaFileInputRef: RefObject<HTMLInputElement | null>;
  imageFileInputRef: RefObject<HTMLInputElement | null>;
  videoFileInputRef: RefObject<HTMLInputElement | null>;
  audioFileInputRef: RefObject<HTMLInputElement | null>;
  handleMediaFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function CanvasWorld({
  theme,
  colors,
  isDark,
  isEink,
  editable,
  data,
  nodeMap,
  viewport,
  isPresentationMode,
  presentationSequence,
  currentSlideIndex,
  hoveredNodeId,
  setHoveredNodeId,
  selectedNodeIds,
  setSelectedNodeIds,
  selectedEdgeIds,
  setSelectedEdgeIds,
  editingNodeId,
  setEditingNodeId,
  editingText,
  setEditingText,
  editingEdgeId,
  setEditingEdgeId,
  editingEdgeLabel,
  setEditingEdgeLabel,
  connectingState,
  canvasObstacles,
  sourceDisplayColorMap,
  isEdgeInViewport,
  isNodeInViewport,
  nodeOutgoingMap,
  currentMultiRootNode,
  hasDraggedRef,
  selectionBox,
  cardSuggest,
  setCardSuggest,
  cardEditorRef,
  currentFilePath,
  onOpenFile,
  setSelectedNodeId,
  setSelectedEdgeId,
  handleNodeDragStart,
  handleNodeResizeStart,
  handleAnchorMouseDown,
  handleAnchorMouseUp,
  handleCardMouseUpForConnect,
  handleStepBendMouseDown,
  handleResetEdgeStepOffset,
  handleCardBodyActivate,
  handleContextMenuNode,
  handleContextMenuEdge,
  handleSaveEdgeLabel,
  handleCycleEdgeAnchor,
  handleJumpToSlide,
  handleDeleteNode,
  handleDuplicateNode,
  handleNodeColorChange,
  handleSaveNodeEdit,
  handleSave,
  handleCardEditorChange,
  moveCardSuggest,
  pickCardSuggest,
  openMediaPreview,
  handleBatchSetEdgeStyle,
  handleBatchCycleStrokePattern,
  handleBatchToggleArrow,
  handleBatchReverseEdges,
  handleBatchSetEdgeColor,
  handleBatchDeleteEdges,
  minimapBBox,
  minimapScale,
  minimapOffsetX,
  minimapOffsetY,
  containerRef,
  handleMinimapNavigate,
  mediaFileInputRef,
  imageFileInputRef,
  videoFileInputRef,
  audioFileInputRef,
  handleMediaFileInputChange,
}: CanvasWorldProps) {
  return (
    <>
      {/* Hidden file input for multimodal media insertion */}
      <input
        type="file"
        ref={mediaFileInputRef}
        accept="image/*,audio/*,video/*,application/pdf"
        style={{ display: "none" }}
        onChange={handleMediaFileInputChange}
        multiple
      />

      {/* Per-modality inputs so the context menu can pre-filter the file
          dialog to exactly the kind of media the user asked for. */}
      <input
        type="file"
        ref={imageFileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleMediaFileInputChange}
        multiple
      />
      <input
        type="file"
        ref={videoFileInputRef}
        accept="video/*"
        style={{ display: "none" }}
        onChange={handleMediaFileInputChange}
        multiple
      />
      <input
        type="file"
        ref={audioFileInputRef}
        accept="audio/*"
        style={{ display: "none" }}
        onChange={handleMediaFileInputChange}
        multiple
      />

      {/* 2. INFINITE CANVAS 2D TRANSFORM VIEWPORT (Hardware accelerated) */}
      <div
        className="canvas-world"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          transition: isPresentationMode
            ? "transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1)"
            : undefined,
          backgroundImage: `radial-gradient(${colors.dotColor} 1.2px, transparent 1.2px)`,
          backgroundSize: "28px 28px",
          backfaceVisibility: "hidden",
        }}
      >
        {/* SVG EDGES LAYER (Optimized backing store to release GPU/memory pressure)
            zIndex stays BELOW the card layers: even when a connector's geometry
            passes over a card, the card (and its text) paints on top, so lines
            never cover labels or titles. */}
        <CanvasEdgeLayer
          edges={data.edges}
          nodes={data.nodes}
          nodeMap={nodeMap}
          obstacles={canvasObstacles}
          selectedEdgeIds={selectedEdgeIds}
          hoveredNodeId={hoveredNodeId}
          connecting={connectingState}
          editable={editable}
          isDark={isDark}
          isEink={isEink}
          colorMap={sourceDisplayColorMap}
          colors={colors}
          presentation={{
            active: isPresentationMode,
            sequence: presentationSequence,
            index: currentSlideIndex,
          }}
          isInViewport={isEdgeInViewport}
          onSelectEdge={setSelectedEdgeIds}
          onClearNodeSelection={() => setSelectedNodeIds(new Set())}
          onStartEditingLabel={(edgeId) => {
            setEditingEdgeId(edgeId);
            setEditingEdgeLabel(data.edges.find((e) => e.id === edgeId)?.label || "");
          }}
          onContextMenu={handleContextMenuEdge}
          onCycleAnchor={handleCycleEdgeAnchor}
          onStepBendMouseDown={handleStepBendMouseDown}
          onResetStepOffset={handleResetEdgeStepOffset}
        />

        {/* 3. MULTIMODAL CARDS LAYER — the per-node JSX (group hull / card
            chrome) lives in the extracted node-layer views (wave 3 of the
            CanvasView decomposition); the layer itself owns the map and the
            branch dispatch. */}
        <CanvasNodeLayer
          nodes={data.nodes}
          editable={editable}
          colors={colors}
          isDark={isDark}
          isEink={isEink}
          selectedNodeIds={selectedNodeIds}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          editingNodeId={editingNodeId}
          editingText={editingText}
          setEditingNodeId={setEditingNodeId}
          setEditingText={setEditingText}
          connectingState={connectingState}
          isPresentationMode={isPresentationMode}
          presentationSequence={presentationSequence}
          currentSlideIndex={currentSlideIndex}
          nodeMap={nodeMap}
          nodeOutgoingMap={nodeOutgoingMap}
          currentMultiRootNode={currentMultiRootNode}
          sourceDisplayColorMap={sourceDisplayColorMap}
          isNodeInViewport={isNodeInViewport}
          hasDraggedRef={hasDraggedRef}
          cardSuggest={cardSuggest}
          setCardSuggest={setCardSuggest}
          cardEditorRef={cardEditorRef}
          currentFilePath={currentFilePath}
          onOpenFile={onOpenFile}
          setSelectedNodeId={setSelectedNodeId}
          setSelectedEdgeId={setSelectedEdgeId}
          handleNodeDragStart={handleNodeDragStart}
          handleNodeResizeStart={handleNodeResizeStart}
          handleAnchorMouseDown={handleAnchorMouseDown}
          handleAnchorMouseUp={handleAnchorMouseUp}
          handleCardMouseUpForConnect={handleCardMouseUpForConnect}
          handleContextMenuNode={handleContextMenuNode}
          handleJumpToSlide={handleJumpToSlide}
          handleDeleteNode={handleDeleteNode}
          handleDuplicateNode={handleDuplicateNode}
          handleNodeColorChange={handleNodeColorChange}
          handleSaveNodeEdit={handleSaveNodeEdit}
          handleSave={handleSave}
          handleCardEditorChange={handleCardEditorChange}
          moveCardSuggest={moveCardSuggest}
          pickCardSuggest={pickCardSuggest}
          handleCardBodyActivate={handleCardBodyActivate}
          openMediaPreview={openMediaPreview}
        />

        {/* 4. EDGE LABELS OVERLAY LAYER (z-index: 25 - never occluded by cards) */}
        <CanvasEdgeLabelLayer
          edges={data.edges}
          nodes={data.nodes}
          nodeMap={nodeMap}
          obstacles={canvasObstacles}
          selectedEdgeIds={selectedEdgeIds}
          editingEdgeId={editingEdgeId}
          editingLabel={editingEdgeLabel}
          onEditingLabelChange={setEditingEdgeLabel}
          onStartEditing={(edgeId) => {
            setEditingEdgeId(edgeId);
            setEditingEdgeLabel(data.edges.find((e) => e.id === edgeId)?.label || "");
          }}
          onStopEditing={() => setEditingEdgeId(null)}
          onSelectionChange={setSelectedEdgeIds}
          onClearNodeSelection={() => setSelectedNodeIds(new Set())}
          onSaveLabel={handleSaveEdgeLabel}
          onContextMenu={handleContextMenuEdge}
          isInViewport={isEdgeInViewport}
          colorMap={sourceDisplayColorMap}
          colors={colors}
          isDark={isDark}
          presentation={{
            active: isPresentationMode,
            sequence: presentationSequence,
            index: currentSlideIndex,
          }}
        />
      </div>

      {/* 5. BOTTOM-RIGHT INTERACTIVE MINIMAP */}
      <CanvasMinimap
        data={data}
        viewport={viewport}
        theme={theme}
        isDark={isDark}
        colors={colors}
        nodeMap={nodeMap}
        selectedNodeIds={selectedNodeIds}
        bounds={minimapBBox}
        scale={minimapScale}
        offsetX={minimapOffsetX}
        offsetY={minimapOffsetY}
        containerEl={containerRef.current}
        onNavigate={handleMinimapNavigate}
      />

      {/* 7. MARQUEE SELECTION BOX */}
      <MarqueeSelectionBox box={selectionBox} viewport={viewport} />

      {/* 8.5 Floating Batch Toolbar for Multiple Selected Edges */}
      {selectedEdgeIds.size > 1 && (
        <CanvasEdgeBatchToolbar
          count={selectedEdgeIds.size}
          theme={theme}
          isDark={isDark}
          colors={colors}
          onSetStyle={handleBatchSetEdgeStyle}
          onCycleStrokePattern={handleBatchCycleStrokePattern}
          onToggleArrow={handleBatchToggleArrow}
          onReverse={handleBatchReverseEdges}
          onSetColor={handleBatchSetEdgeColor}
          onDelete={handleBatchDeleteEdges}
          onClear={() => setSelectedEdgeIds(new Set())}
        />
      )}

      {/* 8.6 Suggestion popup for the card editor (`[[` for a note, `/` for a
          command). Through a portal, because the card lives inside the
          transformed canvas world and a popup drawn there would be scaled and
          clipped with it. */}
      {cardSuggest &&
        typeof document !== "undefined" &&
        createPortal(
          <CanvasCardSuggestMenu
            header={
              cardSuggest.kind === "note"
                ? `引用笔记${cardSuggest.query ? `：${cardSuggest.query}` : ""}`
                : undefined
            }
            items={cardSuggest.items}
            selectedIndex={cardSuggest.selectedIndex}
            emptyText={cardSuggest.kind === "note" ? "没有匹配的笔记" : "没有匹配的命令"}
            x={cardSuggest.x}
            y={cardSuggest.y}
            colors={colors}
            isDark={isDark}
            isEink={isEink}
            onPick={pickCardSuggest}
            onHover={(index) =>
              setCardSuggest((prev) => (prev ? { ...prev, selectedIndex: index } : prev))
            }
          />,
          document.body,
        )}
    </>
  );
}
