import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  ExternalLink,
  X,
  Link,
  Save,
  BoxSelect,
  CheckSquare,
  ArrowUpToLine,
  ArrowDownToLine,
  GitBranch,
  AlignLeft,
  AlignRight,
  AlignJustify,
  Image as ImageIcon,
  Clipboard,
  Grid,
  Minimize2,
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Share2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Music,
  Video,
  Film,
  List,
  Scan,
} from "lucide-react";
import type { ThemeMode } from "../core/types";
import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasFileNode,
  CanvasGroupNode,
  CanvasViewport,
  CanvasEdgeLabelShape,
  CanvasEdgeLineStyle,
  CanvasObstacle,
} from "../types/canvasTypes";
import {
  computeBoundingBox,
  extractCanvasToMarkdown,
  isNodeInsideGroup,
  disconnectNodeEdges,
  cycleEdgeArrow,
  cycleEdgeStyle,
  cycleEdgeStrokePattern,
  reverseEdgeDirection,
  computeSourceDisplayColorMap,
  expandLoopEdgeSelection,
  syncLoopEdgeGeometry,
  computeRingSpacingLayout,
  isPointInsideNodeHull,
  alignNodesInCircle,
  downloadCanvasAsImage,
  copyCanvasImageToClipboard,
  CanvasAlignDirection,
  alignNodes,
  getMediaFileType,
  isMediaFile,
  resolveMediaSrc,
  buildPresentationSequence,
  findContainerForNode,
} from "../services/canvasService";
import { getCanvasThemeColors } from "../services/canvasTheme";
import {
  applySlashCommand,
  detectSlashTrigger,
  matchSlashCommands,
  type SlashCommand,
} from "../services/slashCommands";
import { MediaLightbox, type LightboxMedia } from "./MediaLightbox";
// Extracted during the R2 split (batch B2).
import { CanvasToast } from "./canvas/CanvasToast";
import { CanvasCardSuggestMenu, type CanvasCardSuggestItem } from "./canvas/CanvasCardSuggestMenu";
import { MarqueeSelectionBox } from "./canvas/MarqueeSelectionBox";
import { CanvasMinimap } from "./canvas/CanvasMinimap";
import { CanvasEdgeBatchToolbar } from "./canvas/CanvasEdgeBatchToolbar";
import { toolBtnStyle } from "./canvas/canvasModalStyles";
import { CanvasEdgeLabelLayer } from "./canvas/CanvasEdgeLabelLayer";
import { CanvasEdgeLayer } from "./canvas/CanvasEdgeLayer";
import { EdgeContextMenu } from "./canvas/EdgeContextMenu";
import { NodeContextMenu } from "./canvas/NodeContextMenu";
import { ExtractModal } from "./canvas/ExtractModal";
import { FilePickerModal } from "./canvas/FilePickerModal";
import { ExportModal } from "./canvas/ExportModal";
import { SpawnBranchModal } from "./canvas/SpawnBranchModal";
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
// The node layer (the group hulls and the card chrome), extracted during the
// wave-3 CanvasView decomposition.
import { CanvasNodeLayer } from "./canvas/CanvasNodeLayer";

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
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  // Non-null while the ring radius slider is being dragged; holds the radius
  // being previewed so the label and the board stay in step.
  const [ringRadiusDraft, setRingRadiusDraft] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
    targetNodeId?: string;
    targetEdgeId?: string;
  } | null>(null);
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

  /**
   * The suggestion popup inside a card's textarea.
   *
   * A card is Markdown like any other, and its editor is a plain textarea, so
   * both of the things the document editor offers while typing have to be offered
   * here too, by the same triggers: `[[` opens the workspace's notes, and `/`
   * opens the slash commands. They share one popup — and, for `/`, the very same
   * command list and trigger rule the document editor uses
   * (`services/slashCommands.ts`), so the two editors cannot drift apart.
   */
  const [cardSuggest, setCardSuggest] = useState<{
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
  } | null>(null);
  const cardEditorRef = useRef<HTMLTextAreaElement | null>(null);

  // Multimodal media file input ref
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  // Dedicated inputs so the context menu can offer image / video / audio with
  // a pre-filtered file dialog for each.
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Drop point for the next media insertion. Set when the user triggers an
   * insert from the context menu (so the card lands where they right-clicked);
   * falls back to the viewport centre for toolbar/keyboard paths.
   */
  const mediaInsertPosRef = useRef<{ x: number; y: number } | null>(null);
  /** Media preview opened by double-clicking an image / video / audio card. */
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);

  // Presentation Mode state
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showSlideDrawer, setShowSlideDrawer] = useState(false);
  const [isPresentationFullscreen, setIsPresentationFullscreen] = useState(false);
  const isFullscreenActive = isFullscreen ?? isPresentationFullscreen;
  const slideDrawerRef = useRef<HTMLDivElement>(null);
  const savedViewportBeforePresentationRef = useRef<CanvasViewport | null>(null);

  // Dynamically clamp context menu position against the actual viewport so
  // the menu never spills off-screen, even when the canvas is nested in a
  // narrow layout (e.g. dual-document workspace).
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menuEl = contextMenuRef.current;

    const padding = 12;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;

    // Constrain maximum height to viewport so content can always be reached
    menuEl.style.maxHeight = `${Math.max(160, viewportH - padding * 2)}px`;

    // Measure actual rendered dimensions
    const menuW = menuEl.offsetWidth || 260;
    const menuH = menuEl.offsetHeight || 320;

    let clampedX = contextMenu.x;
    let clampedY = contextMenu.y;

    // Clamp horizontally within the viewport
    if (clampedX + menuW > viewportW - padding) {
      clampedX = Math.max(padding, viewportW - menuW - padding);
    }
    if (clampedX < padding) {
      clampedX = padding;
    }

    // Clamp vertically: if overflowing bottom, flip upward (preferred over
    // compressing the menu) so the user can always see the option closest to
    // the cursor.
    if (clampedY + menuH > viewportH - padding) {
      const flippedY = contextMenu.y - menuH;
      clampedY = Math.max(padding, flippedY < padding ? padding : flippedY);
    }
    if (clampedY < padding) {
      clampedY = padding;
    }

    menuEl.style.left = `${clampedX}px`;
    menuEl.style.top = `${clampedY}px`;
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setShowAlignMenu(false);
      }
    };
    const handleResize = () => setContextMenu(null);
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [contextMenu]);

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
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractedMarkdown, setExtractedMarkdown] = useState("");
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "svg">("png");
  const [exportBg, setExportBg] = useState<"theme" | "white" | "transparent">("theme");
  const [isExporting, setIsExporting] = useState(false);
  const [exportCopyFeedback, setExportCopyFeedback] = useState(false);
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

  // Node operations
  const handleAddTextCard = useCallback(
    (atX?: number, atY?: number) => {
      if (!editable) return;
      if (editingNodeIdRef.current) {
        handleSaveNodeEdit();
      }
      const id = `text-${Date.now()}`;
      const targetX =
        typeof atX === "number" ? atX : Math.round((-viewport.panX + 300) / viewport.zoom);
      const targetY =
        typeof atY === "number" ? atY : Math.round((-viewport.panY + 200) / viewport.zoom);
      const newNode: CanvasTextNode = {
        id,
        type: "text",
        text: "### 新想法卡片\n双击此处或按 Enter 进行 Markdown 编辑...",
        x: targetX,
        y: targetY,
        width: 280,
        height: 160,
        color: undefined,
      };
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newNode],
      });
      setSelectedNodeIds(new Set([id]));
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [editable, viewport, pushHistory, handleSaveNodeEdit],
  );

  const handleAddFileCard = useCallback(
    (chapter: { title: string; src: string }, atX?: number, atY?: number) => {
      if (!editable) return;
      if (editingNodeIdRef.current) {
        handleSaveNodeEdit();
      }
      const id = `file-${Date.now()}`;
      const targetX =
        typeof atX === "number" ? atX : Math.round((-viewport.panX + 320) / viewport.zoom);
      const targetY =
        typeof atY === "number" ? atY : Math.round((-viewport.panY + 220) / viewport.zoom);
      const newNode: CanvasFileNode = {
        id,
        type: "file",
        file: chapter.src,
        x: targetX,
        y: targetY,
        width: 320,
        height: 220,
        color: "4",
      };
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newNode],
      });
      setSelectedNodeIds(new Set([id]));
      setShowFilePicker(false);
      setContextMenu(null);
    },
    [editable, viewport, pushHistory, handleSaveNodeEdit],
  );

  const handleAddGroup = useCallback(
    (atX?: number, atY?: number) => {
      if (!editable) return;
      if (editingNodeIdRef.current) {
        handleSaveNodeEdit();
      }
      const id = `group-${Date.now()}`;
      const targetX =
        typeof atX === "number" ? atX : Math.round((-viewport.panX + 250) / viewport.zoom);
      const targetY =
        typeof atY === "number" ? atY : Math.round((-viewport.panY + 150) / viewport.zoom);
      const newGroup: CanvasGroupNode = {
        id,
        type: "group",
        label: "概念分组容器",
        x: targetX,
        y: targetY,
        width: 600,
        height: 400,
        color: "5",
      };
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newGroup],
      });
      freshGroupIdsRef.current.add(id);
      setSelectedNodeIds(new Set([id]));
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [editable, viewport, pushHistory, handleSaveNodeEdit],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      pushHistory({
        nodes: data.nodes.filter((n) => n.id !== nodeId),
        edges: data.edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId),
      });
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setContextMenu(null);
    },
    [editable, data, pushHistory],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    pushHistory({
      nodes: data.nodes.filter((n) => !selectedNodeIds.has(n.id)),
      edges: data.edges.filter(
        (e) => !selectedNodeIds.has(e.fromNode) && !selectedNodeIds.has(e.toNode),
      ),
    });
    setSelectedNodeIds(new Set());
    setContextMenu(null);
  }, [editable, selectedNodeIds, data, pushHistory]);

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const newNode: CanvasNode = {
        ...node,
        id: `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: node.x + 30,
        y: node.y + 30,
      };
      pushHistory({
        ...data,
        nodes: [...data.nodes, newNode],
      });
      setSelectedNodeIds(new Set([newNode.id]));
      setContextMenu(null);
    },
    [editable, data, pushHistory],
  );

  const handleDuplicateSelected = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    const idMap = new Map<string, string>();
    const newNodes: CanvasNode[] = [];
    for (const node of data.nodes) {
      if (selectedNodeIds.has(node.id)) {
        const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        idMap.set(node.id, newId);
        newNodes.push({
          ...node,
          id: newId,
          x: node.x + 30,
          y: node.y + 30,
        });
      }
    }
    const newEdges: CanvasEdge[] = [];
    for (const edge of data.edges) {
      if (idMap.has(edge.fromNode) && idMap.has(edge.toNode)) {
        newEdges.push({
          ...edge,
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromNode: idMap.get(edge.fromNode)!,
          toNode: idMap.get(edge.toNode)!,
        });
      }
    }
    pushHistory({
      nodes: [...data.nodes, ...newNodes],
      edges: [...data.edges, ...newEdges],
    });
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
    setContextMenu(null);
  }, [editable, selectedNodeIds, data, pushHistory]);

  const handleSelectAll = useCallback(() => {
    setSelectedNodeIds(new Set(data.nodes.map((n) => n.id)));
    setContextMenu(null);
  }, [data.nodes]);

  const handleBatchColorChange = useCallback(
    (color: string) => {
      if (!editable || selectedNodeIds.size === 0) return;
      pushHistory({
        ...data,
        nodes: data.nodes.map((n) =>
          selectedNodeIds.has(n.id) ? { ...n, color: color || undefined } : n,
        ),
      });
      // Deliberately does NOT close the context menu here — the caller decides
      // when. When the colour came from the native picker, closing has to wait
      // until that dialog has finished dismissing; unmounting the <input> from
      // onChange tears it down mid-flight and crashes the renderer (闪退).
    },
    [editable, selectedNodeIds, data, pushHistory],
  );

  const handleBringToFront = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      pushHistory({
        ...data,
        nodes: [...data.nodes.filter((n) => n.id !== nodeId), node],
      });
      setContextMenu(null);
    },
    [editable, data, pushHistory],
  );

  const handleSendToBack = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      pushHistory({
        ...data,
        nodes: [node, ...data.nodes.filter((n) => n.id !== nodeId)],
      });
      setContextMenu(null);
    },
    [editable, data, pushHistory],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.filter((e) => e.id !== edgeId),
      });
      setSelectedEdgeIds((prev) => {
        if (!prev.has(edgeId)) return prev;
        const next = new Set(prev);
        next.delete(edgeId);
        return next;
      });
      if (editingEdgeId === edgeId) setEditingEdgeId(null);
      setContextMenu(null);
    },
    [editable, editingEdgeId, pushHistory],
  );

  const handleBatchDeleteEdges = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const count = selectedEdgeIds.size;
    pushHistory({
      ...currentData,
      edges: currentData.edges.filter((e) => !selectedEdgeIds.has(e.id)),
    });
    setSelectedEdgeIds(new Set());
    if (editingEdgeId && selectedEdgeIds.has(editingEdgeId)) setEditingEdgeId(null);
    setContextMenu(null);
    showToast(`已删除 ${count} 条连线`);
  }, [editable, selectedEdgeIds, editingEdgeId, pushHistory, showToast]);

  const handleBatchSetEdgeStyle = useCallback(
    (style: CanvasEdgeLineStyle) => {
      if (!editable || selectedEdgeIds.size === 0) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (selectedEdgeIds.has(e.id) ? { ...e, style } : e)),
      });
      const styleName = style === "bezier" ? "贝塞尔曲线" : style === "step" ? "直角折线" : "直线";
      showToast(`已将 ${selectedEdgeIds.size} 条连线设为${styleName}`);
    },
    [editable, selectedEdgeIds, pushHistory, showToast],
  );

  const handleBatchCycleStrokePattern = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const first = currentData.edges.find((e) => selectedEdgeIds.has(e.id));
    const nextPattern: "solid" | "dashed" | "dotted" =
      first?.strokePattern === "dashed"
        ? "dotted"
        : first?.strokePattern === "dotted"
          ? "solid"
          : "dashed";
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? { ...e, strokePattern: nextPattern } : e,
      ),
    });
    const patName = nextPattern === "dashed" ? "虚线" : nextPattern === "dotted" ? "点线" : "实线";
    showToast(`已将 ${selectedEdgeIds.size} 条连线切换为${patName}`);
  }, [editable, selectedEdgeIds, pushHistory, showToast]);

  const handleBatchToggleArrow = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const first = currentData.edges.find((e) => selectedEdgeIds.has(e.id));
    let nextFromEnd: "arrow" | undefined = undefined;
    let nextToEnd: "arrow" | undefined = "arrow";
    let desc: string;

    if (first?.toEnd === "arrow" && first?.fromEnd !== "arrow") {
      nextFromEnd = "arrow";
      nextToEnd = "arrow";
      desc = "双向箭头";
    } else if (first?.toEnd === "arrow" && first?.fromEnd === "arrow") {
      nextFromEnd = undefined;
      nextToEnd = undefined;
      desc = "无箭头";
    } else {
      nextFromEnd = undefined;
      nextToEnd = "arrow";
      desc = "单向箭头";
    }

    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? { ...e, fromEnd: nextFromEnd, toEnd: nextToEnd } : e,
      ),
    });
    showToast(`已将 ${selectedEdgeIds.size} 条连线切换为${desc}`);
  }, [editable, selectedEdgeIds, pushHistory, showToast]);

  const handleBatchSetEdgeColor = useCallback(
    (colorKey: string) => {
      if (!editable || selectedEdgeIds.size === 0) return;
      const currentData = latestDataRef.current;
      // Selecting a single segment of a closed ring repaints the whole ring,
      // so the "one ring = one color" invariant is never broken.
      const affected = expandLoopEdgeSelection(currentData.edges, selectedEdgeIds);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (affected.has(e.id) ? { ...e, color: colorKey } : e)),
      });
      showToast(`已修改 ${affected.size} 条连线的颜色`);
    },
    [editable, selectedEdgeIds, pushHistory, showToast],
  );

  const handleBatchReverseEdges = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const count = selectedEdgeIds.size;
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? reverseEdgeDirection(e) : e,
      ),
    });
    showToast(`已反转 ${count} 条连线的流向`);
  }, [editable, selectedEdgeIds, pushHistory, showToast]);

  const handleSelectAllEdges = useCallback(() => {
    if (data.edges.length === 0) return;
    setSelectedEdgeIds(new Set(data.edges.map((e) => e.id)));
    setSelectedNodeIds(new Set());
    setContextMenu(null);
    showToast(`已全选 ${data.edges.length} 条连线`);
  }, [data.edges, showToast]);

  const handleDisconnectSelectedNodesEdges = useCallback(() => {
    if (!editable || selectedNodeIds.size < 2) return;
    const currentData = latestDataRef.current;
    const beforeCount = currentData.edges.length;
    const remainingEdges = currentData.edges.filter(
      (e) => !(selectedNodeIds.has(e.fromNode) && selectedNodeIds.has(e.toNode)),
    );
    const removedCount = beforeCount - remainingEdges.length;
    if (removedCount === 0) {
      showToast("所选卡片之间无内部连线");
      setContextMenu(null);
      return;
    }
    pushHistory({
      ...currentData,
      edges: remainingEdges,
    });
    setSelectedEdgeIds(new Set());
    setContextMenu(null);
    showToast(`已断开所选卡片间的 ${removedCount} 条内部连线`);
  }, [editable, selectedNodeIds, pushHistory, showToast]);

  const handleNodeColorChange = useCallback(
    (nodeId: string, color: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === nodeId ? { ...n, color: color || undefined } : n,
        ),
      });
    },
    [editable, pushHistory],
  );

  const handleToggleEdgeStyle = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = cycleEdgeStyle(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleToggleEdgeArrow = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = cycleEdgeArrow(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleReverseEdge = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = reverseEdgeDirection(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleEdgeColorChange = useCallback(
    (edgeId: string, color?: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      // A right-click on one segment of a closed ring recolors the entire
      // ring, keeping its color unified.
      const affected = expandLoopEdgeSelection(currentData.edges, [edgeId]);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (affected.has(e.id) ? { ...e, color } : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleEdgeLabelChange = useCallback(
    (edgeId: string, label: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, label: label.trim() || undefined } : e,
        ),
      });
    },
    [editable, pushHistory],
  );

  const handleEdgeLabelShapeChange = useCallback(
    (edgeId: string, shape: CanvasEdgeLabelShape) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? { ...e, labelShape: shape } : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleSetEdgeAnchorSide = useCallback(
    (edgeId: string, sideKey: "fromSide" | "toSide", side: CanvasNodeSide | undefined) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? { ...e, [sideKey]: side } : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleCycleEdgeAnchor = useCallback(
    (edgeId: string, sideKey: "fromSide" | "toSide") => {
      if (!editable) return;
      const currentEdge = latestDataRef.current.edges.find((e) => e.id === edgeId);
      if (!currentEdge) return;
      const current = currentEdge[sideKey];
      const sequence: (CanvasNodeSide | undefined)[] = [
        undefined,
        "top",
        "right",
        "bottom",
        "left",
      ];
      const currIdx = sequence.indexOf(current);
      const nextSide = sequence[(currIdx + 1) % sequence.length];
      handleSetEdgeAnchorSide(edgeId, sideKey, nextSide);
    },
    [editable, handleSetEdgeAnchorSide],
  );

  const handleToggleEdgeStrokePattern = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = cycleEdgeStrokePattern(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, pushHistory],
  );

  const handleDisconnectNodeEdges = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const connectedCount = currentData.edges.filter(
        (e) => e.fromNode === nodeId || e.toNode === nodeId,
      ).length;
      if (connectedCount === 0) {
        showToast("该卡片当前没有任何关联连线");
        setContextMenu(null);
        return;
      }
      const updatedEdges = disconnectNodeEdges(nodeId, currentData.edges);
      pushHistory({
        ...currentData,
        edges: updatedEdges,
      });
      showToast(`已断开该卡片的 ${connectedCount} 条关联连线`);
      setContextMenu(null);
    },
    [editable, pushHistory, showToast],
  );

  const handleAlignSelected = useCallback(
    (direction: CanvasAlignDirection) => {
      if (!editable || selectedNodeIds.size < 2) return;
      const currentData = latestDataRef.current;
      const selNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
      if (selNodes.length < 2) return;

      const updatedNodes = alignNodes(currentData.nodes, selectedNodeIds, direction);
      // Keep loop geometry in sync with the new positions: circle alignment
      // stamps a circular arc onto the loop edges, grid alignment marks them as
      // orthogonal straight segments so a rectangular layout reads as a clean
      // frame, and any other alignment clears stale metadata.
      const updatedEdges = syncLoopEdgeGeometry(updatedNodes, currentData.edges);

      const toastMap: Record<CanvasAlignDirection, string> = {
        horizontal: "所选卡片已水平中线对齐",
        vertical: "所选卡片已垂直中线对齐",
        left: "所选卡片已左对齐",
        center: "所选卡片已水平居中",
        right: "所选卡片已右对齐",
        top: "所选卡片已顶端对齐",
        middle: "所选卡片已垂直居中",
        bottom: "所选卡片已底端对齐",
        "distribute-h": "所选卡片已水平等距分布",
        "distribute-v": "所选卡片已垂直等距分布",
        circle: `已将 ${selNodes.length} 张卡片均匀排布为环形`,
        grid: `已将 ${selNodes.length} 张卡片按矩形网格排布`,
      };

      pushHistory({ ...currentData, nodes: updatedNodes, edges: updatedEdges });
      showToast(toastMap[direction] || "所选卡片已对齐");
      setContextMenu(null);
    },
    [editable, selectedNodeIds, pushHistory, showToast],
  );

  const handleGroupSelectedNodes = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const selNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
    if (selNodes.length === 0) return;

    const bbox = computeBoundingBox(selNodes);
    const padX = 30;
    const padTop = 45;
    const padBottom = 30;

    const newGroup: CanvasGroupNode = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "group",
      label: "新建分组容器",
      x: bbox.minX - padX,
      y: bbox.minY - padTop,
      width: bbox.width + padX * 2,
      height: bbox.height + padTop + padBottom,
      color: "6",
    };

    pushHistory({
      ...currentData,
      nodes: [newGroup, ...currentData.nodes],
    });
    setSelectedNodeIds(new Set([newGroup.id]));
    setSelectedNodeId(newGroup.id);
    showToast(`已将 ${selNodes.length} 张卡片打包进新分组`);
    setContextMenu(null);
  }, [editable, selectedNodeIds, pushHistory, showToast]);

  const handleResetNodeSize = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const target = currentData.nodes.find((n) => n.id === nodeId);
      if (!target) return;

      let defaultW = 280;
      let defaultH = 160;
      if (target.type === "file") {
        defaultW = 320;
        defaultH = 240;
      } else if (target.type === "group") {
        defaultW = 400;
        defaultH = 300;
      } else if (target.type === "link") {
        defaultW = 280;
        defaultH = 100;
      }

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === nodeId ? { ...n, width: defaultW, height: defaultH } : n,
        ),
      });
      showToast("已重置卡片为标准尺寸");
      setContextMenu(null);
    },
    [editable, pushHistory, showToast],
  );

  const handleCopyNodeText = useCallback(
    (node: CanvasNode) => {
      let textToCopy = "";
      if (node.type === "text") {
        textToCopy = node.text;
      } else if (node.type === "file") {
        textToCopy = node.file;
      } else if (node.type === "link") {
        textToCopy = node.url;
      } else if (node.type === "group") {
        textToCopy = node.label || "未命名分组";
      }

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
        showToast("卡片文本已复制到剪贴板");
      }
      setContextMenu(null);
    },
    [showToast],
  );

  const handleCopyNodeWikilink = useCallback(
    (node: CanvasNode) => {
      let wikilink = "";
      if (node.type === "file") {
        wikilink = `[[${node.file.replace(/\.md$/i, "")}]]`;
      } else if (node.type === "text") {
        const firstLine = node.text
          .split("\n")[0]
          .replace(/^[#\s\-*]+/, "")
          .trim();
        wikilink = `[[${firstLine || "卡片"}]]`;
      } else if (node.type === "group") {
        wikilink = `[[${node.label || "分组"}]]`;
      } else if (node.type === "link") {
        wikilink = `[${node.url}](${node.url})`;
      }

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(wikilink).catch(() => {});
        showToast(`双链已复制: ${wikilink}`);
      }
      setContextMenu(null);
    },
    [showToast],
  );

  const handleExtractCardToNote = useCallback(
    (node: CanvasTextNode) => {
      if (!onExtractToNote) return;
      const lines = node.text.split("\n");
      const firstLine = lines[0].replace(/^[#\s\-*]+/, "").trim();
      const title = firstLine || "未命名卡片笔记";
      const content = node.text;
      onExtractToNote(title, content);
      showToast(`已提取为新笔记: ${title}`);
      setContextMenu(null);
    },
    [onExtractToNote, showToast],
  );

  const handleSelectGroupNodes = useCallback(
    (groupNode: CanvasGroupNode) => {
      const currentData = latestDataRef.current;
      const insideNodes = currentData.nodes.filter(
        (n) => n.id !== groupNode.id && isNodeInsideGroup(n, groupNode),
      );
      if (insideNodes.length > 0) {
        setSelectedNodeIds(new Set(insideNodes.map((n) => n.id)));
        setSelectedNodeId(insideNodes[0].id);
        showToast(`已选中组内 ${insideNodes.length} 张卡片`);
      } else {
        showToast("该分组内暂无卡片");
      }
      setContextMenu(null);
    },
    [showToast],
  );

  const handleFitGroupSize = useCallback(
    (groupNode: CanvasGroupNode) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const insideNodes = currentData.nodes.filter(
        (n) => n.id !== groupNode.id && isNodeInsideGroup(n, groupNode),
      );
      if (insideNodes.length === 0) {
        showToast("分组内暂无卡片，无需调整");
        setContextMenu(null);
        return;
      }

      const bbox = computeBoundingBox(insideNodes);
      const padX = 24;
      const padTop = 38;
      const padBottom = 24;

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === groupNode.id
            ? {
                ...n,
                x: bbox.minX - padX,
                y: bbox.minY - padTop,
                width: bbox.width + padX * 2,
                height: bbox.height + padTop + padBottom,
              }
            : n,
        ),
      });
      showToast("分组尺寸已贴合内部卡片");
      setContextMenu(null);
    },
    [editable, pushHistory, showToast],
  );

  const handleDissolveGroup = useCallback(
    (groupNodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: currentData.nodes.filter((n) => n.id !== groupNodeId),
        edges: currentData.edges.filter(
          (e) => e.fromNode !== groupNodeId && e.toNode !== groupNodeId,
        ),
      });
      if (selectedNodeId === groupNodeId) setSelectedNodeId(null);
      if (selectedNodeIds.has(groupNodeId)) {
        const nextSet = new Set(selectedNodeIds);
        nextSet.delete(groupNodeId);
        setSelectedNodeIds(nextSet);
      }
      showToast("已解散分组（保留内部卡片）");
      setContextMenu(null);
    },
    [editable, selectedNodeId, selectedNodeIds, pushHistory, showToast],
  );

  const handleDeleteGroupWithContents = useCallback(
    (groupNode: CanvasGroupNode) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const insideNodeIds = new Set(
        currentData.nodes
          .filter((n) => n.id === groupNode.id || isNodeInsideGroup(n, groupNode))
          .map((n) => n.id),
      );

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.filter((n) => !insideNodeIds.has(n.id)),
        edges: currentData.edges.filter(
          (e) => !insideNodeIds.has(e.fromNode) && !insideNodeIds.has(e.toNode),
        ),
      });
      setSelectedNodeIds(new Set());
      setSelectedNodeId(null);
      showToast(`已删除分组容器及内部 ${insideNodeIds.size - 1} 张卡片`);
      setContextMenu(null);
    },
    [editable, pushHistory, showToast],
  );

  const handlePasteClipboardAsCard = useCallback(
    async (canvasX: number, canvasY: number) => {
      if (!editable) return;
      let text = "";
      let imageBlob: Blob | null = null;
      try {
        if (navigator?.clipboard?.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imgType = item.types.find((t) => t.startsWith("image/"));
            if (imgType) {
              imageBlob = await item.getType(imgType);
              break;
            }
          }
        }
      } catch {
        // clipboard permission fallback
      }

      if (imageBlob) {
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob!);
          });

          let finalFilePath = base64;
          const desktop =
            typeof window !== "undefined"
              ? window.knowSpaceDesktop || window.bookMDDesktop
              : undefined;
          if (desktop?.savePastedImage) {
            const res = await desktop.savePastedImage({
              currentFilePath,
              bufferBase64: base64,
              originalName: "pasted_image",
              ext: imageBlob.type.replace("image/", "") || "png",
            });
            if (res?.success && res.relativePath) {
              finalFilePath = res.relativePath;
            }
          }

          const newCard: CanvasFileNode = {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: "file",
            file: finalFilePath,
            x: Math.round(canvasX - 180),
            y: Math.round(canvasY - 130),
            width: 360,
            height: 260,
          };

          const currentData = latestDataRef.current;
          pushHistory({
            ...currentData,
            nodes: [...currentData.nodes, newCard],
          });
          setSelectedNodeIds(new Set([newCard.id]));
          setSelectedNodeId(newCard.id);
          showToast("已从剪贴板粘贴为图片卡片");
          setContextMenu(null);
          return;
        } catch {
          // fallback to text
        }
      }

      try {
        if (navigator?.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
      } catch {
        // clipboard permission fallback
      }
      if (!text || !text.trim()) {
        text = "从剪贴板粘贴的卡片";
      }

      const newCard: CanvasTextNode = {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "text",
        text: text.trim(),
        x: Math.round(canvasX),
        y: Math.round(canvasY),
        width: 280,
        height: 180,
      };

      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newCard],
      });
      setSelectedNodeIds(new Set([newCard.id]));
      setSelectedNodeId(newCard.id);
      showToast("已从剪贴板粘贴为新卡片");
      setContextMenu(null);
    },
    [editable, currentFilePath, pushHistory, showToast],
  );

  const handleTriggerInsertMedia = useCallback(() => {
    if (!editable) return;
    mediaFileInputRef.current?.click();
  }, [editable]);

  /**
   * Context-menu insert helpers. Each pre-filters its file dialog to one
   * modality and remembers the click point so the card lands exactly where
   * the user right-clicked.
   */
  const handleTriggerInsertImage = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!editable) return;
      mediaInsertPosRef.current = { x: canvasX, y: canvasY };
      imageFileInputRef.current?.click();
    },
    [editable],
  );

  const handleTriggerInsertVideo = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!editable) return;
      mediaInsertPosRef.current = { x: canvasX, y: canvasY };
      videoFileInputRef.current?.click();
    },
    [editable],
  );

  const handleTriggerInsertAudio = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!editable) return;
      mediaInsertPosRef.current = { x: canvasX, y: canvasY };
      audioFileInputRef.current?.click();
    },
    [editable],
  );

  const handleMediaFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0 || !editable) return;

      const desktop =
        typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
      const newNodes: CanvasNode[] = [];

      // Right-click inserts land exactly where the user clicked; toolbar /
      // keyboard paths fall back to the viewport centre.
      const insertPos = mediaInsertPosRef.current;
      const centerX = insertPos
        ? insertPos.x
        : -viewport.panX / viewport.zoom +
          (containerRef.current?.clientWidth || 800) / (2 * viewport.zoom);
      const centerY = insertPos
        ? insertPos.y
        : -viewport.panY / viewport.zoom +
          (containerRef.current?.clientHeight || 600) / (2 * viewport.zoom);
      mediaInsertPosRef.current = null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const offsetX = i * 28;
        const offsetY = i * 28;

        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          let finalFilePath = base64;
          if (desktop?.savePastedImage) {
            const res = await desktop.savePastedImage({
              currentFilePath,
              bufferBase64: base64,
              originalName: file.name,
              ext: file.name.split(".").pop() || "png",
            });
            if (res?.success && res.relativePath) {
              finalFilePath = res.relativePath;
            }
          }

          newNodes.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
            type: "file",
            file: finalFilePath,
            x: Math.round(centerX + offsetX - 180),
            y: Math.round(centerY + offsetY - 130),
            width: 360,
            height: 260,
          });
        } catch {
          // fallback
        }
      }

      if (newNodes.length > 0) {
        const currentData = latestDataRef.current;
        pushHistory({
          ...currentData,
          nodes: [...currentData.nodes, ...newNodes],
        });
        setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
        setSelectedNodeId(newNodes[0].id);
        showToast(`已插入 ${newNodes.length} 张媒体卡片`);
      }

      e.target.value = "";
    },
    [editable, viewport, currentFilePath, pushHistory, showToast],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleCanvasDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editable || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0) return;

      const desktop =
        typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
      const newNodes: CanvasNode[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const offsetX = i * 28;
        const offsetY = i * 28;

        if (isMediaFile(file.name) || file.type.startsWith("image/")) {
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            let finalFilePath = base64;
            if (desktop?.savePastedImage) {
              const res = await desktop.savePastedImage({
                currentFilePath,
                bufferBase64: base64,
                originalName: file.name,
                ext: file.name.split(".").pop() || "png",
              });
              if (res?.success && res.relativePath) {
                finalFilePath = res.relativePath;
              }
            }

            newNodes.push({
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
              type: "file",
              file: finalFilePath,
              x: Math.round(canvasX + offsetX - 180),
              y: Math.round(canvasY + offsetY - 130),
              width: 360,
              height: 260,
            });
          } catch {
            // fallback
          }
        } else if (file.name.endsWith(".md") || file.name.endsWith(".canvas")) {
          newNodes.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
            type: "file",
            file: file.name,
            x: Math.round(canvasX + offsetX - 140),
            y: Math.round(canvasY + offsetY - 90),
            width: 280,
            height: 180,
          });
        }
      }

      if (newNodes.length > 0) {
        const currentData = latestDataRef.current;
        pushHistory({
          ...currentData,
          nodes: [...currentData.nodes, ...newNodes],
        });
        setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
        setSelectedNodeId(newNodes[0].id);
        showToast(`已将 ${newNodes.length} 个文件添加为画布卡片`);
      }
    },
    [editable, currentFilePath, pushHistory, showToast],
  );

  // Node lookups & relationship maps
  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  const canvasObstacles = useMemo<CanvasObstacle[]>(
    () =>
      data.nodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      })),
    [data.nodes],
  );

  const presentationSequence = useMemo(() => buildPresentationSequence(data), [data]);

  const focusSlide = useCallback(
    (index: number) => {
      if (presentationSequence.length === 0 || !containerRef.current) return;
      const targetId = presentationSequence[index];
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerW = rect.width || 1000;
      const containerH = rect.height || 700;

      // Available vertical height clearing the bottom floating presentation bar (~80px)
      const usableH = Math.max(300, containerH - 90);
      const targetZoom = Math.min(
        1.35,
        Math.max(
          0.35,
          Math.min((containerW - 160) / targetNode.width, (usableH - 120) / targetNode.height),
        ),
      );

      // Target center slightly shifted upward to give clearance to the bottom presentation controller
      const visualCenterY = usableH / 2 + 10;
      const targetPanX = Math.round(
        containerW / 2 - (targetNode.x + targetNode.width / 2) * targetZoom,
      );
      const targetPanY = Math.round(
        visualCenterY - (targetNode.y + targetNode.height / 2) * targetZoom,
      );

      setViewport({ panX: targetPanX, panY: targetPanY, zoom: targetZoom });
      setSelectedNodeIds(new Set([targetId]));
      setSelectedNodeId(targetId);
    },
    [presentationSequence, nodeMap],
  );

  const handleJumpToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= presentationSequence.length) return;
      setCurrentSlideIndex(index);
      focusSlide(index);
    },
    [presentationSequence.length, focusSlide],
  );

  const handleTogglePresentation = useCallback(() => {
    if (isPresentationMode) {
      setIsPresentationMode(false);
      setIsAutoPlaying(false);
      setShowSlideDrawer(false);
      if (savedViewportBeforePresentationRef.current) {
        setViewport(savedViewportBeforePresentationRef.current);
      }
    } else {
      if (presentationSequence.length === 0) {
        showToast("画布中暂无可演示的卡片");
        return;
      }
      savedViewportBeforePresentationRef.current = { ...viewport };
      setIsPresentationMode(true);
      setShowSlideDrawer(false);

      // "就近开播": Check if currently selected node is in presentation sequence
      const currentSelected = selectedNodeId || Array.from(selectedNodeIds)[0];
      const targetIndex = currentSelected ? presentationSequence.indexOf(currentSelected) : -1;
      const startIndex = targetIndex >= 0 ? targetIndex : 0;

      setCurrentSlideIndex(startIndex);
      focusSlide(startIndex);
    }
  }, [
    isPresentationMode,
    presentationSequence,
    viewport,
    selectedNodeId,
    selectedNodeIds,
    focusSlide,
    showToast,
  ]);

  const handleNextSlide = useCallback(() => {
    if (presentationSequence.length === 0) return;
    const nextIdx = (currentSlideIndex + 1) % presentationSequence.length;
    setCurrentSlideIndex(nextIdx);
    focusSlide(nextIdx);
  }, [currentSlideIndex, presentationSequence.length, focusSlide]);

  const handlePrevSlide = useCallback(() => {
    if (presentationSequence.length === 0) return;
    const prevIdx =
      (currentSlideIndex - 1 + presentationSequence.length) % presentationSequence.length;
    setCurrentSlideIndex(prevIdx);
    focusSlide(prevIdx);
  }, [currentSlideIndex, presentationSequence.length, focusSlide]);

  const handleToggleFullscreen = useCallback(async () => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
      return;
    }
    const desktopWin = (
      window as unknown as { bookMDDesktop?: { toggleFullScreen?: () => Promise<boolean> } }
    ).bookMDDesktop;
    if (desktopWin?.toggleFullScreen) {
      const next = await desktopWin.toggleFullScreen();
      setIsPresentationFullscreen(Boolean(next));
    } else if (typeof document !== "undefined") {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.().catch(() => {});
        setIsPresentationFullscreen(true);
      } else {
        await document.exitFullscreen?.().catch(() => {});
        setIsPresentationFullscreen(false);
      }
    }
  }, [onToggleFullscreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsPresentationFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    if (!showSlideDrawer) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (slideDrawerRef.current && !slideDrawerRef.current.contains(e.target as Node)) {
        setShowSlideDrawer(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSlideDrawer]);

  useEffect(() => {
    if (!isPresentationMode || !isAutoPlaying) return;
    const timer = setInterval(() => {
      handleNextSlide();
    }, 3500);
    return () => clearInterval(timer);
  }, [isPresentationMode, isAutoPlaying, handleNextSlide]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // NOTE: F11 is intentionally NOT handled here — App.tsx already has a
      // global F11 listener. Handling it in both places toggled fullscreen
      // twice per keypress, which looked like "F11 does nothing".

      if (e.key === "F5") {
        e.preventDefault();
        handleTogglePresentation();
        return;
      }

      if (e.key === "Escape") {
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
          return;
        }
      }

      if (!isPresentationMode) return;

      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown" || e.key === "Enter") {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "Backspace") {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === "Home") {
        e.preventDefault();
        handleJumpToSlide(0);
      } else if (e.key === "End") {
        e.preventDefault();
        handleJumpToSlide(presentationSequence.length - 1);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        setShowSlideDrawer((prev) => !prev);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setIsAutoPlaying((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isPresentationMode,
    showSlideDrawer,
    showExtractModal,
    showExportModal,
    showFilePicker,
    contextMenu,
    isFullscreenActive,
    handleTogglePresentation,
    handleToggleFullscreen,
    handleNextSlide,
    handlePrevSlide,
    handleJumpToSlide,
    presentationSequence.length,
  ]);

  // Global Clipboard Paste listener for media cards (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePasteEvent = () => {
      if (editingNodeId || editingEdgeId || !editable) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }
      const centerX =
        -viewport.panX / viewport.zoom +
        (containerRef.current?.clientWidth || 800) / (2 * viewport.zoom);
      const centerY =
        -viewport.panY / viewport.zoom +
        (containerRef.current?.clientHeight || 600) / (2 * viewport.zoom);
      handlePasteClipboardAsCard(centerX, centerY);
    };

    window.addEventListener("paste", handlePasteEvent);
    return () => window.removeEventListener("paste", handlePasteEvent);
  }, [
    editingNodeId,
    editingEdgeId,
    editable,
    viewport.panX,
    viewport.panY,
    viewport.zoom,
    handlePasteClipboardAsCard,
  ]);

  const handleAlignToGrid = useCallback(() => {
    if (!editable) return;
    const currentData = latestDataRef.current;
    const GRID = 20;
    pushHistory({
      ...currentData,
      nodes: currentData.nodes.map((n) => ({
        ...n,
        x: Math.round(n.x / GRID) * GRID,
        y: Math.round(n.y / GRID) * GRID,
      })),
    });
    showToast("已将所有卡片对齐到 20px 网格");
    setContextMenu(null);
  }, [editable, pushHistory, showToast]);

  const handleContextMenuCanvas = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (isPresentationMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      setContextMenu({
        // Use viewport-absolute coordinates so the portal-rendered menu can use
        // position: fixed and never be clipped by ancestor `overflow: hidden`.
        x: e.clientX,
        y: e.clientY,
        canvasX,
        canvasY,
      });
    },
    [isPresentationMode],
  );

  const handleContextMenuNode = useCallback(
    (e: React.MouseEvent, node: CanvasNode) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPresentationMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      if (!selectedNodeIds.has(node.id)) {
        setSelectedNodeIds(new Set([node.id]));
      }

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        canvasX,
        canvasY,
        targetNodeId: node.id,
      });
    },
    [isPresentationMode, selectedNodeIds],
  );

  const handleContextMenuEdge = useCallback(
    (e: React.MouseEvent, edge: CanvasEdge) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPresentationMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      if (selectedEdgeIds.has(edge.id) && selectedEdgeIds.size > 1) {
        // keep multiple selection
      } else {
        setSelectedEdgeIds(new Set([edge.id]));
      }
      setSelectedNodeIds(new Set());

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        canvasX,
        canvasY,
        targetEdgeId: edge.id,
      });
    },
    [selectedEdgeIds],
  );

  const handleSaveEdgeLabel = () => {
    if (!editingEdgeId) return;
    const currentData = latestDataRef.current;
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        e.id === editingEdgeId ? { ...e, label: editingEdgeLabel.trim() || undefined } : e,
      ),
    });
    setEditingEdgeId(null);
  };

  /**
   * Where the caret is, in screen pixels.
   *
   * The card editor is a monospace textarea inside a transformed canvas world,
   * so the popup is drawn through a portal at fixed coordinates — and the only
   * way to know those is to measure. CJK counts double, which is what a
   * monospace font does with it.
   */
  /**
   * Where the caret is on screen, for a given value and caret index.
   *
   * The value and the caret are passed in rather than read off the textarea: an
   * insertion has already computed them, and the DOM still holds the previous
   * value until React re-renders. Only the layout is read from the element.
   */
  const caretScreenPosition = (textarea: HTMLTextAreaElement, text: string, caret: number) => {
    const style = getComputedStyle(textarea);
    const value = text.slice(0, caret);
    const lines = value.split("\n");
    const column = Array.from(lines[lines.length - 1] ?? "").reduce(
      (width, ch) => width + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1),
      0,
    );
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font}`;
    probe.textContent = "0000000000";
    document.body.appendChild(probe);
    const charWidth = probe.getBoundingClientRect().width / 10;
    probe.remove();
    const rect = textarea.getBoundingClientRect();
    const scale = rect.width / textarea.offsetWidth || 1;
    return {
      x: rect.left + (parseFloat(style.paddingLeft) || 0) * scale + column * charWidth * scale,
      y:
        rect.top +
        (parseFloat(style.paddingTop) || 0) * scale +
        (lines.length - 1) * (parseFloat(style.lineHeight) || 20) * scale,
    };
  };

  /** Notes whose title or file name contains what has been typed so far. */
  const matchCardRefTargets = (query: string) => {
    const clean = query.trim().toLowerCase();
    return allChapters
      .map((c) => ({
        title: c.title,
        relativePath: c.src,
        absolutePath: c.absolutePath,
      }))
      .filter((t) => {
        if (!clean) return true;
        const title = t.title.toLowerCase();
        const fileName = (t.relativePath.split("/").pop() ?? "").toLowerCase();
        return title.includes(clean) || fileName.includes(clean);
      })
      .slice(0, 8);
  };

  /** The rows the popup shows, in the order it shows them. */
  const buildCardSuggestItems = (
    kind: "note" | "command",
    query: string,
  ): CanvasCardSuggestItem[] => {
    if (kind === "command") {
      return matchSlashCommands(query).map((cmd) => ({
        key: `command:${cmd.id}`,
        icon: cmd.icon,
        title: cmd.title,
        subtitle: cmd.description,
      }));
    }
    return matchCardRefTargets(query).map((target) => ({
      key: `note:${target.relativePath}:${target.title}`,
      title: target.title,
      subtitle: target.relativePath,
    }));
  };

  /**
   * Open (or move) the popup for whatever the caret now sits in.
   *
   * Called on every keystroke, and again after an insertion, so picking `[[]]`
   * from the command list offers the notes straight away rather than waiting for
   * the next key — the document editor does the same.
   */
  const openCardSuggestFor = (textarea: HTMLTextAreaElement, value: string, caret: number) => {
    const before = value.slice(0, caret);
    let kind: "note" | "command" | null = null;
    let query = "";
    let startIndex = 0;

    const wiki = before.match(/\[\[([^\]\n]*)$/);
    if (wiki) {
      kind = "note";
      query = wiki[1];
      startIndex = caret - wiki[0].length;
    } else {
      // The same rule the document editor uses, which is what keeps a slash in
      // the middle of a path or a URL from opening anything.
      const slash = detectSlashTrigger(value, caret);
      if (slash) {
        kind = "command";
        query = slash.query;
        startIndex = slash.startIndex;
      }
    }

    if (!kind || startIndex < 0) {
      setCardSuggest(null);
      return;
    }

    const caretPos = caretScreenPosition(textarea, value, caret);
    setCardSuggest({
      kind,
      query: query.toLowerCase(),
      startIndex,
      selectedIndex: 0,
      items: buildCardSuggestItems(kind, query),
      x: caretPos.x,
      y: caretPos.y,
    });
  };

  const handleCardEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingText(e.target.value);
    openCardSuggestFor(e.target, e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  /**
   * Put the caret where an insertion left it, and re-open the popup for whatever
   * it landed in — picking `[[]]` from the command list offers the notes straight
   * away rather than waiting for the next key, the way the document editor does.
   *
   * The popup is refreshed before the frame is requested: it is positioned from
   * the value and caret we already have, so it does not have to wait for React to
   * write the new value into the textarea. Only the caret itself has to.
   */
  const commitCardEdit = (next: string, caret: number) => {
    setEditingText(next);
    const textarea = cardEditorRef.current;
    if (!textarea) return;
    openCardSuggestFor(textarea, next, caret);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  /**
   * Insert whatever row `index` of the open popup stands for.
   *
   * The rows are re-derived from the query rather than carried in the state:
   * both builders are pure and take the query the popup was drawn with, so the
   * inserted row cannot disagree with the row the user was looking at.
   */
  const pickCardSuggest = (index: number) => {
    const suggest = cardSuggest;
    const textarea = cardEditorRef.current;
    if (!suggest || !textarea) return;
    const caret = textarea.selectionStart ?? editingText.length;

    if (suggest.kind === "command") {
      const command: SlashCommand | undefined = matchSlashCommands(suggest.query)[index];
      if (!command) return;
      const applied = applySlashCommand(
        editingText,
        { query: suggest.query, startIndex: suggest.startIndex },
        caret,
        command,
      );
      commitCardEdit(applied.text, applied.caret);
      return;
    }

    const target = matchCardRefTargets(suggest.query)[index];
    if (!target) return;
    const inserted = `[[${target.title}]]`;
    commitCardEdit(
      `${editingText.slice(0, suggest.startIndex)}${inserted}${editingText.slice(caret)}`,
      suggest.startIndex + inserted.length,
    );
  };

  /** Move the popup's highlight by `delta`, wrapping at both ends. */
  const moveCardSuggest = (delta: number) => {
    setCardSuggest((prev) =>
      prev && prev.items.length > 0
        ? {
            ...prev,
            selectedIndex: (prev.selectedIndex + delta + prev.items.length) % prev.items.length,
          }
        : prev,
    );
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

  // Extract article
  const handleOpenExtractModal = () => {
    const markdown = extractCanvasToMarkdown(data, title || "空间白板萃取长文");
    setExtractedMarkdown(markdown);
    setShowExtractModal(true);
  };

  const handleCopyExtracted = () => {
    navigator.clipboard.writeText(extractedMarkdown);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const handleSaveAsNote = () => {
    if (onExtractToNote) {
      onExtractToNote(`${title}-萃取长文`, extractedMarkdown);
      setShowExtractModal(false);
    }
  };

  // Export canvas image
  const handleDownloadExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await downloadCanvasAsImage(data, title || "KnowSpace白板", exportFormat, {
        theme,
        background: exportBg,
        scale: 2,
      });
      if (result === "canceled") {
        showToast("已取消导出");
        return;
      }
      setShowExportModal(false);
      if (result === "svg" && exportFormat !== "svg") {
        // The rasteriser was vetoed by the browser's security model and the
        // vector file was saved instead — say so, rather than silently
        // handing the user a different format than they asked for.
        showToast("浏览器安全限制无法生成 PNG，已改为导出矢量 SVG");
      } else if (result === "svg") {
        showToast("已导出矢量 SVG");
      } else {
        showToast("白板图片已导出");
      }
    } catch (err) {
      console.error("导出白板图片失败:", err);
      // Surface the failure instead of dying silently — a previous hard crash
      // here left the user staring at a closed window with no explanation.
      showToast(`导出失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const ok = await copyCanvasImageToClipboard(data, {
        theme,
        background: exportBg,
        scale: 2,
      });
      if (ok) {
        setExportCopyFeedback(true);
        setTimeout(() => setExportCopyFeedback(false), 2200);
      } else {
        showToast("复制失败：当前环境不支持剪贴板图片写入");
      }
    } catch (err) {
      console.error("复制白板图片失败:", err);
      showToast(`复制失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Minimap bounding calculations - padded to ensure all nodes (including standalone & groups) are fully visible
  const minimapBBox = useMemo(() => {
    const box = computeBoundingBox(data.nodes);
    const padX = Math.max(60, box.width * 0.08);
    const padY = Math.max(60, box.height * 0.08);
    return {
      minX: box.minX - padX,
      minY: box.minY - padY,
      maxX: box.maxX + padX,
      maxY: box.maxY + padY,
      width: box.width + padX * 2,
      height: box.height + padY * 2,
    };
  }, [data.nodes]);

  const { minimapScale, minimapOffsetX, minimapOffsetY } = useMemo(() => {
    const targetW = 180;
    const targetH = 130;
    const pad = 10;
    const availW = targetW - pad * 2;
    const availH = targetH - pad * 2;
    const scaleX = availW / Math.max(100, minimapBBox.width);
    const scaleY = availH / Math.max(100, minimapBBox.height);
    const scale = Math.min(scaleX, scaleY, 0.4);

    const contentW = minimapBBox.width * scale;
    const contentH = minimapBBox.height * scale;
    const offsetX = (targetW - contentW) / 2;
    const offsetY = (targetH - contentH) / 2;

    return { minimapScale: scale, minimapOffsetX: offsetX, minimapOffsetY: offsetY };
  }, [minimapBBox]);

  // Node lookups & relationship maps
  const nodeOutgoingMap = useMemo(() => {
    const map = new Map<string, { count: number; color?: string; targets: string[] }>();
    for (const e of data.edges) {
      if (e.fromNode) {
        const item = map.get(e.fromNode) || { count: 0, color: e.color, targets: [] };
        item.count++;
        if (e.color) item.color = e.color;
        item.targets.push(e.toNode);
        map.set(e.fromNode, item);
      }
    }
    return map;
  }, [data.edges]);

  // Dynamic source-aware color mapping (shared with the SVG/PNG export
  // pipeline so that on-screen and exported colors stay perfectly in sync).
  const sourceDisplayColorMap = useMemo(
    () => computeSourceDisplayColorMap(data.nodes, data.edges),
    [data.nodes, data.edges],
  );

  const currentMultiRootNode = useMemo(() => {
    if (selectedNodeIds.size < 2) return undefined;
    const selectedNodes = data.nodes.filter((n) => selectedNodeIds.has(n.id));
    const firstSelectedId = Array.from(selectedNodeIds)[0];
    return (
      selectedNodes.find((n) => n.id === firstSelectedId) ||
      [...selectedNodes].sort((a, b) => (Math.abs(a.x - b.x) > 30 ? a.x - b.x : a.y - b.y))[0]
    );
  }, [selectedNodeIds, data.nodes]);

  const currentMultiRootTitle = useMemo(() => {
    if (!currentMultiRootNode) return "首选卡片";
    if (currentMultiRootNode.type === "text") {
      return (
        currentMultiRootNode.text
          .split("\n")[0]
          .replace(/^[#\s*->]+/, "")
          .slice(0, 8) || "卡片"
      );
    }
    if (currentMultiRootNode.type === "group") {
      return currentMultiRootNode.label || "分组";
    }
    if (currentMultiRootNode.type === "file") {
      return currentMultiRootNode.file || "笔记";
    }
    if (currentMultiRootNode.type === "link") {
      return currentMultiRootNode.url || "链接";
    }
    return "卡片";
  }, [currentMultiRootNode]);

  // Viewport frustum bounds for culling off-screen elements with a generous 600px buffer
  const viewportBounds = useMemo(() => {
    const width =
      containerRef.current?.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 1920);
    const height =
      containerRef.current?.clientHeight ||
      (typeof window !== "undefined" ? window.innerHeight : 1080);
    const zoom = viewport.zoom;
    const buffer = 600 / zoom;
    return {
      minX: -viewport.panX / zoom - buffer,
      minY: -viewport.panY / zoom - buffer,
      maxX: (width - viewport.panX) / zoom + buffer,
      maxY: (height - viewport.panY) / zoom + buffer,
    };
  }, [viewport.panX, viewport.panY, viewport.zoom]);

  const isNodeInViewport = useCallback(
    (node: CanvasNode): boolean => {
      if (selectedNodeIds.has(node.id)) return true;
      if (editingNodeId === node.id) return true;
      if (hoveredNodeId === node.id) return true;
      if (connectingState && connectingState.fromNodeId === node.id) return true;
      const nw = node.width || 300;
      const nh = node.height || 200;
      return !(
        node.x + nw < viewportBounds.minX ||
        node.x > viewportBounds.maxX ||
        node.y + nh < viewportBounds.minY ||
        node.y > viewportBounds.maxY
      );
    },
    [selectedNodeIds, editingNodeId, hoveredNodeId, connectingState, viewportBounds],
  );

  const isEdgeInViewport = useCallback(
    (edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): boolean => {
      if (selectedEdgeIds.has(edge.id)) return true;
      if (selectedNodeIds.has(edge.fromNode) || selectedNodeIds.has(edge.toNode)) return true;
      if (editingEdgeId === edge.id) return true;
      const minX = Math.min(fromNode.x, toNode.x);
      const maxX = Math.max(fromNode.x + (fromNode.width || 300), toNode.x + (toNode.width || 300));
      const minY = Math.min(fromNode.y, toNode.y);
      const maxY = Math.max(
        fromNode.y + (fromNode.height || 200),
        toNode.y + (toNode.height || 200),
      );
      return !(
        maxX < viewportBounds.minX ||
        minX > viewportBounds.maxX ||
        maxY < viewportBounds.minY ||
        minY > viewportBounds.maxY
      );
    },
    [selectedEdgeIds, selectedNodeIds, editingEdgeId, viewportBounds],
  );

  // Seed for the batch custom-colour picker: reuse a custom colour already set
  // on one of the selected cards, otherwise start from a neutral blue.
  const batchCustomColor = useMemo(() => {
    const withHex = data.nodes.find(
      (n) => selectedNodeIds.has(n.id) && typeof n.color === "string" && n.color.startsWith("#"),
    );
    return (withHex?.color as string | undefined) ?? "#3b82f6";
  }, [data.nodes, selectedNodeIds]);

  // Same idea for the selection of edges.
  const batchEdgeCustomColor = useMemo(() => {
    const withHex = data.edges.find(
      (e) => selectedEdgeIds.has(e.id) && typeof e.color === "string" && e.color.startsWith("#"),
    );
    return (withHex?.color as string | undefined) ?? "#3b82f6";
  }, [data.edges, selectedEdgeIds]);

  /**
   * Opens the lightbox preview for an image / video / audio media card
   * (double-click). The preview window closes via its own ✕ button or Esc.
   */
  const openMediaPreview = useCallback(
    (node: CanvasFileNode) => {
      const mType = getMediaFileType(node.file);
      if (mType !== "image" && mType !== "video" && mType !== "audio") return;
      const src = resolveMediaSrc(node.file, currentFilePath);
      const title = node.file.split(/[\\/]/).pop() || "媒体预览";
      setLightboxMedia({
        type: mType === "video" ? "video" : mType === "audio" ? "audio" : "image",
        src,
        title,
        alt: title,
      });
    },
    [currentFilePath],
  );

  // ── Ring spacing controls ────────────────────────────────────────────────
  // Live metrics for the alignment dropdown's radius slider. Only meaningful
  // while three or more selected cards actually sit on a common circle.
  const selectedRingInfo = useMemo(() => {
    if (selectedNodeIds.size < 3) return null;
    const cards = data.nodes.filter((n) => selectedNodeIds.has(n.id) && n.type !== "group");
    if (cards.length < 3) return null;
    const layout = computeRingSpacingLayout(cards);
    if (!layout) return null;
    return {
      layout,
      // Generous upper bound so the slider has usable travel without letting
      // the ring fly off the board.
      maxRadius: Math.max(layout.radius * 3, layout.minRadius * 4, 1200),
    };
  }, [selectedNodeIds, data.nodes]);

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
    [],
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
  }, [pushHistory]);

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

      {/* 1. TOP FLOATING GLASSMORPHIC TOOLBAR */}
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

      {/* 7. MARQUEE SELECTION BOX */}
      <MarqueeSelectionBox box={selectionBox} viewport={viewport} />

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

      {/* 9. Floating Toast Feedback */}
      <CanvasToast message={toastMessage} lifted={selectedEdgeIds.size > 1} isDark={isDark} />

      {/* Media preview lightbox (double-click an image / video / audio card) */}
      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />

      {/* 10. Presentation Mode Floating Controls & Slide Drawer */}
      {isPresentationMode &&
        presentationSequence.length > 0 &&
        (() => {
          const presentationAccent = isDark ? "#818cf8" : isEink ? "#1e293b" : "#6366f1";
          const presentationAccentBg = isDark
            ? "rgba(129, 140, 248, 0.22)"
            : isEink
              ? "rgba(30, 41, 59, 0.12)"
              : "rgba(99, 102, 241, 0.15)";
          return (
            <>
              {/* Slide Overview Drawer / Popover */}
              {showSlideDrawer && (
                <div
                  ref={slideDrawerRef}
                  className="canvas-slide-drawer"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="canvas-slide-drawer-header">
                    <div className="canvas-slide-drawer-title">
                      <Film size={14} color={presentationAccent} />
                      <span>分镜大纲 (共 {presentationSequence.length} 幕)</span>
                    </div>
                    <button
                      type="button"
                      className="canvas-slide-drawer-close"
                      onClick={() => setShowSlideDrawer(false)}
                      title="关闭分镜大纲 (Esc / L)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="canvas-slide-drawer-list">
                    {presentationSequence.map((nodeId, idx) => {
                      const n = nodeMap.get(nodeId);
                      if (!n) return null;
                      const isActive = idx === currentSlideIndex;
                      const parentContainer = findContainerForNode(n, data.nodes);
                      let icon = <FileText size={13} />;
                      let title = "";
                      if (n.type === "text") {
                        icon = (
                          <FileText
                            size={13}
                            color={isActive ? presentationAccent : colors.cardText}
                          />
                        );
                        title = n.text.trim().split("\n")[0] || "文本卡片";
                      } else if (n.type === "file") {
                        icon = <ImageIcon size={13} color="#0284c7" />;
                        title = n.file ? n.file.split(/[/\\]/).pop() || n.file : "文件卡片";
                      } else if (n.type === "link") {
                        icon = <ExternalLink size={13} color="#10b981" />;
                        title = n.url || "网页卡片";
                      } else if (n.type === "group") {
                        icon = <Boxes size={13} color="#f59e0b" />;
                        title = (n as CanvasGroupNode).label || "独立分组帧";
                      }

                      return (
                        <button
                          key={nodeId}
                          type="button"
                          className={`canvas-slide-drawer-item ${isActive ? "active" : ""}`}
                          onClick={() => {
                            handleJumpToSlide(idx);
                          }}
                        >
                          <span className="canvas-slide-index">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="canvas-slide-icon">{icon}</span>
                          <span className="canvas-slide-name" title={title}>
                            {title}
                          </span>
                          {parentContainer && parentContainer.label && (
                            <span
                              className="canvas-slide-group-tag"
                              title={`所属分组: ${parentContainer.label}`}
                            >
                              {parentContainer.label}
                            </span>
                          )}
                          {isActive && <span className="canvas-slide-playing-badge">演播中</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                className="canvas-presentation-bar"
                style={{
                  backgroundColor: isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)",
                  backdropFilter: "blur(16px)",
                  border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.12)"}`,
                  color: colors.cardText,
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: presentationAccent,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  🪐 演示模式
                </span>

                <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

                <button
                  onClick={handlePrevSlide}
                  title="上一张 (← / PageUp)"
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.cardText,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  type="button"
                  className={`canvas-presentation-counter-btn ${showSlideDrawer ? "active" : ""}`}
                  onClick={() => setShowSlideDrawer((prev) => !prev)}
                  title="点击展开分镜大纲抽屉 (快捷键 L)"
                >
                  <List size={13} style={{ opacity: 0.8 }} />
                  <span>
                    {currentSlideIndex + 1} / {presentationSequence.length}
                  </span>
                </button>

                <button
                  onClick={handleNextSlide}
                  title="下一张 (→ / 空格 / PageDown)"
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.cardText,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  <ChevronRight size={18} />
                </button>

                <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

                <button
                  onClick={() => setIsAutoPlaying((prev) => !prev)}
                  title={isAutoPlaying ? "暂停自动放映 (P)" : "自动放映 (每 3.5 秒切换, 快捷键 P)"}
                  style={{
                    background: isAutoPlaying ? presentationAccentBg : "none",
                    border: "none",
                    color: isAutoPlaying ? presentationAccent : colors.cardText,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "4px 8px",
                    borderRadius: 6,
                  }}
                >
                  {isAutoPlaying ? <Pause size={14} /> : <Play size={14} />}
                  <span>{isAutoPlaying ? "暂停" : "自动"}</span>
                </button>

                <button
                  onClick={handleToggleFullscreen}
                  title={isFullscreenActive ? "退出全屏 (F / F11)" : "全屏沉浸演示 (F / F11)"}
                  style={{
                    background: "none",
                    border: "none",
                    color: isFullscreenActive ? presentationAccent : colors.cardText,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  {isFullscreenActive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>

                <button
                  onClick={handleTogglePresentation}
                  title="退出演示模式 (Esc)"
                  style={{
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 16,
                    marginLeft: 4,
                  }}
                >
                  <X size={13} />
                  <span>退出</span>
                </button>

                {isAutoPlaying && (
                  <div className="canvas-presentation-progress-track">
                    <div
                      key={`${currentSlideIndex}-${isAutoPlaying}`}
                      className="canvas-presentation-progress-bar"
                    />
                  </div>
                )}
              </div>
            </>
          );
        })()}
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
