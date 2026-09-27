import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useCanvasAppearance } from "./canvas/useCanvasAppearance";
import type { LightboxMedia } from "./MediaLightbox";
// The render tree below the root container — the hidden media inputs, the
// transformed board world, the minimap, the marquee box, the batch edge
// toolbar and the card-suggestion portal — extracted in wave 7.
import { CanvasWorld } from "./canvas/CanvasWorld";
// Document (data/history/save) and camera (viewport/wheel) state domains,
// extracted during the wave-1 CanvasView decomposition.
import { useCanvasDocument } from "./canvas/useCanvasDocument";
import { useCanvasViewport } from "./canvas/useCanvasViewport";
// Selection, node-gesture, connect and pointer domains, extracted during the
// wave-2 CanvasView decomposition.
import { useCanvasSelection } from "./canvas/useCanvasSelection";
import { useCanvasNodeDrag } from "./canvas/useCanvasNodeDrag";
import { useCanvasConnect } from "./canvas/useCanvasConnect";
import { useCanvasPointer } from "./canvas/useCanvasPointer";
import { useCanvasCardBodyActivation } from "./canvas/useCanvasCardBodyActivation";
// Node CRUD, edge mutations and media/clipboard IO domains, extracted during
// the wave-5 CanvasView decomposition.
import { useCanvasNodeOps } from "./canvas/useCanvasNodeOps";
import { useCanvasEdgeOps } from "./canvas/useCanvasEdgeOps";
import { useCanvasMediaClipboard } from "./canvas/useCanvasMediaClipboard";
// The in-card suggestion engine, the context-menu domain, the export/extract
// domain and the derived geometry memos, extracted during the wave-6
// CanvasView decomposition.
import { useCanvasCardSuggest } from "./canvas/useCanvasCardSuggest";
import { useCanvasContextMenu } from "./canvas/useCanvasContextMenu";
import { useCanvasExportExtract } from "./canvas/useCanvasExportExtract";
import { useCanvasDerived } from "./canvas/useCanvasDerived";
// The keyboard domain (the global shortcut handler and the Escape priority
// chain), extracted during the wave-7 CanvasView decomposition.
import { useCanvasKeyboard } from "./canvas/useCanvasKeyboard";
// The presentation domain hook (wave 4) and CanvasChrome — the mount point of
// the toolbar / overlay / presentation-chrome satellites (final trim wave).
import { useCanvasPresentation } from "./canvas/useCanvasPresentation";
import type { CanvasContextMenuState } from "./canvas/CanvasOverlayMenus";
import { CanvasChrome } from "./canvas/CanvasChrome";
import type { CanvasViewProps } from "./canvas/canvasViewProps";

export type { CanvasViewProps };

// getNodePalette now lives in ./canvas/canvasPalette so the minimap and the
// node layer share one definition (imported at the top).

// renderEdgeShapeIcon now lives in ./canvas/canvasEdgeIcons (imported at the
// top) so the extracted edge context menu can use it.

// CanvasCardMarkdown (the memoised rendered-Markdown card body) now lives in
// ./canvas/CanvasCardView with its memo wrapper and props unchanged, so the
// card body still stays out of the parent's render path.

