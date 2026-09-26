import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ThemeMode } from "../core/types";
import { expandLoopEdgeSelection, isPointInsideNodeHull } from "../services/canvasService";
import { getCanvasThemeColors } from "../services/canvasTheme";
import type { LightboxMedia } from "./MediaLightbox";
// Extracted during the R2 split (batch B2).
import { CanvasCardSuggestMenu } from "./canvas/CanvasCardSuggestMenu";
import { MarqueeSelectionBox } from "./canvas/MarqueeSelectionBox";
import { CanvasMinimap } from "./canvas/CanvasMinimap";
import { CanvasEdgeBatchToolbar } from "./canvas/CanvasEdgeBatchToolbar";
import { CanvasEdgeLabelLayer } from "./canvas/CanvasEdgeLabelLayer";
import { CanvasEdgeLayer } from "./canvas/CanvasEdgeLayer";
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
// The node layer (the group hulls and the card chrome), extracted during the
// wave-3 CanvasView decomposition.
import { CanvasNodeLayer } from "./canvas/CanvasNodeLayer";
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
  // colour-picker snapshot/commit trio (extracted hook).
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
    captureColorSnapshot,
    debounceCommitColorPick,
  } = useCanvasDocument({
    source,
    title,
    onSourceChange,
    onSave,
    editingNodeIdRef,
    editingTextRef,
    setEditingNodeId,
    setContextMenu,
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

  // Escape-key priority chain. F5 and the in-presentation slide keys live in
  // useCanvasPresentation's own listener; the Escape chain stays whole here
  // because it is ONE ordered list that also covers non-presentation overlays
  // (modals → context menu → fullscreen). Splitting it across two listeners
  // would let a later branch fire where the original handler had `return`ed —
  // e.g. Escape with both the slide drawer and presentation active must close
  // only the drawer, never exit the presentation.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showSlideDrawer) {
        e.preventDefault();
        setShowSlideDrawer(false);
        return;
      }
      if (showExtractModal) {
        e.preventDefault();
        setShowExtractModal(false);
        return;
      }
      if (showExportModal) {
        e.preventDefault();
        setShowExportModal(false);
        return;
      }
      if (showFilePicker) {
        e.preventDefault();
        setShowFilePicker(false);
        return;
      }
      if (contextMenu) {
        e.preventDefault();
        setContextMenu(null);
        return;
      }
      if (isPresentationMode) {
        e.preventDefault();
        handleTogglePresentation();
        return;
      }
      if (isFullscreenActive) {
        e.preventDefault();
        handleToggleFullscreen();
        return;
      }

      // ── Fallback: force-exit whatever fullscreen is actually active ────
      // The React flag above can go stale (e.g. the window went fullscreen
      // through a path that never updated it), and then ESC appeared to do
      // nothing. These checks ask the real sources of truth instead.
      if (typeof document !== "undefined" && document.fullscreenElement) {
        e.preventDefault();
        document.exitFullscreen?.().catch(() => {});
        return;
      }
      const desktopFs = (
        window as unknown as {
          bookMDDesktop?: {
            isFullScreen?: () => Promise<boolean>;
            toggleFullScreen?: () => Promise<boolean>;
          };
        }
      ).bookMDDesktop;
      if (desktopFs?.isFullScreen && desktopFs?.toggleFullScreen) {
        e.preventDefault();
        desktopFs
          .isFullScreen()
          .then((full) => {
            if (full) return desktopFs.toggleFullScreen?.();
            return undefined;
          })
          .catch(() => {});
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showSlideDrawer,
    showExtractModal,
    showExportModal,
    showFilePicker,
    contextMenu,
    isPresentationMode,
    isFullscreenActive,
    handleTogglePresentation,
    handleToggleFullscreen,
  ]);

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

  /**
   * Applies a colour to the board WITHOUT writing history — the live preview
   * while the native chooser is open. Exactly one entry is committed later by
   * commitColorPick().
   */
  const previewBatchNodeColor = useCallback(
    (color: string) => {
      if (!editable || selectedNodeIds.size === 0) return;
      captureColorSnapshot();
      setData((prev) => {
        const next = {
          ...prev,
          nodes: prev.nodes.map((n) =>
            selectedNodeIds.has(n.id) ? { ...n, color: color || undefined } : n,
          ),
        };
        latestDataRef.current = next;
        return next;
      });
    },
    [editable, selectedNodeIds, captureColorSnapshot],
  );

  const previewBatchEdgeColor = useCallback(
    (color: string) => {
      if (!editable || selectedEdgeIds.size === 0) return;
      captureColorSnapshot();
      setData((prev) => {
        const affected = expandLoopEdgeSelection(prev.edges, selectedEdgeIds);
        const next = {
          ...prev,
          edges: prev.edges.map((e) =>
            affected.has(e.id) ? { ...e, color: color || undefined } : e,
          ),
        };
        latestDataRef.current = next;
        return next;
      });
    },
    [editable, selectedEdgeIds, captureColorSnapshot],
  );

  const previewEdgeColor = useCallback(
    (edgeId: string, color: string) => {
      if (!editable) return;
      captureColorSnapshot();
      setData((prev) => {
        const affected = expandLoopEdgeSelection(prev.edges, [edgeId]);
        const next = {
          ...prev,
          edges: prev.edges.map((e) =>
            affected.has(e.id) ? { ...e, color: color || undefined } : e,
          ),
        };
        latestDataRef.current = next;
        return next;
      });
    },
    [editable, captureColorSnapshot],
  );

  const previewNodeColor = useCallback(
    (nodeId: string, color: string) => {
      if (!editable) return;
      captureColorSnapshot();
      setData((prev) => {
        const next = {
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, color: color || undefined } : n)),
        };
        latestDataRef.current = next;
        return next;
      });
    },
    [editable, captureColorSnapshot],
  );

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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global Save shortcut (Ctrl+S / Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // While a card's text is being edited, the keys belong to the text.
      // Without this guard the Enter below is the trap: it closes the editor,
      // React flushes, and this handler — whose closure still says "not
      // editing" — opens it straight back, so Ctrl+Enter looked like it did
      // nothing at all. The same guard is what stops Delete from deleting the
      // card out from under the sentence being typed, and Tab from spawning a
      // branch beside it.
      const keyTarget = e.target as HTMLElement | null;
      if (
        keyTarget &&
        (keyTarget.tagName === "TEXTAREA" ||
          keyTarget.tagName === "INPUT" ||
          keyTarget.isContentEditable)
      ) {
        return;
      }

      if (editingNodeId || editingEdgeId) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.size > 0) {
          handleDeleteSelected();
        } else if (selectedEdgeIds.size > 0) {
          handleBatchDeleteEdges();
        }
      } else if (
        (e.key === "r" || e.key === "R") &&
        selectedEdgeIds.size > 0 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        handleBatchReverseEdges();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          handleDuplicateSelected();
        }
      } else if (e.key === "Tab" && selectedNodeId && !editingNodeId) {
        e.preventDefault();
        handleSpawnConnectedChild(selectedNodeId, "right");
      } else if (e.key === "Enter" && selectedNodeId) {
        const node = data.nodes.find((n) => n.id === selectedNodeId);
        if (node && editable) {
          e.preventDefault();
          setEditingNodeId(node.id);
          setEditingText(
            node.type === "text" ? node.text : node.type === "group" ? node.label || "" : "",
          );
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        handleRedo();
      } else if (e.key === "Escape") {
        setSelectedNodeIds(new Set());
        setSelectedEdgeIds(new Set());
        setContextMenu(null);
        setIsBoxSelectMode(false);
        if (selectionBoxRef.current) {
          selectionBoxRef.current = null;
          setSelectionBox(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingNodeId,
    editingEdgeId,
    selectedNodeId,
    selectedNodeIds,
    selectedEdgeId,
    selectedEdgeIds,
    data.nodes,
    editable,
    handleSave,
    handleSelectAll,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleDeleteEdge,
    handleBatchDeleteEdges,
    handleReverseEdge,
    handleBatchReverseEdges,
    handleSpawnConnectedChild,
    handleUndo,
    handleRedo,
  ]);

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
