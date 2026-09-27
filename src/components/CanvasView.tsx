import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeMode } from "../core/types";
import { isPointInsideNodeHull } from "../services/canvasService";
import { getCanvasThemeColors } from "../services/canvasTheme";
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
// The presentation domain hook and the toolbar / overlay / presentation-chrome
// components, extracted during the wave-4 CanvasView decomposition.
import { useCanvasPresentation } from "./canvas/useCanvasPresentation";
import { CanvasToolbar } from "./canvas/CanvasToolbar";
import { CanvasOverlayMenus, type CanvasContextMenuState } from "./canvas/CanvasOverlayMenus";
import { CanvasPresentationChrome } from "./canvas/CanvasPresentationChrome";

export type CanvasViewProps = {
  title: string;
  source?: string;
  onSourceChange?: (newSource: string) => void;
  editable?: boolean;
  theme?: ThemeMode;
  onClose?: () => void;
  allChapters?: Array<{ id: string; title: string; src: string; absolutePath?: string }>;
  onOpenFile?: (filePath: string) => void;
  onExtractToNote?: (title: string, content: string) => void;
  onSave?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  currentFilePath?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

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
  // Theme-aware design tokens
  const colors = useMemo(() => getCanvasThemeColors(theme), [theme]);

  const isDark = useMemo(() => {
    return (
      theme === "twitter" ||
      (theme === "system" &&
        typeof window !== "undefined" &&
        Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches))
    );
  }, [theme]);
  const isEink = colors.isEink;

  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsNarrow(entry.contentRect.width < 860);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);

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
  // The align menu's open flag deliberately stays here rather than inside
  // CanvasToolbar: the context-menu keydown handler below also closes it on
  // Escape, so two domains write it and it cannot be toolbar-local.
  // The menu domain itself (clamping, dismissal, openers) moved into
  // useCanvasContextMenu (wave 6); only this state stays here because
  // useCanvasDocument's save path consumes setContextMenu before that hook's
  // other dependencies exist.
  const [showAlignMenu, setShowAlignMenu] = useState(false);
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

  // Close the toolbar align dropdown on any outside click
  useEffect(() => {
    if (!showAlignMenu) return;
    const handleOutside = () => setShowAlignMenu(false);
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [showAlignMenu]);

  // The align dropdown only makes sense while 2+ cards are selected
  useEffect(() => {
    if (selectedNodeIds.size < 2 && showAlignMenu) setShowAlignMenu(false);
  }, [selectedNodeIds, showAlignMenu]);

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
  } = useCanvasContextMenu({
    contextMenu,
    setContextMenu,
    contextMenuRef,
    setShowAlignMenu,
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
  // the shared rAF-throttling refs (extracted hook).
  const { isDraggingCanvasRef, canvasDragStartRef, groupDragRef, handleCardBodyActivate } =
    useCanvasPointer({
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
      allChapters,
      onOpenFile,
      isPresentationMode,
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

  // ResizeObserver for canvas container to ensure smooth updates
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      // Keep canvas reactive on resize
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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

  // Background drag to pan or start box selection
  const handleMouseDownBackground = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
    setContextMenu(null);

    // If a card or group was being edited, commit edits
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }

    if (isPresentationMode) {
      if (showSlideDrawer) setShowSlideDrawer(false);
      if (e.button === 0 || e.button === 1) {
        isDraggingCanvasRef.current = true;
        canvasDragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: viewport.panX,
          panY: viewport.panY,
          hasMoved: false,
        };
      }
      return;
    }

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    // If in box select mode or holding Shift/Ctrl/Cmd, start marquee box selection
    if (isBoxSelectMode || isModifier) {
      handleStartBoxSelection(e, isModifier);
      return;
    }

    // Clicking the hollow middle of a multi-selection — the empty centre of a
    // ring or a grid — grabs the whole group and moves it. Without this the
    // press would fall through to the pan below, dragging the canvas instead,
    // which is never what the user means right after arranging and selecting
    // those cards.
    if (e.button === 0 && selectedNodeIds.size >= 3 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const zoom = viewportRef.current.zoom;
      const canvasX = (e.clientX - rect.left - viewportRef.current.panX) / zoom;
      const canvasY = (e.clientY - rect.top - viewportRef.current.panY) / zoom;
      const selected = latestDataRef.current.nodes.filter(
        (n) => selectedNodeIds.has(n.id) && n.type !== "group",
      );

      if (isPointInsideNodeHull({ x: canvasX, y: canvasY }, selected)) {
        groupDragRef.current = {
          startClientX: e.clientX,
          startClientY: e.clientY,
          startById: new Map(selected.map((n) => [n.id, { id: n.id, startX: n.x, startY: n.y }])),
        };
        hasDraggedRef.current = false;
        e.preventDefault();
        return;
      }
    }

    // Normal pan: do not clear selection immediately; clear only on mouseup if canvas did not move
    isDraggingCanvasRef.current = true;
    canvasDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
      hasMoved: false,
    };
  };

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
      {/* 1. TOP FLOATING GLASSMORPHIC TOOLBAR (extracted component, wave 4) */}
      <CanvasToolbar
        theme={theme}
        colors={colors}
        isDark={isDark}
        isEink={isEink}
        isNarrow={isNarrow}
        title={title}
        onSave={onSave}
        isDirty={isDirty}
        isSaving={isSaving}
        handleSave={handleSave}
        editable={editable}
        handleAddTextCard={handleAddTextCard}
        handleTriggerInsertMedia={handleTriggerInsertMedia}
        setShowFilePicker={setShowFilePicker}
        handleAddGroup={handleAddGroup}
        isBoxSelectMode={isBoxSelectMode}
        setIsBoxSelectMode={setIsBoxSelectMode}
        selectedNodeIds={selectedNodeIds}
        currentMultiRootNode={currentMultiRootNode}
        currentMultiRootTitle={currentMultiRootTitle}
        handleConnectOneToMany={handleConnectOneToMany}
        handleConnectSelectedNodes={handleConnectSelectedNodes}
        handleConnectLoopNodes={handleConnectLoopNodes}
        showAlignMenu={showAlignMenu}
        setShowAlignMenu={setShowAlignMenu}
        handleAlignSelected={handleAlignSelected}
        nodes={data.nodes}
        latestDataRef={latestDataRef}
        setData={setData}
        pushHistory={pushHistory}
        handleSpawnConnectedChild={handleSpawnConnectedChild}
        setSpawnModalState={setSpawnModalState}
        history={history}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        handleOpenExtractModal={handleOpenExtractModal}
        setShowExportModal={setShowExportModal}
        isPresentationMode={isPresentationMode}
        handleTogglePresentation={handleTogglePresentation}
        handleZoom={handleZoom}
        viewport={viewport}
        setViewport={setViewport}
        handleZoomToFit={handleZoomToFit}
        isFullscreenActive={isFullscreenActive}
        handleToggleFullscreen={handleToggleFullscreen}
        onClose={onClose}
      />

      {/* 5-9. OVERLAY LAYER — the note-picker / extract / export / spawn
          modals, the portalled right-click context menu, the toast and the
          media lightbox (extracted component, wave 4). The overlay state it
          renders stays up in CanvasView because non-overlay code writes it:
          the gesture hooks take setContextMenu, the keyboard chains close the
          modals, the toolbar opens the export modal, showToast writes the
          toast, openMediaPreview writes the lightbox. */}
      <CanvasOverlayMenus
        theme={theme}
        colors={colors}
        isDark={isDark}
        editable={editable}
        data={data}
        nodeMap={nodeMap}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeIds={selectedEdgeIds}
        connectedInternalEdges={connectedInternalEdges}
        batchCustomColor={batchCustomColor}
        batchEdgeCustomColor={batchEdgeCustomColor}
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        contextMenuRef={contextMenuRef}
        allChapters={allChapters}
        showFilePicker={showFilePicker}
        setShowFilePicker={setShowFilePicker}
        handleAddFileCard={handleAddFileCard}
        showExtractModal={showExtractModal}
        setShowExtractModal={setShowExtractModal}
        extractedMarkdown={extractedMarkdown}
        copiedNotification={copiedNotification}
        handleCopyExtracted={handleCopyExtracted}
        handleSaveAsNote={handleSaveAsNote}
        onExtractToNote={onExtractToNote}
        showExportModal={showExportModal}
        setShowExportModal={setShowExportModal}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        exportBg={exportBg}
        setExportBg={setExportBg}
        isExporting={isExporting}
        exportCopyFeedback={exportCopyFeedback}
        handleCopyExport={handleCopyExport}
        handleDownloadExport={handleDownloadExport}
        spawnModalState={spawnModalState}
        setSpawnModalState={setSpawnModalState}
        handleConfirmBatchSpawn={handleConfirmBatchSpawn}
        handleAddTextCard={handleAddTextCard}
        handlePasteClipboardAsCard={handlePasteClipboardAsCard}
        handleTriggerInsertImage={handleTriggerInsertImage}
        handleTriggerInsertVideo={handleTriggerInsertVideo}
        handleTriggerInsertAudio={handleTriggerInsertAudio}
        handleAddGroup={handleAddGroup}
        isBoxSelectMode={isBoxSelectMode}
        setIsBoxSelectMode={setIsBoxSelectMode}
        handleSelectAll={handleSelectAll}
        handleSelectAllEdges={handleSelectAllEdges}
        handleAlignToGrid={handleAlignToGrid}
        handleZoomToFit={handleZoomToFit}
        setViewport={setViewport}
        history={history}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        onSave={onSave}
        handleSave={handleSave}
        handleOpenExtractModal={handleOpenExtractModal}
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
        setEditingNodeId={setEditingNodeId}
        setEditingText={setEditingText}
        onOpenFile={onOpenFile}
        toastMessage={toastMessage}
        lightboxMedia={lightboxMedia}
        setLightboxMedia={setLightboxMedia}
      />

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

      {/* 10. Presentation Mode Floating Controls & Slide Drawer (extracted
          component, wave 4; the guard stays here so the chrome only mounts
          while a presentation with slides is actually running) */}
      {isPresentationMode && presentationSequence.length > 0 && (
        <CanvasPresentationChrome
          nodes={data.nodes}
          nodeMap={nodeMap}
          presentationSequence={presentationSequence}
          currentSlideIndex={currentSlideIndex}
          isAutoPlaying={isAutoPlaying}
          setIsAutoPlaying={setIsAutoPlaying}
          showSlideDrawer={showSlideDrawer}
          setShowSlideDrawer={setShowSlideDrawer}
          slideDrawerRef={slideDrawerRef}
          isFullscreenActive={isFullscreenActive}
          handleToggleFullscreen={handleToggleFullscreen}
          handleTogglePresentation={handleTogglePresentation}
          handlePrevSlide={handlePrevSlide}
          handleNextSlide={handleNextSlide}
          handleJumpToSlide={handleJumpToSlide}
          colors={colors}
          isDark={isDark}
          isEink={isEink}
        />
      )}
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