export const CanvasView = memo(function CanvasView({
  title,
  source = "",
  onSourceChange,
  editable = true,
  theme = "twitter",
  onClose,
  allChapters = [],
  onOpenFile,
  onExtractToNote,
  onSave,
  isDirty = false,
  isSaving = false,
  currentFilePath,
  isFullscreen,
  onToggleFullscreen,
}: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Theme-aware design tokens and the responsive flag (extracted hook; the
  // final trim wave).
  const { colors, isDark, isEink, isNarrow } = useCanvasAppearance({ theme, containerRef });

  // Card text editing — the draft lives here, mirrored into refs so the
  // document hook's save paths can commit it without re-subscribing on
  // every keystroke.
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const editingNodeIdRef = useRef<string | null>(null);
  editingNodeIdRef.current = editingNodeId;
  const editingTextRef = useRef<string>("");
  editingTextRef.current = editingText;

  // Render-current mirrors of the selection sets. The document hook's colour
  // preview helpers read these at call time: useCanvasDocument runs before
  // useCanvasSelection produces the sets themselves (the selection hook needs
  // data.edges from the document hook, so the two cannot be reordered), so the
  // sets are mirrored into refs right after the selection hook returns.
  const selectedNodeIdsRef = useRef<Set<string>>(new Set());
  const selectedEdgeIdsRef = useRef<Set<string>>(new Set());

  // Right-click context menu state
  // `x`/`y` are viewport coordinates (pageX/pageY) used to render the menu via
  // a fixed-positioned portal. The menu is intentionally rendered at the
  // document body level so it can never be clipped by the canvas container's
  // `overflow: hidden` or any ancestor that would otherwise occlude it.
  // The menu domain itself (clamping, dismissal, openers — and the toolbar's
  // align dropdown since the final trim wave) lives in useCanvasContextMenu;
  // only this state stays here because useCanvasDocument's save path consumes
  // setContextMenu before that hook's other dependencies exist.
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Document domain: board state, source sync, history, save paths and the
  // colour-picker snapshot/commit/preview machinery (extracted hook; the
  // preview callbacks moved beside the commit machinery in wave 7).
  const {
    data,
    setData,
    latestDataRef,
    history,
    emitChange,
    pushHistory,
    handleUndo,
    handleRedo,
    handleSaveNodeEdit,
    handleSave,
    debounceCommitColorPick,
    previewBatchNodeColor,
    previewBatchEdgeColor,
    previewEdgeColor,
    previewNodeColor,
  } = useCanvasDocument({
    source,
    title,
    onSourceChange,
    onSave,
    editingNodeIdRef,
    editingTextRef,
    setEditingNodeId,
    setContextMenu,
    editable,
    selectedNodeIdsRef,
    selectedEdgeIdsRef,
  });

  // Camera domain: viewport state and the zoom/wheel/minimap handlers
  // (extracted hook).
  const {
    viewport,
    setViewport,
    viewportRef,
    rafWheelIdRef,
    handleZoom,
    handleZoomToFit,
    handleMinimapNavigate,
    handleWheel,
  } = useCanvasViewport({ containerRef, nodes: data.nodes });

  // Selection domain: multi-select state, the marquee box-selection gesture
  // and the marquee hit tests (extracted hook).
  const {
    selectedNodeIds,
    setSelectedNodeIds,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeIds,
    setSelectedEdgeIds,
    selectedEdgeId,
    setSelectedEdgeId,
    connectedInternalEdges,
    isBoxSelectMode,
    setIsBoxSelectMode,
    selectionBox,
    setSelectionBox,
    selectionBoxRef,
    hasDraggedRef,
    baseSelectionBeforeBoxRef,
    baseEdgeSelectionBeforeBoxRef,
    handleStartBoxSelection,
  } = useCanvasSelection({ containerRef, viewportRef, edges: data.edges });

  // Keep the mirrors the document hook's colour previews read exactly in step
  // with the committed selection (assigned during render, like editingTextRef).
  selectedNodeIdsRef.current = selectedNodeIds;
  selectedEdgeIdsRef.current = selectedEdgeIds;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // The in-card suggestion engine (`[[` notes, `/` commands): the popup state,
  // trigger detection and insertions (extracted hook, wave 6). The textarea's
  // keydown wiring stays in the card JSX and the menu portal stays below; the
  // editor draft (editingText) itself stays here because the document hook's
  // save paths commit it.
  const {
    cardSuggest,
    setCardSuggest,
    cardEditorRef,
    handleCardEditorChange,
    pickCardSuggest,
    moveCardSuggest,
  } = useCanvasCardSuggest({ allChapters, editingText, setEditingText });

  // The media file-input refs and the media-insert position ref moved into
  // useCanvasMediaClipboard (wave 5); this component attaches the returned refs
  // to the hidden inputs further down.
  /** Media preview opened by double-clicking an image / video / audio card. */
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);

  // Edge label editing state
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingEdgeLabel, setEditingEdgeLabel] = useState("");

  // Modals & Panels
  // (The file picker's search draft moved into CanvasOverlayMenus in wave 4 —
  // only its wiring read or wrote it. The extract/export modal states moved
  // into useCanvasExportExtract in wave 6; showFilePicker stays here because
  // the node-ops domain (add-file-card) and the toolbar also write it.)
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [spawnModalState, setSpawnModalState] = useState<{
    nodeId: string;
    count: number;
    direction: "right" | "bottom";
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2200);
  }, []);

  // Extract-to-note and image-export modal state and actions (extracted hook,
  // wave 6). The toast stays above because six other hooks also raise it.
  const {
    showExtractModal,
    setShowExtractModal,
    extractedMarkdown,
    copiedNotification,
    showExportModal,
    setShowExportModal,
    exportFormat,
    setExportFormat,
    exportBg,
    setExportBg,
    isExporting,
    exportCopyFeedback,
    handleOpenExtractModal,
    handleCopyExtracted,
    handleSaveAsNote,
    handleDownloadExport,
    handleCopyExport,
  } = useCanvasExportExtract({ data, title, theme, showToast, onExtractToNote });

  // Node id → node lookup. Declared before the presentation hook (which reads
  // it to frame slides) and before the gesture hooks; previously it lived
  // further down among the other derived maps.
  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  // Presentation domain: slide-sequence state, camera framing, autoplay,
  // fullscreen and the F5 / slide-navigation keys (extracted hook, wave 4).
  const {
    isPresentationMode,
    currentSlideIndex,
    isAutoPlaying,
    showSlideDrawer,
    isFullscreenActive,
    setIsAutoPlaying,
    setShowSlideDrawer,
    slideDrawerRef,
    presentationSequence,
    handleJumpToSlide,
    handleTogglePresentation,
    handleNextSlide,
    handlePrevSlide,
    handleToggleFullscreen,
  } = useCanvasPresentation({
    containerRef,
    data,
    nodeMap,
    viewport,
    setViewport,
    selectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedNodeId,
    isFullscreen,
    onToggleFullscreen,
    showToast,
  });

  // Right-click context-menu domain: the position clamp, the dismissal paths
  // and the three openers (extracted hook, wave 6). The menu state itself
  // stays above — useCanvasDocument's save path consumes setContextMenu before
  // this hook's other dependencies exist.
  const {
    handleContextMenuCanvas,
    handleContextMenuNode,
    handleContextMenuEdge,
    handleSaveEdgeLabel,
    showAlignMenu,
    setShowAlignMenu,
  } = useCanvasContextMenu({
    contextMenu,
    setContextMenu,
    contextMenuRef,
    containerRef,
    viewportRef,
    isPresentationMode,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedEdgeIds,
    setSelectedEdgeIds,
    latestDataRef,
    pushHistory,
    editingEdgeId,
    editingEdgeLabel,
    setEditingEdgeId,
  });

  // Node gesture starts: what a mousedown on a card means — plain drag,
  // collaborative multi-drag, grid/ring re-flow, group scoop, resize — written
  // into the drag-state refs the pointer listeners consume (extracted hook).
  const {
    nodeDragRef,
    resizeDragRef,
    freshGroupIdsRef,
    handleNodeDragStart,
    handleNodeResizeStart,
  } = useCanvasNodeDrag({
    isPresentationMode,
    latestDataRef,
    editingNodeIdRef,
    handleSaveNodeEdit,
    setContextMenu,
    isBoxSelectMode,
    handleStartBoxSelection,
    hasDraggedRef,
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedEdgeId,
  });

  // Connect / step-bend subsystem: anchor-press connection drags, the batch
  // connection builders, branch spawning and the step-bend handle
  // (extracted hook).
  const {
    connectingState,
    connectingStateRef,
    rafConnectIdRef,
    latestConnectPosRef,
    stepBendDragRef,
    setConnectingState,
    handleAnchorMouseDown,
    handleAnchorMouseUp,
    handleCardMouseUpForConnect,
    handleStepBendMouseDown,
    handleResetEdgeStepOffset,
    handleConnectSelectedNodes,
    handleConnectOneToMany,
    handleConnectLoopNodes,
    handleConfirmBatchSpawn,
    handleSpawnConnectedChild,
  } = useCanvasConnect({
    editable,
    isPresentationMode,
    nodes: data.nodes,
    latestDataRef,
    pushHistory,
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedEdgeId,
    setEditingNodeId,
    setEditingText,
    setContextMenu,
    spawnModalState,
    setSpawnModalState,
    showToast,
  });

  // Pointer system: the single global mousemove/mouseup pair that multiplexes
  // step-bend, group drag, marquee, pan, node drag, resize and connect, with
  // the shared rAF-throttling refs (extracted hook). The background-mousedown
  // handler (pan / box-select / group grab / presentation tap) moved there too
  // in the final trim wave — it arms exactly the drag refs that hook owns.
  const { handleMouseDownBackground } = useCanvasPointer({
    containerRef,
    latestDataRef,
    setData,
    pushHistory,
    emitChange,
    setViewport,
    viewportRef,
    rafWheelIdRef,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    hasDraggedRef,
    selectionBoxRef,
    setSelectionBox,
    baseSelectionBeforeBoxRef,
    baseEdgeSelectionBeforeBoxRef,
    nodeDragRef,
    resizeDragRef,
    connectingStateRef,
    setConnectingState,
    rafConnectIdRef,
    latestConnectPosRef,
    stepBendDragRef,
    isPresentationMode,
    // Background-mousedown inputs (final trim wave):
    setContextMenu,
    editingNodeIdRef,
    handleSaveNodeEdit,
    viewport,
    isBoxSelectMode,
    handleStartBoxSelection,
    selectedNodeIds,
    showSlideDrawer,
    setShowSlideDrawer,
  });

  // What a press on a rendered card body means — wikilink open + checkbox
  // toggle. Its own hook since the final trim wave (it was in useCanvasPointer,
  // which multiplexes drags; this belongs to the card, not the drag system).
  const { handleCardBodyActivate } = useCanvasCardBodyActivation({
    allChapters,
    onOpenFile,
    latestDataRef,
    pushHistory,
    showToast,
  });

  // Node CRUD / arrangement domain: card, group and clipboard-text operations
  // (extracted hook, wave 5).
  const {
    handleAddTextCard,
    handleAddFileCard,
    handleAddGroup,
    handleDeleteNode,
    handleDeleteSelected,
    handleDuplicateNode,
    handleDuplicateSelected,
    handleSelectAll,
    handleBatchColorChange,
    handleBringToFront,
    handleSendToBack,
    handleAlignSelected,
    handleGroupSelectedNodes,
    handleResetNodeSize,
    handleCopyNodeText,
    handleCopyNodeWikilink,
    handleExtractCardToNote,
    handleSelectGroupNodes,
    handleFitGroupSize,
    handleDissolveGroup,
    handleDeleteGroupWithContents,
    handleAlignToGrid,
  } = useCanvasNodeOps({
    editable,
    viewport,
    data,
    latestDataRef,
    pushHistory,
    handleSaveNodeEdit,
    editingNodeIdRef,
    freshGroupIdsRef,
    selectedNodeIds,
    selectedNodeId,
    setSelectedNodeIds,
    setSelectedNodeId,
    setEditingNodeId,
    setContextMenu,
    setShowFilePicker,
    showToast,
    onExtractToNote,
  });

  // Single-edge and batch-edge mutation domain (extracted hook, wave 5).
  const {
    handleDeleteEdge,
    handleBatchDeleteEdges,
    handleBatchSetEdgeStyle,
    handleBatchCycleStrokePattern,
    handleBatchToggleArrow,
    handleBatchSetEdgeColor,
    handleBatchReverseEdges,
    handleSelectAllEdges,
    handleDisconnectSelectedNodesEdges,
    handleNodeColorChange,
    handleToggleEdgeStyle,
    handleToggleEdgeArrow,
    handleReverseEdge,
    handleEdgeColorChange,
    handleEdgeLabelChange,
    handleEdgeLabelShapeChange,
    handleSetEdgeAnchorSide,
    handleCycleEdgeAnchor,
    handleToggleEdgeStrokePattern,
    handleDisconnectNodeEdges,
  } = useCanvasEdgeOps({
    editable,
    data,
    latestDataRef,
    pushHistory,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedEdgeIds,
    setSelectedEdgeIds,
    editingEdgeId,
    setEditingEdgeId,
    setContextMenu,
    showToast,
  });

  // Multimodal media insertion, clipboard paste and drag-and-drop IO domain
  // (extracted hook, wave 5). The hidden <input> elements stay in this
  // component's JSX; their refs come from the hook.
  const {
    mediaFileInputRef,
    imageFileInputRef,
    videoFileInputRef,
    audioFileInputRef,
    handlePasteClipboardAsCard,
    handleTriggerInsertMedia,
    handleTriggerInsertImage,
    handleTriggerInsertVideo,
    handleTriggerInsertAudio,
    handleMediaFileInputChange,
    handleDragOver,
    handleCanvasDrop,
    openMediaPreview,
  } = useCanvasMediaClipboard({
    editable,
    viewport,
    containerRef,
    viewportRef,
    latestDataRef,
    pushHistory,
    setSelectedNodeIds,
    setSelectedNodeId,
    setContextMenu,
    setLightboxMedia,
    showToast,
    currentFilePath,
    editingNodeId,
    editingEdgeId,
  });

  // Derived geometry: minimap box/scale, frustum-culling bounds and tests,
  // node/edge relationship maps, multi-selection root and the batch
  // colour-picker seeds (extracted hook, wave 6; a separate file rather than
  // an extension of useCanvasViewport because these memos read the selection,
  // editing, hover and connect state).
  const {
    canvasObstacles,
    minimapBBox,
    minimapScale,
    minimapOffsetX,
    minimapOffsetY,
    nodeOutgoingMap,
    sourceDisplayColorMap,
    currentMultiRootNode,
    currentMultiRootTitle,
    isNodeInViewport,
    isEdgeInViewport,
    batchCustomColor,
    batchEdgeCustomColor,
  } = useCanvasDerived({
    data,
    viewport,
    containerRef,
    selectedNodeIds,
    selectedEdgeIds,
    editingNodeId,
    editingEdgeId,
    hoveredNodeId,
    connectingState,
  });

  // Keyboard domain: the global shortcut handler (Ctrl+S/A/D/Z/Y, Delete, R,
  // Tab, Enter, Escape) and the Escape priority chain (extracted hook, wave
  // 7). The hook registers the Escape chain first, then the shortcuts — the
  // same listener order as before the extraction.
  useCanvasKeyboard({
    editable,
    editingNodeId,
    editingEdgeId,
    selectedNodeId,
    selectedNodeIds,
    selectedEdgeId,
    selectedEdgeIds,
    nodes: data.nodes,
    handleSave,
    handleUndo,
    handleRedo,
    handleSelectAll,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleDeleteEdge,
    handleBatchDeleteEdges,
    handleReverseEdge,
    handleBatchReverseEdges,
    handleSpawnConnectedChild,
    setEditingNodeId,
    setEditingText,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    setContextMenu,
    setIsBoxSelectMode,
    selectionBoxRef,
    setSelectionBox,
    contextMenu,
    showSlideDrawer,
    setShowSlideDrawer,
    showExtractModal,
    setShowExtractModal,
    showExportModal,
    setShowExportModal,
    showFilePicker,
    setShowFilePicker,
    isPresentationMode,
    handleTogglePresentation,
    isFullscreenActive,
    handleToggleFullscreen,
  });

  return (
    <div
      ref={containerRef}
      className={`knowspace-canvas-view theme-${theme} ${isNarrow ? "is-narrow" : ""} ${isPresentationMode ? "presentation-active" : ""}`}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: colors.canvasBg,
        userSelect: "none",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDownBackground}
      onContextMenu={handleContextMenuCanvas}
      onDragOver={handleDragOver}
      onDrop={handleCanvasDrop}
    >
      {/* 1-10. THE CHROME — the floating toolbar, the overlay menus and the
          presentation controls now mount inside ./canvas/CanvasChrome (final
          trim wave); this call only composes their bundles from the hook
          values above. The world below passes through as children, so every
          sibling keeps its exact position: toolbar + overlay render before it
          and the presentation chrome after it. */}
      <CanvasChrome
        showPresentation={isPresentationMode && presentationSequence.length > 0}
        toolbar={{
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
          nodes: data.nodes,
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
        }}
        overlay={{
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
        }}
        presentation={{
          nodes: data.nodes,
          nodeMap,
          presentationSequence,
          currentSlideIndex,
          isAutoPlaying,
          setIsAutoPlaying,
          showSlideDrawer,
          setShowSlideDrawer,
          slideDrawerRef,
          isFullscreenActive,
          handleToggleFullscreen,
          handleTogglePresentation,
          handlePrevSlide,
          handleNextSlide,
          handleJumpToSlide,
          colors,
          isDark,
          isEink,
        }}
      >
        {/* 2-8.6. THE CANVAS WORLD — the hidden media inputs, the transformed
          board (edges, cards, edge labels), the minimap, the marquee box, the
          batch edge toolbar and the card-suggestion portal (extracted
          component, wave 7). Mounted after the overlay on purpose: every child
          of the world carries its own z-index (marquee 80, minimap 90, batch
          toolbar 1000, suggest portal 10001) against the overlay's
          200/1100/99999 stack, so paint order stays z-index-determined and the
          sibling reorder is not observable. */}
        <CanvasWorld
          theme={theme}
          colors={colors}
          isDark={isDark}
          isEink={isEink}
          editable={editable}
          data={data}
          nodeMap={nodeMap}
          viewport={viewport}
          isPresentationMode={isPresentationMode}
          presentationSequence={presentationSequence}
          currentSlideIndex={currentSlideIndex}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          selectedNodeIds={selectedNodeIds}
          setSelectedNodeIds={setSelectedNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          setSelectedEdgeIds={setSelectedEdgeIds}
          editingNodeId={editingNodeId}
          setEditingNodeId={setEditingNodeId}
          editingText={editingText}
          setEditingText={setEditingText}
          editingEdgeId={editingEdgeId}
          setEditingEdgeId={setEditingEdgeId}
          editingEdgeLabel={editingEdgeLabel}
          setEditingEdgeLabel={setEditingEdgeLabel}
          connectingState={connectingState}
          canvasObstacles={canvasObstacles}
          sourceDisplayColorMap={sourceDisplayColorMap}
          isEdgeInViewport={isEdgeInViewport}
          isNodeInViewport={isNodeInViewport}
          nodeOutgoingMap={nodeOutgoingMap}
          currentMultiRootNode={currentMultiRootNode}
          hasDraggedRef={hasDraggedRef}
          selectionBox={selectionBox}
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
          handleStepBendMouseDown={handleStepBendMouseDown}
          handleResetEdgeStepOffset={handleResetEdgeStepOffset}
          handleCardBodyActivate={handleCardBodyActivate}
          handleContextMenuNode={handleContextMenuNode}
          handleContextMenuEdge={handleContextMenuEdge}
          handleSaveEdgeLabel={handleSaveEdgeLabel}
          handleCycleEdgeAnchor={handleCycleEdgeAnchor}
          handleJumpToSlide={handleJumpToSlide}
          handleDeleteNode={handleDeleteNode}
          handleDuplicateNode={handleDuplicateNode}
          handleNodeColorChange={handleNodeColorChange}
          handleSaveNodeEdit={handleSaveNodeEdit}
          handleSave={handleSave}
          handleCardEditorChange={handleCardEditorChange}
          moveCardSuggest={moveCardSuggest}
          pickCardSuggest={pickCardSuggest}
          openMediaPreview={openMediaPreview}
          handleBatchSetEdgeStyle={handleBatchSetEdgeStyle}
          handleBatchCycleStrokePattern={handleBatchCycleStrokePattern}
          handleBatchToggleArrow={handleBatchToggleArrow}
          handleBatchReverseEdges={handleBatchReverseEdges}
          handleBatchSetEdgeColor={handleBatchSetEdgeColor}
          handleBatchDeleteEdges={handleBatchDeleteEdges}
          minimapBBox={minimapBBox}
          minimapScale={minimapScale}
          minimapOffsetX={minimapOffsetX}
          minimapOffsetY={minimapOffsetY}
          containerRef={containerRef}
          handleMinimapNavigate={handleMinimapNavigate}
          mediaFileInputRef={mediaFileInputRef}
          imageFileInputRef={imageFileInputRef}
          videoFileInputRef={videoFileInputRef}
          audioFileInputRef={audioFileInputRef}
          handleMediaFileInputChange={handleMediaFileInputChange}
        />
      </CanvasChrome>
    </div>
  );
});

// Helpers & Styles
/** Extracts the circular-arc descriptor from an edge, when it has one. */
// getEdgeRing now lives in ./canvas/canvasEdgeUtils so the edge layer, the
// label layer and the exporter all read the arc metadata the same way.

// getCanvasThemeColors now lives in ../services/canvasTheme so that the SVG/PNG
// exporter reads exactly the same palette the screen does.

// toolBtnStyle now lives in ./canvas/canvasModalStyles (imported at the top).

// SIDES / hexToRgbString / cardHeaderBtnStyle / resizeHandleStyle /
// getAnchorDotStyle now live in ./canvas/CanvasNodeLayer — the only consumer
// was the node layer's JSX, and the group/card views share the one definition.

// modalOverlayStyle / modalContentStyle now live in ./canvas/canvasModalStyles
// so the extracted modal components share them (imported at the top).
