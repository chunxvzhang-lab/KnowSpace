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
  Copy,
  ExternalLink,
  Trash2,
  Edit2,
  Check,
  X,
  Palette,
  Link,
  Search,
  Save,
  BoxSelect,
  CheckSquare,
  ArrowUpToLine,
  ArrowDownToLine,
  GitBranch,
  ArrowLeftRight,
  MoveRight,
  Spline,
  AlignLeft,
  AlignRight,
  AlignJustify,
  ArrowUpDown,
  Shuffle,
  Image as ImageIcon,
  Clipboard,
  Grid,
  Minimize2,
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  FilePlus,
  Share2,
  Unlink,
} from "lucide-react";
import type { ThemeMode } from "../core/types";
import type {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasFileNode,
  CanvasLinkNode,
  CanvasGroupNode,
  CanvasViewport,
  CanvasEdgeLabelShape,
  CanvasEdgeLineStyle,
} from "../types/canvasTypes";
import {
  parseCanvasData,
  serializeCanvasData,
  createDefaultCanvas,
  computeBoundingBox,
  getNodeAnchorPoint,
  computeEdgePath,
  extractCanvasToMarkdown,
  CANVAS_COLOR_PALETTES,
  CANVAS_STANDARD_COLOR_IDS,
  CANVAS_RELATION_PRESETS,
  isNodeInsideGroup,
  toggleChecklistInMarkdown,
  createEdgeBetweenNodes,
  spawnConnectedCard,
  connectOneToMany,
  connectChainNodes,
  connectLoopNodes,
  disconnectNodeEdges,
  spawnMultipleBranches,
  computeEdgeMidpoint,
  cycleEdgeArrow,
  cycleEdgeStyle,
  cycleEdgeStrokePattern,
  reverseEdgeDirection,
  getOptimalAnchorSides,
  getStepBendHandleInfo,
  getSourceNodeEdgeColor,
  computeSourceDisplayColorMap,
  expandLoopEdgeSelection,
  syncLoopEdgeGeometry,
  computeGridLayout,
  resizeGridSpacing,
  computeRingSpacingLayout,
  resizeRingSpacing,
  computeMinRingRadius,
  isPointInsideNodeHull,
  alignNodesInCircle,
  projectPointOntoRing,
  downloadCanvasAsImage,
  copyCanvasImageToClipboard,
  CanvasAlignDirection,
  alignNodes,
} from "../services/canvasService";
import { renderCardMarkdown } from "../services/markdown";
import { getCanvasThemeColors } from "../services/canvasTheme";

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
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;
const SIDES: CanvasNodeSide[] = ["top", "right", "bottom", "left"];

/**
 * Shared empty Map so the drag hot path never allocates a throwaway one when
 * nothing else moves alongside the dragged card.
 */
const EMPTY_DRAG_MAP = new Map<string, { id: string; startX: number; startY: number }>();

function getNodePalette(color?: string): { label: string; stroke: string; bg: string } | undefined {
  if (!color) return undefined;
  if (CANVAS_COLOR_PALETTES[color]) return CANVAS_COLOR_PALETTES[color];
  if (color.startsWith("#")) {
    return { label: "自定义", stroke: color, bg: `${color}18` };
  }
  return undefined;
}

function renderEdgeShapeIcon(shape: CanvasEdgeLabelShape, active: boolean) {
  if (shape === "pill") {
    return (
      <svg width="14" height="9" viewBox="0 0 14 9" fill="none" style={{ display: "block" }}>
        <rect
          x="1"
          y="1"
          width="12"
          height="7"
          rx="3.5"
          stroke="currentColor"
          strokeWidth="1.3"
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.25 : 0}
        />
      </svg>
    );
  }
  if (shape === "rect") {
    return (
      <svg width="14" height="9" viewBox="0 0 14 9" fill="none" style={{ display: "block" }}>
        <rect
          x="1"
          y="1"
          width="12"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.25 : 0}
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: "block" }}>
      <polygon
        points="6,1 11,6 6,11 1,6"
        stroke="currentColor"
        strokeWidth="1.3"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.25 : 0}
      />
    </svg>
  );
}

/**
 * Calculates hit nodes intersecting with a marquee box.
 * If normal cards are hit inside a group container, returns only the cards,
 * preventing accidental selection of the background group container.
 */
function computeBoxSelectionHits(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  nodes: CanvasNode[]
): Set<string> {
  const hitCardIds = new Set<string>();
  const hitGroupIds = new Set<string>();

  for (const node of nodes) {
    const nodeRight = node.x + node.width;
    const nodeBottom = node.y + node.height;
    const intersects = node.x < maxX && nodeRight > minX && node.y < maxY && nodeBottom > minY;
    if (!intersects) continue;

    if (node.type === "group") {
      // For groups: only select if the box completely encloses the group or covers its title header
      const fullyEnclosed =
        minX <= node.x && maxX >= nodeRight && minY <= node.y && maxY >= nodeBottom;
      const headerIntersects =
        node.x < maxX && nodeRight > minX && node.y < maxY && node.y + 40 > minY;
      if (fullyEnclosed || headerIntersects) {
        hitGroupIds.add(node.id);
      }
    } else {
      hitCardIds.add(node.id);
    }
  }

  if (hitGroupIds.size > 0 && hitCardIds.size > 0) {
    const hitGroups = nodes.filter(
      (n): n is CanvasGroupNode => n.type === "group" && hitGroupIds.has(n.id)
    );
    const externalCardIds = new Set<string>();
    for (const cardId of hitCardIds) {
      const card = nodes.find((n) => n.id === cardId);
      if (card) {
        const isInsideHitGroup = hitGroups.some((g) => isNodeInsideGroup(card, g));
        if (!isInsideHitGroup) {
          externalCardIds.add(cardId);
        }
      }
    }
    // If there are cards outside the hit groups, select both the groups and external cards
    if (externalCardIds.size > 0) {
      return new Set<string>([...hitGroupIds, ...externalCardIds]);
    }
    // Otherwise all hit cards are inside the group: prefer selecting only the inner cards
    return hitCardIds;
  }

  if (hitCardIds.size > 0) {
    return hitCardIds;
  }
  return hitGroupIds;
}

/**
 * Calculates which edges are enclosed or intersected by the selection marquee box
 */
function computeBoxSelectionEdgeHits(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  edges: CanvasEdge[],
  nodeMap: Map<string, CanvasNode>
): Set<string> {
  const hitEdgeIds = new Set<string>();
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNode);
    const toNode = nodeMap.get(edge.toNode);
    if (!fromNode || !toNode) continue;
    const optSides = getOptimalAnchorSides(fromNode, toNode);
    const fromSide = edge.fromSide || optSides.fromSide;
    const toSide = edge.toSide || optSides.toSide;
    const p1 = getNodeAnchorPoint(fromNode, fromSide);
    const p2 = getNodeAnchorPoint(toNode, toSide);
    const mid = computeEdgeMidpoint(p1, fromSide, p2, toSide, edge.style, edge.stepOffset, getEdgeRing(edge));
    if (mid.x >= minX && mid.x <= maxX && mid.y >= minY && mid.y <= maxY) {
      hitEdgeIds.add(edge.id);
    }
  }
  return hitEdgeIds;
}

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

  // Initialize canvas data
  const [data, setData] = useState<CanvasData>(() => {
    const parsed = parseCanvasData(source);
    if (parsed.nodes.length > 0) return parsed;
    return createDefaultCanvas(title);
  });

  const lastEmittedSourceRef = useRef(source);

  // Synchronize external source changes into internal canvas state
  useEffect(() => {
    if (source && source !== lastEmittedSourceRef.current) {
      const parsed = parseCanvasData(source);
      if (parsed.nodes.length > 0 || parsed.edges.length > 0) {
        setData(parsed);
      }
      lastEmittedSourceRef.current = source;
    }
  }, [source]);

  // History stack for Undo/Redo
  const [history, setHistory] = useState<{ past: CanvasData[]; future: CanvasData[] }>({
    past: [],
    future: [],
  });

  // Viewport transformation
  const [viewport, setViewport] = useState<CanvasViewport>({
    panX: 80,
    panY: 80,
    zoom: 1.0,
  });

  // Multi-node selection & interaction state
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const selectedNodeId = useMemo(() => {
    const arr = Array.from(selectedNodeIds);
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [selectedNodeIds]);
  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIds(id ? new Set([id]) : new Set());
  }, []);

  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const selectedEdgeId = useMemo(() => {
    const arr = Array.from(selectedEdgeIds);
    return arr.length === 1 ? arr[0] : null;
  }, [selectedEdgeIds]);
  const setSelectedEdgeId = useCallback((id: string | null) => {
    setSelectedEdgeIds(id ? new Set([id]) : new Set());
  }, []);

  const connectedInternalEdges = useMemo(() => {
    if (selectedNodeIds.size < 2) return [];
    return data.edges.filter(
      (e) => selectedNodeIds.has(e.fromNode) && selectedNodeIds.has(e.toNode)
    );
  }, [data.edges, selectedNodeIds]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const editingNodeIdRef = useRef<string | null>(null);
  editingNodeIdRef.current = editingNodeId;
  const editingTextRef = useRef<string>("");
  editingTextRef.current = editingText;

  // Mouse marquee box selection
  const [isBoxSelectMode, setIsBoxSelectMode] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const selectionBoxRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const hasDraggedRef = useRef(false);
  const baseSelectionBeforeBoxRef = useRef<Set<string>>(new Set());
  const baseEdgeSelectionBeforeBoxRef = useRef<Set<string>>(new Set());

  // Step bend drag state
  const stepBendDragRef = useRef<{
    edgeId: string;
    startX: number;
    startY: number;
    initialOffset: number;
    orientation: "horizontal" | "vertical";
  } | null>(null);

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
  /** Pending "close the menu after a colour pick" timer. */
  const colorMenuCloseTimerRef = useRef<number | null>(null);

  /**
   * Closes the context menu on a short delay instead of synchronously.
   *
   * `<input type="color">` opens a native OS colour chooser. Unmounting the
   * menu from its onChange handler destroys the input while Chromium is still
   * dismissing that dialog, which crashes the renderer — this is the 闪退 users
   * hit whenever they picked a custom colour. Letting the dialog finish first
   * avoids it entirely.
   *
   * Debounced so a picker that fires onChange repeatedly while the user drags
   * schedules only one close.
   */
  const closeMenuAfterColorPick = useCallback(() => {
    // A real debounce, not a one-shot: while the user drags inside the chooser
    // onChange fires repeatedly, and each call pushes the close further out.
    // The menu therefore only disappears once they have actually stopped, by
    // which point the dialog is on its way out.
    if (colorMenuCloseTimerRef.current !== null) {
      window.clearTimeout(colorMenuCloseTimerRef.current);
    }
    colorMenuCloseTimerRef.current = window.setTimeout(() => {
      colorMenuCloseTimerRef.current = null;
      setContextMenu(null);
    }, 500);
  }, []);

  // Never leave a timer behind that would touch state after unmount.
  useEffect(
    () => () => {
      if (colorMenuCloseTimerRef.current !== null) {
        window.clearTimeout(colorMenuCloseTimerRef.current);
        colorMenuCloseTimerRef.current = null;
      }
    },
    []
  );

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

  // Connecting line dragging state
  const [connectingState, setConnectingState] = useState<{
    fromNodeId: string;
    fromSide: CanvasNodeSide;
    currentX: number;
    currentY: number;
  } | null>(null);
  // Mirrors connectingState for the global mouse listeners, so those listeners
  // can stay mounted across renders instead of being re-attached every time
  // the connection cursor moves.
  const connectingStateRef = useRef(connectingState);
  connectingStateRef.current = connectingState;

  // Dragging card or canvas refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingCanvasRef = useRef(false);
  const canvasDragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    hasMoved?: boolean;
  }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
    hasMoved: false,
  });

  const nodeDragRef = useRef<{
    nodeId: string;
    startNodeX: number;
    startNodeY: number;
    mouseStartX: number;
    mouseStartY: number;
    containedNodes?: Array<{ id: string; startX: number; startY: number }>;
    /**
     * Same data as `containedNodes`, pre-indexed once at drag start. Rebuilding
     * this Map on every mousemove (which can fire several hundred times per
     * second) allocated constantly for no benefit.
     */
    containedMap?: Map<string, { id: string; startX: number; startY: number }>;
    /**
     * When the selection forms a rectangular grid, dragging one of its cards
     * becomes an interactive spacing adjustment instead of a plain move.
     */
    gridSpacing?: {
      layout: ReturnType<typeof computeGridLayout> & object;
      baseGapX: number;
      baseGapY: number;
      startPositions: Array<{ id: string; startX: number; startY: number }>;
      /** Pre-indexed `startPositions`, built once per drag. */
      startById: Map<string, { id: string; startX: number; startY: number }>;
    };
    /**
     * When the selection already sits on a circle, dragging one of its cards
     * resizes the ring — and therefore the spacing between cards — instead of
     * translating it.
     */
    ringSpacing?: {
      layout: NonNullable<ReturnType<typeof computeRingSpacingLayout>>;
    };
  } | null>(null);

  const resizeDragRef = useRef<{
    nodeId: string;
    startW: number;
    startH: number;
    mouseStartX: number;
    mouseStartY: number;
  } | null>(null);

  /**
   * Dragging the hollow middle of a multi-selection (the empty centre of a
   * ring or a grid) moves every selected card together, keeping their relative
   * spacing intact — the cards neither scatter nor drag the canvas behind them.
   */
  const groupDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startById: Map<string, { id: string; startX: number; startY: number }>;
  } | null>(null);
  const rafGroupDragIdRef = useRef<number | null>(null);
  const latestGroupDragPosRef = useRef<{ dx: number; dy: number } | null>(null);

  const latestDataRef = useRef(data);
  latestDataRef.current = data;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const rafDragIdRef = useRef<number | null>(null);
  const rafResizeIdRef = useRef<number | null>(null);
  const latestDragPosRef = useRef<{
    dx: number;
    dy: number;
    updatedId: string;
    startX: number;
    startY: number;
    containedMap: Map<string, { id: string; startX: number; startY: number }>;
    gridSpacing?: {
      layout: ReturnType<typeof computeGridLayout> & object;
      baseGapX: number;
      baseGapY: number;
      startById: Map<string, { id: string; startX: number; startY: number }>;
    };
    ringSpacing?: {
      layout: NonNullable<ReturnType<typeof computeRingSpacingLayout>>;
    };
  } | null>(null);
  const latestResizePosRef = useRef<{
    dw: number;
    dh: number;
    updatedId: string;
    startW: number;
    startH: number;
  } | null>(null);
  // Track freshly created group IDs: these groups should NOT auto-scoop
  // existing cards on their first drag (user must deliberately move cards in)
  const freshGroupIdsRef = useRef<Set<string>>(new Set());

  // ResizeObserver for canvas container to ensure smooth updates
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      // Keep canvas reactive on resize
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Synchronize internal data changes to parent
  // Kept in a ref so `emitChange` (and everything built on it, such as the
  // global mousemove/mouseup listeners) stays referentially stable even when
  // the parent passes a fresh inline callback on every render. Previously that
  // identity churn made React detach and re-attach the window listeners after
  // every single render.
  const onSourceChangeRef = useRef(onSourceChange);
  onSourceChangeRef.current = onSourceChange;

  const emitChange = useCallback(
    (newData: CanvasData) => {
      setData(newData);
      latestDataRef.current = newData;
      const handler = onSourceChangeRef.current;
      if (handler) {
        const serialized = serializeCanvasData(newData);
        lastEmittedSourceRef.current = serialized;
        handler(serialized);
      }
    },
    []
  );

  // Push history snapshot
  const pushHistory = useCallback(
    (newData: CanvasData) => {
      setHistory((prev) => ({
        past: [...prev.past.slice(-25), latestDataRef.current],
        future: [],
      }));
      emitChange(newData);
    },
    [emitChange]
  );

  const handleUndo = useCallback(() => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    setHistory((prev) => ({
      past: prev.past.slice(0, -1),
      future: [latestDataRef.current, ...prev.future],
    }));
    emitChange(previous);
  }, [history, emitChange]);

  const handleRedo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory((prev) => ({
      past: [...prev.past, latestDataRef.current],
      future: prev.future.slice(1),
    }));
    emitChange(next);
  }, [history, emitChange]);

  const handleSaveNodeEdit = useCallback(() => {
    const currentId = editingNodeIdRef.current;
    if (!currentId) return;
    const currentText = editingTextRef.current;
    pushHistory({
      ...data,
      nodes: data.nodes.map((n) => {
        if (n.id === currentId) {
          if (n.type === "text") return { ...n, text: currentText };
          if (n.type === "group") return { ...n, label: currentText };
        }
        return n;
      }),
    });
    setEditingNodeId(null);
  }, [data, pushHistory]);

  const handleSave = useCallback(() => {
    let currentData = data;
    if (editingNodeIdRef.current) {
      const currentId = editingNodeIdRef.current;
      const currentText = editingTextRef.current;
      currentData = {
        ...data,
        nodes: data.nodes.map((n) => {
          if (n.id === currentId) {
            if (n.type === "text") return { ...n, text: currentText };
            if (n.type === "group") return { ...n, label: currentText };
          }
          return n;
        }),
      };
      setData(currentData);
      setEditingNodeId(null);
    }
    const serialized = serializeCanvasData(currentData);
    lastEmittedSourceRef.current = serialized;
    if (onSourceChange) {
      onSourceChange(serialized);
    }
    if (onSave) {
      onSave();
    }
    setContextMenu(null);
  }, [data, onSourceChange, onSave]);

  // Viewport Zooming
  const handleZoom = useCallback((deltaZoom: number, clientX?: number, clientY?: number) => {
    setViewport((prev) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * deltaZoom));
      if (!containerRef.current || clientX === undefined || clientY === undefined) {
        return { ...prev, zoom: newZoom };
      }
      const rect = containerRef.current.getBoundingClientRect();
      const cursorX = clientX - rect.left;
      const cursorY = clientY - rect.top;
      const factor = newZoom / prev.zoom;
      return {
        zoom: newZoom,
        panX: cursorX - (cursorX - prev.panX) * factor,
        panY: cursorY - (cursorY - prev.panY) * factor,
      };
    });
  }, []);

  // Zoom to fit bounding box
  const handleZoomToFit = useCallback(() => {
    if (data.nodes.length === 0) {
      setViewport({ panX: 100, panY: 100, zoom: 1.0 });
      return;
    }
    const bbox = computeBoundingBox(data.nodes);
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 80;
    const scaleX = (rect.width - padding * 2) / bbox.width;
    const scaleY = (rect.height - padding * 2) / bbox.height;
    const fitZoom = Math.min(1.2, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));
    const centerX = bbox.minX + bbox.width / 2;
    const centerY = bbox.minY + bbox.height / 2;
    setViewport({
      zoom: fitZoom,
      panX: rect.width / 2 - centerX * fitZoom,
      panY: rect.height / 2 - centerY * fitZoom,
    });
  }, [data.nodes]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY < 0 ? 1.15 : 0.85;
        handleZoom(delta, e.clientX, e.clientY);
      } else {
        // Pan with normal wheel
        setViewport((prev) => ({
          ...prev,
          panX: prev.panX - e.deltaX,
          panY: prev.panY - e.deltaY,
        }));
      }
    },
    [handleZoom]
  );

  // Marquee box selection starter
  const handleStartBoxSelection = useCallback(
    (e: React.MouseEvent | MouseEvent, isModifier: boolean) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentZoom = viewportRef.current.zoom;
      const currentPanX = viewportRef.current.panX;
      const currentPanY = viewportRef.current.panY;
      const mouseCanvasX = (e.clientX - rect.left - currentPanX) / currentZoom;
      const mouseCanvasY = (e.clientY - rect.top - currentPanY) / currentZoom;
      const newBox = {
        startX: mouseCanvasX,
        startY: mouseCanvasY,
        currentX: mouseCanvasX,
        currentY: mouseCanvasY,
      };
      selectionBoxRef.current = newBox;
      setSelectionBox(newBox);
      baseSelectionBeforeBoxRef.current = isModifier ? new Set(selectedNodeIds) : new Set();
      baseEdgeSelectionBeforeBoxRef.current = isModifier ? new Set(selectedEdgeIds) : new Set();
      if (!isModifier) {
        setSelectedNodeIds(new Set());
        setSelectedEdgeIds(new Set());
      }
    },
    [selectedNodeIds, selectedEdgeIds]
  );

  // Background drag to pan or start box selection
  const handleMouseDownBackground = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
    setContextMenu(null);

    // If a card or group was being edited, commit edits
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
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
        (n) => selectedNodeIds.has(n.id) && n.type !== "group"
      );

      if (isPointInsideNodeHull({ x: canvasX, y: canvasY }, selected)) {
        groupDragRef.current = {
          startClientX: e.clientX,
          startClientY: e.clientY,
          startById: new Map(
            selected.map((n) => [n.id, { id: n.id, startX: n.x, startY: n.y }])
          ),
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
  const handleAddTextCard = useCallback((atX?: number, atY?: number) => {
    if (!editable) return;
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }
    const id = `text-${Date.now()}`;
    const targetX = typeof atX === "number" ? atX : Math.round((-viewport.panX + 300) / viewport.zoom);
    const targetY = typeof atY === "number" ? atY : Math.round((-viewport.panY + 200) / viewport.zoom);
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
  }, [editable, viewport, pushHistory, handleSaveNodeEdit]);

  const handleAddFileCard = useCallback((chapter: { title: string; src: string }, atX?: number, atY?: number) => {
    if (!editable) return;
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }
    const id = `file-${Date.now()}`;
    const targetX = typeof atX === "number" ? atX : Math.round((-viewport.panX + 320) / viewport.zoom);
    const targetY = typeof atY === "number" ? atY : Math.round((-viewport.panY + 220) / viewport.zoom);
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
  }, [editable, viewport, pushHistory, handleSaveNodeEdit]);

  const handleAddGroup = useCallback((atX?: number, atY?: number) => {
    if (!editable) return;
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }
    const id = `group-${Date.now()}`;
    const targetX = typeof atX === "number" ? atX : Math.round((-viewport.panX + 250) / viewport.zoom);
    const targetY = typeof atY === "number" ? atY : Math.round((-viewport.panY + 150) / viewport.zoom);
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
  }, [editable, viewport, pushHistory, handleSaveNodeEdit]);

  const handleDeleteNode = useCallback((nodeId: string) => {
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
  }, [editable, data, pushHistory]);

  const handleDeleteSelected = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    pushHistory({
      nodes: data.nodes.filter((n) => !selectedNodeIds.has(n.id)),
      edges: data.edges.filter((e) => !selectedNodeIds.has(e.fromNode) && !selectedNodeIds.has(e.toNode)),
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
    [editable, data, pushHistory]
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

  const handleBatchColorChange = useCallback((color: string) => {
    if (!editable || selectedNodeIds.size === 0) return;
    pushHistory({
      ...data,
      nodes: data.nodes.map((n) =>
        selectedNodeIds.has(n.id) ? { ...n, color: color || undefined } : n
      ),
    });
    // Deliberately does NOT close the context menu here — the caller decides
    // when. When the colour came from the native picker, closing has to wait
    // until that dialog has finished dismissing; unmounting the <input> from
    // onChange tears it down mid-flight and crashes the renderer (闪退).
  }, [editable, selectedNodeIds, data, pushHistory]);

  const handleBringToFront = useCallback((nodeId: string) => {
    if (!editable) return;
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    pushHistory({
      ...data,
      nodes: [...data.nodes.filter((n) => n.id !== nodeId), node],
    });
    setContextMenu(null);
  }, [editable, data, pushHistory]);

  const handleSendToBack = useCallback((nodeId: string) => {
    if (!editable) return;
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    pushHistory({
      ...data,
      nodes: [node, ...data.nodes.filter((n) => n.id !== nodeId)],
    });
    setContextMenu(null);
  }, [editable, data, pushHistory]);

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
    [editable, editingEdgeId, pushHistory]
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
        edges: currentData.edges.map((e) =>
          selectedEdgeIds.has(e.id) ? { ...e, style } : e
        ),
      });
      const styleName = style === "bezier" ? "贝塞尔曲线" : style === "step" ? "直角折线" : "直线";
      showToast(`已将 ${selectedEdgeIds.size} 条连线设为${styleName}`);
    },
    [editable, selectedEdgeIds, pushHistory, showToast]
  );

  const handleBatchSetEdgeStrokePattern = useCallback(
    (pattern: "solid" | "dashed" | "dotted") => {
      if (!editable || selectedEdgeIds.size === 0) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          selectedEdgeIds.has(e.id) ? { ...e, strokePattern: pattern } : e
        ),
      });
      const patName = pattern === "dashed" ? "虚线" : pattern === "dotted" ? "点线" : "实线";
      showToast(`已将 ${selectedEdgeIds.size} 条连线设为${patName}`);
    },
    [editable, selectedEdgeIds, pushHistory, showToast]
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
        selectedEdgeIds.has(e.id) ? { ...e, strokePattern: nextPattern } : e
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
    let desc = "单向箭头";

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
        selectedEdgeIds.has(e.id) ? { ...e, fromEnd: nextFromEnd, toEnd: nextToEnd } : e
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
        edges: currentData.edges.map((e) =>
          affected.has(e.id) ? { ...e, color: colorKey } : e
        ),
      });
      showToast(`已修改 ${affected.size} 条连线的颜色`);
    },
    [editable, selectedEdgeIds, pushHistory, showToast]
  );

  const handleBatchReverseEdges = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const count = selectedEdgeIds.size;
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? reverseEdgeDirection(e) : e
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
      (e) => !(selectedNodeIds.has(e.fromNode) && selectedNodeIds.has(e.toNode))
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

  const handleStepBendMouseDown = useCallback(
    (
      e: React.MouseEvent,
      edgeId: string,
      orientation: "horizontal" | "vertical",
      currentOffset: number
    ) => {
      if (e.button !== 0 || !editable) return;
      e.preventDefault();
      e.stopPropagation();
      stepBendDragRef.current = {
        edgeId,
        startX: e.clientX,
        startY: e.clientY,
        initialOffset: currentOffset || 0,
        orientation,
      };
    },
    [editable]
  );

  const handleResetEdgeStepOffset = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, stepOffset: undefined } : e
        ),
      });
      showToast("已重置折线转折位置");
    },
    [editable, pushHistory, showToast]
  );

  const handleNodeColorChange = useCallback(
    (nodeId: string, color: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === nodeId ? { ...n, color: color || undefined } : n
        ),
      });
    },
    [editable, pushHistory]
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
    [editable, pushHistory]
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
    [editable, pushHistory]
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
    [editable, pushHistory]
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
    [editable, pushHistory]
  );

  const handleEdgeLabelChange = useCallback(
    (edgeId: string, label: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, label: label.trim() || undefined } : e
        ),
      });
    },
    [editable, pushHistory]
  );

  const handleEdgeLabelShapeChange = useCallback(
    (edgeId: string, shape: CanvasEdgeLabelShape) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, labelShape: shape } : e
        ),
      });
    },
    [editable, pushHistory]
  );

  const handleSetEdgeAnchorSide = useCallback(
    (edgeId: string, sideKey: "fromSide" | "toSide", side: CanvasNodeSide | undefined) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, [sideKey]: side } : e
        ),
      });
    },
    [editable, pushHistory]
  );

  const handleCycleEdgeAnchor = useCallback(
    (edgeId: string, sideKey: "fromSide" | "toSide") => {
      if (!editable) return;
      const currentEdge = latestDataRef.current.edges.find((e) => e.id === edgeId);
      if (!currentEdge) return;
      const current = currentEdge[sideKey];
      const sequence: (CanvasNodeSide | undefined)[] = [undefined, "top", "right", "bottom", "left"];
      const currIdx = sequence.indexOf(current);
      const nextSide = sequence[(currIdx + 1) % sequence.length];
      handleSetEdgeAnchorSide(edgeId, sideKey, nextSide);
    },
    [editable, handleSetEdgeAnchorSide]
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
    [editable, pushHistory]
  );

  const handleSetEdgeStyle = useCallback(
    (edgeId: string, style: CanvasEdgeLineStyle) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, style } : e
        ),
      });
    },
    [editable, pushHistory]
  );

  const handleConnectSelectedNodes = useCallback(() => {
    if (!editable) return;
    const currentData = latestDataRef.current;
    const selectedNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
    if (selectedNodes.length < 2) return;

    // Use spatially sorted chain connection to prevent criss-crossing dead knots
    const newEdges = connectChainNodes(selectedNodes, currentData.edges, "bezier", true, currentData.nodes);

    if (newEdges.length > 0) {
      pushHistory({
        ...currentData,
        edges: [...currentData.edges, ...newEdges],
      });
      showToast(`已按空间顺序建立 ${newEdges.length} 条链式连线`);
    } else {
      showToast("选中的卡片之间已存在关联连线");
    }
    setContextMenu(null);
  }, [editable, selectedNodeIds, pushHistory, showToast]);

  const handleConnectOneToMany = useCallback(
    (specifiedRootId?: string) => {
      if (!editable || selectedNodeIds.size < 2) return;
      const currentData = latestDataRef.current;
      const selectedNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
      if (selectedNodes.length < 2) return;

      // Determine the root node (The "One"):
      // 1. Specified root ID (e.g. from context menu target card)
      // 2. The first selected node in sequence (the user clicks the origin node first, then Shift-selects targets)
      // 3. Fallback to the geometrically leftmost/topmost node
      let rootNode: CanvasNode | undefined;
      if (specifiedRootId) {
        rootNode = selectedNodes.find((n) => n.id === specifiedRootId);
      }
      if (!rootNode) {
        const firstSelectedId = Array.from(selectedNodeIds)[0];
        rootNode = selectedNodes.find((n) => n.id === firstSelectedId);
      }
      if (!rootNode) {
        rootNode = [...selectedNodes].sort((a, b) => {
          const dx = a.x - b.x;
          if (Math.abs(dx) > 30) return dx;
          return a.y - b.y;
        })[0];
      }
      if (!rootNode) return;

      const targetNodes = selectedNodes.filter((n) => n.id !== rootNode!.id);
      const newEdges = connectOneToMany(rootNode, targetNodes, currentData.edges, "bezier", currentData.nodes);

      if (newEdges.length > 0) {
        pushHistory({
          ...currentData,
          edges: [...currentData.edges, ...newEdges],
        });
        const rootTitle =
          rootNode.type === "text"
            ? rootNode.text.split("\n")[0].replace(/^[#\s*->]+/, "").slice(0, 12) || "主卡片"
            : rootNode.type === "group"
            ? rootNode.label || "分组"
            : "主卡片";
        showToast(`已建立以「${rootTitle}」为发起节点的一对多关联（辐射其余 ${newEdges.length} 张卡片）`);
      } else {
        showToast("选中的卡片之间已存在一对多关联");
      }
      setContextMenu(null);
    },
    [editable, selectedNodeIds, selectedNodeId, pushHistory, showToast]
  );

  const handleConnectLoopNodes = useCallback(() => {
    if (!editable) return;
    const currentData = latestDataRef.current;
    const selectedNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
    if (selectedNodes.length < 3) {
      showToast("环形闭环连线至少需要选择 3 个节点");
      return;
    }

    const newEdges = connectLoopNodes(selectedNodes, currentData.edges, "bezier", true, currentData.nodes);

    if (newEdges.length > 0) {
      pushHistory({
        ...currentData,
        edges: [...currentData.edges, ...newEdges],
      });
      showToast(`已按顺时针空间顺序建立 ${newEdges.length} 条闭合环形连线`);
    } else {
      showToast("选中的节点之间已存在闭环关联");
    }
    setContextMenu(null);
  }, [editable, selectedNodeIds, pushHistory, showToast]);

  const handleDisconnectNodeEdges = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const connectedCount = currentData.edges.filter(
        (e) => e.fromNode === nodeId || e.toNode === nodeId
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
    [editable, pushHistory, showToast]
  );

  const handleSpawnMultipleBranches = useCallback(
    (sourceNodeId: string, count: number = 3, direction: "right" | "bottom" = "right") => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const sourceNode = currentData.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      const { newNodes, newEdges } = spawnMultipleBranches(sourceNode, count, direction);
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, ...newNodes],
        edges: [...currentData.edges, ...newEdges],
      });
      setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
      setSelectedEdgeId(null);
      showToast(`已成功派生 ${newNodes.length} 个分支想法卡片`);
      setContextMenu(null);
    },
    [editable, pushHistory, showToast]
  );

  const handleConfirmBatchSpawn = useCallback(() => {
    if (!spawnModalState || !editable) return;
    const { nodeId, count, direction } = spawnModalState;
    handleSpawnMultipleBranches(nodeId, Math.max(1, Math.min(20, count)), direction);
    setSpawnModalState(null);
  }, [spawnModalState, editable, handleSpawnMultipleBranches]);

  const handleSpawnConnectedChild = useCallback(
    (sourceNodeId: string, direction: "right" | "bottom" = "right") => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const sourceNode = currentData.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;
      const { newNode, newEdge } = spawnConnectedCard(sourceNode, direction);
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newNode],
        edges: [...currentData.edges, newEdge],
      });
      setSelectedNodeIds(new Set([newNode.id]));
      setSelectedEdgeId(null);
      setEditingNodeId(newNode.id);
      setEditingText(newNode.text);
      setContextMenu(null);
    },
    [editable, pushHistory]
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
    [editable, selectedNodeIds, pushHistory, showToast]
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
          n.id === nodeId ? { ...n, width: defaultW, height: defaultH } : n
        ),
      });
      showToast("已重置卡片为标准尺寸");
      setContextMenu(null);
    },
    [editable, pushHistory, showToast]
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
    [showToast]
  );

  const handleCopyNodeWikilink = useCallback(
    (node: CanvasNode) => {
      let wikilink = "";
      if (node.type === "file") {
        wikilink = `[[${node.file.replace(/\.md$/i, "")}]]`;
      } else if (node.type === "text") {
        const firstLine = node.text.split("\n")[0].replace(/^[#\s\-*]+/, "").trim();
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
    [showToast]
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
    [onExtractToNote, showToast]
  );

  const handleSelectGroupNodes = useCallback(
    (groupNode: CanvasGroupNode) => {
      const currentData = latestDataRef.current;
      const insideNodes = currentData.nodes.filter(
        (n) => n.id !== groupNode.id && isNodeInsideGroup(n, groupNode)
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
    [showToast]
  );

  const handleFitGroupSize = useCallback(
    (groupNode: CanvasGroupNode) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const insideNodes = currentData.nodes.filter(
        (n) => n.id !== groupNode.id && isNodeInsideGroup(n, groupNode)
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
            : n
        ),
      });
      showToast("分组尺寸已贴合内部卡片");
      setContextMenu(null);
    },
    [editable, pushHistory, showToast]
  );

  const handleDissolveGroup = useCallback(
    (groupNodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: currentData.nodes.filter((n) => n.id !== groupNodeId),
        edges: currentData.edges.filter(
          (e) => e.fromNode !== groupNodeId && e.toNode !== groupNodeId
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
    [editable, selectedNodeId, selectedNodeIds, pushHistory, showToast]
  );

  const handleDeleteGroupWithContents = useCallback(
    (groupNode: CanvasGroupNode) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const insideNodeIds = new Set(
        currentData.nodes
          .filter((n) => n.id === groupNode.id || isNodeInsideGroup(n, groupNode))
          .map((n) => n.id)
      );

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.filter((n) => !insideNodeIds.has(n.id)),
        edges: currentData.edges.filter(
          (e) => !insideNodeIds.has(e.fromNode) && !insideNodeIds.has(e.toNode)
        ),
      });
      setSelectedNodeIds(new Set());
      setSelectedNodeId(null);
      showToast(`已删除分组容器及内部 ${insideNodeIds.size - 1} 张卡片`);
      setContextMenu(null);
    },
    [editable, pushHistory, showToast]
  );

  const handlePasteClipboardAsCard = useCallback(
    async (canvasX: number, canvasY: number) => {
      if (!editable) return;
      let text = "";
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
    [editable, pushHistory, showToast]
  );

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

  const handleContextMenuCanvas = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
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
  }, []);

  const handleContextMenuNode = useCallback((e: React.MouseEvent, node: CanvasNode) => {
    e.preventDefault();
    e.stopPropagation();
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
  }, [selectedNodeIds]);

  const handleContextMenuEdge = useCallback((e: React.MouseEvent, edge: CanvasEdge) => {
    e.preventDefault();
    e.stopPropagation();
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
  }, [selectedEdgeIds]);

  const handleSaveEdgeLabel = () => {
    if (!editingEdgeId) return;
    const currentData = latestDataRef.current;
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        e.id === editingEdgeId ? { ...e, label: editingEdgeLabel.trim() || undefined } : e
      ),
    });
    setEditingEdgeId(null);
  };

  // Node Dragging: when dragging nodes, move all selected nodes together
  const handleNodeDragStart = (e: React.MouseEvent, node: CanvasNode) => {
    if (e.button !== 0) return;

    // Do not initiate drag if user is clicking on interactive controls inside the card
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "BUTTON" ||
        Boolean(target.closest("button")) ||
        Boolean(target.closest("input")) ||
        Boolean(target.closest("textarea")) ||
        Boolean(target.closest(".canvas-resize-handle")))
    ) {
      return;
    }

    // Prevent default to disable native browser text selection and HTML5 drag ghost
    // which otherwise interrupts or completely suppresses window mousemove events
    e.preventDefault();
    e.stopPropagation();

    // Commit any active edits before moving so the card moves smoothly and text is persisted
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }
    setContextMenu(null);

    // Always fetch latest live node data from latestDataRef to prevent stale closures
    const liveNode = latestDataRef.current.nodes.find((n) => n.id === node.id) || node;

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const isGroupBodyClick =
      liveNode.type === "group" && !target?.closest(".canvas-group-header");

    // If in box select mode, or holding modifier over group background body, start box selection
    if (isBoxSelectMode || (isModifier && isGroupBodyClick)) {
      handleStartBoxSelection(e, isModifier);
      return;
    }

    hasDraggedRef.current = false;

    // If modifier key is held on a card or group header, toggle node into/out of selection
    if (isModifier) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(liveNode.id)) next.delete(liveNode.id);
        else next.add(liveNode.id);
        return next;
      });
      return;
    }

    // If clicking a node that is not in current selection, select it
    let currentSelected = selectedNodeIds;
    if (!selectedNodeIds.has(liveNode.id)) {
      currentSelected = new Set([liveNode.id]);
      setSelectedNodeIds(currentSelected);
    }
    setSelectedEdgeId(null);

    // If multiple nodes are selected, drag all of them collaboratively
    if (currentSelected.size > 1) {
      // Grid spacing mode: when the selection forms a complete rectangular
      // grid, dragging a card re-flows the whole grid and adjusts the gutters
      // live, instead of translating every card by the same offset.
      if (liveNode.type !== "group") {
        const selectedCards = latestDataRef.current.nodes.filter(
          (n) => currentSelected.has(n.id) && n.type !== "group"
        );
        const gridLayout = computeGridLayout(selectedCards);
        if (gridLayout) {
          const gridStartById = new Map(
            gridLayout.orderedIds.map((id) => {
              const n = latestDataRef.current.nodes.find((x) => x.id === id)!;
              return [id, { id, startX: n.x, startY: n.y }];
            })
          );
          nodeDragRef.current = {
            nodeId: liveNode.id,
            startNodeX: liveNode.x,
            startNodeY: liveNode.y,
            mouseStartX: e.clientX,
            mouseStartY: e.clientY,
            containedNodes: [],
            containedMap: new Map(),
            gridSpacing: {
              layout: gridLayout,
              baseGapX: Math.max(4, gridLayout.gapX),
              baseGapY: Math.max(4, gridLayout.gapY),
              startPositions: [...gridStartById.values()],
              startById: gridStartById,
            },
          };
          return;
        }

        // Ring spacing mode: the cards already sit on a circle, so dragging one
        // of them resizes the ring — and with it the spacing between cards.
        // Checked after the grid on purpose: a rectangular arrangement also
        // satisfies the circle test (its corners are equidistant from the
        // centre), and the rectangular reading is the more specific one.
        const ringLayout = computeRingSpacingLayout(selectedCards);
        if (ringLayout) {
          nodeDragRef.current = {
            nodeId: liveNode.id,
            startNodeX: liveNode.x,
            startNodeY: liveNode.y,
            mouseStartX: e.clientX,
            mouseStartY: e.clientY,
            containedNodes: [],
            containedMap: new Map(),
            ringSpacing: { layout: ringLayout },
          };
          return;
        }
      }

      const selectedOthers = latestDataRef.current.nodes
        .filter((n) => currentSelected.has(n.id) && n.id !== liveNode.id);

      let containedCards: CanvasNode[] = [];
      if (liveNode.type === "group") {
        containedCards = latestDataRef.current.nodes.filter(
          (n) => n.id !== liveNode.id && !currentSelected.has(n.id) && isNodeInsideGroup(n, liveNode as CanvasGroupNode)
        );
      }

      const allContained = [...selectedOthers, ...containedCards].map((c) => ({
        id: c.id,
        startX: c.x,
        startY: c.y,
      }));

      nodeDragRef.current = {
        nodeId: liveNode.id,
        startNodeX: liveNode.x,
        startNodeY: liveNode.y,
        mouseStartX: e.clientX,
        mouseStartY: e.clientY,
        containedNodes: allContained,
        containedMap: new Map(allContained.map((c) => [c.id, c])),
      };
      return;
    }

    if (liveNode.type === "group") {
      const isFresh = freshGroupIdsRef.current.has(liveNode.id);
      const isAltOnly = e.altKey;
      const allGroups = latestDataRef.current.nodes.filter(
        (n): n is CanvasGroupNode => n.type === "group"
      );
      const thisIdx = latestDataRef.current.nodes.findIndex((x) => x.id === liveNode.id);

      // Cards inside this group that do NOT belong to an older existing container
      const contained = (isFresh || isAltOnly)
        ? []
        : latestDataRef.current.nodes.filter((n) => {
            if (n.id === liveNode.id || n.type === "group") return false;
            if (!isNodeInsideGroup(n, liveNode as CanvasGroupNode)) return false;

            // If card also lies inside another group, check if that group was established earlier
            const otherContainingGroups = allGroups.filter(
              (og) => og.id !== liveNode.id && isNodeInsideGroup(n, og)
            );
            if (otherContainingGroups.length > 0) {
              for (const og of otherContainingGroups) {
                const otherIdx = latestDataRef.current.nodes.findIndex((x) => x.id === og.id);
                if (otherIdx !== -1 && otherIdx < thisIdx) {
                  return false; // older container owns this card, don't drag it
                }
              }
            }
            return true;
          });

      if (isFresh) freshGroupIdsRef.current.delete(liveNode.id);
      const groupContained = contained.map((c) => ({
        id: c.id,
        startX: c.x,
        startY: c.y,
      }));
      nodeDragRef.current = {
        nodeId: liveNode.id,
        startNodeX: liveNode.x,
        startNodeY: liveNode.y,
        mouseStartX: e.clientX,
        mouseStartY: e.clientY,
        containedNodes: groupContained,
        containedMap: new Map(groupContained.map((c) => [c.id, c])),
      };
    } else {
      nodeDragRef.current = {
        nodeId: liveNode.id,
        startNodeX: liveNode.x,
        startNodeY: liveNode.y,
        mouseStartX: e.clientX,
        mouseStartY: e.clientY,
        containedNodes: [],
        containedMap: new Map(),
      };
    }
  };

  // Node Resizing
  const handleNodeResizeStart = (e: React.MouseEvent, node: CanvasNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    resizeDragRef.current = {
      nodeId: node.id,
      startW: node.width,
      startH: node.height,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    };
  };

  // Edge Anchor Dragging
  const handleAnchorMouseDown = (e: React.MouseEvent, nodeId: string, side: CanvasNodeSide) => {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const pt = getNodeAnchorPoint(node, side);
    setConnectingState({
      fromNodeId: nodeId,
      fromSide: side,
      currentX: pt.x,
      currentY: pt.y,
    });
  };

  const handleAnchorMouseUp = (e: React.MouseEvent, targetNodeId: string, targetSide: CanvasNodeSide) => {
    if (!connectingState || connectingState.fromNodeId === targetNodeId) return;
    e.stopPropagation();

    const currentData = latestDataRef.current;
    const fromNode = currentData.nodes.find((n) => n.id === connectingState.fromNodeId);
    const targetNode = currentData.nodes.find((n) => n.id === targetNodeId);
    if (!fromNode || !targetNode) {
      setConnectingState(null);
      return;
    }

    const exists = currentData.edges.some(
      (ed) =>
        (ed.fromNode === fromNode.id && ed.toNode === targetNode.id) ||
        (ed.fromNode === targetNode.id && ed.toNode === fromNode.id)
    );

    if (!exists) {
      const edgeColor = getSourceNodeEdgeColor(fromNode, currentData.edges, currentData.nodes);
      const newEdge: CanvasEdge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromNode: fromNode.id,
        fromSide: connectingState.fromSide,
        fromEnd: "none",
        toNode: targetNode.id,
        toSide: targetSide,
        toEnd: "arrow",
        color: edgeColor,
        style: "bezier",
      };
      pushHistory({
        ...currentData,
        edges: [...currentData.edges, newEdge],
      });
      showToast("已建立卡片关联");
    } else {
      showToast("两张卡片之间已存在关联连线");
    }
    setConnectingState(null);
  };

  const handleCardMouseUpForConnect = useCallback(
    (e: React.MouseEvent, targetNode: CanvasNode) => {
      if (!connectingState || connectingState.fromNodeId === targetNode.id) return;
      e.stopPropagation();

      const currentData = latestDataRef.current;
      const fromNode = currentData.nodes.find((n) => n.id === connectingState.fromNodeId);
      if (!fromNode) {
        setConnectingState(null);
        return;
      }

      const optimal = getOptimalAnchorSides(fromNode, targetNode);
      const fromSide = connectingState.fromSide || optimal.fromSide;
      const toSide = optimal.toSide;

      const exists = currentData.edges.some(
        (ed) =>
          (ed.fromNode === fromNode.id && ed.toNode === targetNode.id) ||
          (ed.fromNode === targetNode.id && ed.toNode === fromNode.id)
      );

      if (!exists) {
        const edgeColor = getSourceNodeEdgeColor(fromNode, currentData.edges, currentData.nodes);
        const newEdge: CanvasEdge = {
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromNode: fromNode.id,
          fromSide,
          fromEnd: "none",
          toNode: targetNode.id,
          toSide,
          toEnd: "arrow",
          color: edgeColor,
          style: "bezier",
        };
        pushHistory({
          ...currentData,
          edges: [...currentData.edges, newEdge],
        });
        showToast("已建立卡片关联");
      } else {
        showToast("两张卡片之间已存在关联连线");
      }
      setConnectingState(null);
    },
    [connectingState, pushHistory, showToast]
  );

  // Interactive checklist toggle in Markdown card
  const handleCardClick = (e: React.MouseEvent, node: CanvasNode) => {
    const target = e.target as HTMLElement;
    if (
      target &&
      target.tagName === "INPUT" &&
      (target as HTMLInputElement).type === "checkbox" &&
      node.type === "text"
    ) {
      e.stopPropagation();
      const cardEl = target.closest(".canvas-card-markdown");
      if (cardEl) {
        const allCheckboxes = Array.from(cardEl.querySelectorAll('input[type="checkbox"]'));
        const idx = allCheckboxes.indexOf(target as HTMLInputElement);
        if (idx !== -1) {
          const updatedText = toggleChecklistInMarkdown(node.text, idx);
          pushHistory({
            ...data,
            nodes: data.nodes.map((n) => (n.id === node.id ? { ...n, text: updatedText } : n)),
          });
        }
      }
    }
  };

  // Global mouse move and up listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Dragging step bend handle
      if (stepBendDragRef.current) {
        const { edgeId, startX, startY, initialOffset, orientation } = stepBendDragRef.current;
        const zoom = viewportRef.current.zoom;
        const delta = orientation === "horizontal" ? (e.clientX - startX) / zoom : (e.clientY - startY) / zoom;
        const newOffset = Math.round(initialOffset + delta);
        setData((prev) => ({
          ...prev,
          edges: prev.edges.map((edge) =>
            edge.id === edgeId ? { ...edge, stepOffset: newOffset } : edge
          ),
        }));
        return;
      }

      // 0. Group drag from the hollow middle of a multi-selection.
      // Every selected card moves by the same offset, so the arrangement keeps
      // its exact shape and spacing.
      if (groupDragRef.current) {
        const group = groupDragRef.current;
        const zoom = viewportRef.current.zoom;
        const dx = (e.clientX - group.startClientX) / zoom;
        const dy = (e.clientY - group.startClientY) / zoom;

        if (
          Math.hypot(e.clientX - group.startClientX, e.clientY - group.startClientY) > 3
        ) {
          hasDraggedRef.current = true;
        }
        latestGroupDragPosRef.current = { dx, dy };

        if (!rafGroupDragIdRef.current) {
          rafGroupDragIdRef.current = requestAnimationFrame(() => {
            rafGroupDragIdRef.current = null;
            const pos = latestGroupDragPosRef.current;
            const active = groupDragRef.current;
            if (!pos || !active) return;

            setData((prev) => {
              const nextNodes = prev.nodes.map((n) => {
                const s = active.startById.get(n.id);
                return s
                  ? {
                      ...n,
                      x: Math.round(s.startX + pos.dx),
                      y: Math.round(s.startY + pos.dy),
                    }
                  : n;
              });
              const nextData = {
                ...prev,
                nodes: nextNodes,
                edges: syncLoopEdgeGeometry(nextNodes, prev.edges),
              };
              latestDataRef.current = nextData;
              return nextData;
            });
          });
        }
        return;
      }

      // 0. Marquee Box Selection
      if (selectionBoxRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const currentZoom = viewportRef.current.zoom;
        const currentPanX = viewportRef.current.panX;
        const currentPanY = viewportRef.current.panY;
        const mouseCanvasX = (e.clientX - rect.left - currentPanX) / currentZoom;
        const mouseCanvasY = (e.clientY - rect.top - currentPanY) / currentZoom;
        const updated = {
          ...selectionBoxRef.current,
          currentX: mouseCanvasX,
          currentY: mouseCanvasY,
        };
        selectionBoxRef.current = updated;
        setSelectionBox(updated);

        // Real-time selection calculation for live visual feedback
        const minX = Math.min(updated.startX, updated.currentX);
        const maxX = Math.max(updated.startX, updated.currentX);
        const minY = Math.min(updated.startY, updated.currentY);
        const maxY = Math.max(updated.startY, updated.currentY);
        const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;

        if (maxX - minX > 4 || maxY - minY > 4) {
          const hitIds = computeBoxSelectionHits(
            minX,
            maxX,
            minY,
            maxY,
            latestDataRef.current.nodes
          );
          setSelectedNodeIds(
            isModifier ? new Set([...baseSelectionBeforeBoxRef.current, ...hitIds]) : hitIds
          );
          const currentNodesMap = new Map(latestDataRef.current.nodes.map((n) => [n.id, n]));
          const hitEdgeIds = computeBoxSelectionEdgeHits(
            minX,
            maxX,
            minY,
            maxY,
            latestDataRef.current.edges,
            currentNodesMap
          );
          setSelectedEdgeIds(
            isModifier ? new Set([...baseEdgeSelectionBeforeBoxRef.current, ...hitEdgeIds]) : hitEdgeIds
          );
        } else {
          setSelectedNodeIds(baseSelectionBeforeBoxRef.current);
          setSelectedEdgeIds(baseEdgeSelectionBeforeBoxRef.current);
        }
        return;
      }

      // 1. Panning canvas
      if (isDraggingCanvasRef.current) {
        const dx = e.clientX - canvasDragStartRef.current.x;
        const dy = e.clientY - canvasDragStartRef.current.y;
        if (Math.hypot(dx, dy) > 4) {
          canvasDragStartRef.current.hasMoved = true;
        }
        setViewport((prev) => ({
          ...prev,
          panX: canvasDragStartRef.current.panX + dx,
          panY: canvasDragStartRef.current.panY + dy,
        }));
        return;
      }

      // 2. Dragging node (with multi-select collaborative dragging & group coordination)
      if (nodeDragRef.current) {
        const dragInfo = nodeDragRef.current;
        if (
          Math.hypot(e.clientX - dragInfo.mouseStartX, e.clientY - dragInfo.mouseStartY) > 3
        ) {
          hasDraggedRef.current = true;
        }
        const currentZoom = viewportRef.current.zoom;
        const dx = (e.clientX - dragInfo.mouseStartX) / currentZoom;
        const dy = (e.clientY - dragInfo.mouseStartY) / currentZoom;
        const updatedId = dragInfo.nodeId;
        const startX = dragInfo.startNodeX;
        const startY = dragInfo.startNodeY;
        // Reuse the Maps built once at drag start. These used to be rebuilt on
        // every mousemove, which fires far more often than the frame rate.
        latestDragPosRef.current = {
          dx,
          dy,
          updatedId,
          startX,
          startY,
          containedMap: dragInfo.containedMap ?? EMPTY_DRAG_MAP,
          // The drag-start gridSpacing already carries a ready `startById` Map.
          gridSpacing: dragInfo.gridSpacing,
          ringSpacing: dragInfo.ringSpacing,
        };

        // Standard 60fps RAF throttling: update when frame is ready without dropping intermediate movement
        if (!rafDragIdRef.current) {
          rafDragIdRef.current = requestAnimationFrame(() => {
            rafDragIdRef.current = null;
            const pos = latestDragPosRef.current;
            if (!pos) return;
            setData((prev) => {
              // ── Grid spacing mode ──────────────────────────────────────
              // The dragged card follows the pointer while the remaining
              // cards re-flow around it with the new gutters.
              let workingNodes = prev.nodes;
              if (pos.gridSpacing) {
                const gs = pos.gridSpacing;
                const startPos = gs.startById.get(pos.updatedId);
                workingNodes = prev.nodes.map((n) =>
                  n.id === pos.updatedId && startPos
                    ? {
                        ...n,
                        x: Math.round(startPos.startX + pos.dx),
                        y: Math.round(startPos.startY + pos.dy),
                      }
                    : n
                );
                workingNodes = resizeGridSpacing(
                  workingNodes,
                  gs.layout,
                  pos.updatedId,
                  pos.dx,
                  pos.dy,
                  gs.baseGapX,
                  gs.baseGapY
                );
                const gridData = {
                  ...prev,
                  nodes: workingNodes,
                  // Keep loop metadata glued to the re-flowed cards
                  edges: syncLoopEdgeGeometry(workingNodes, prev.edges),
                };
                latestDataRef.current = gridData;
                return gridData;
              }

              // ── Ring spacing mode ──────────────────────────────────────
              // The dragged card follows the pointer; its distance from the
              // ring centre becomes the new radius, and every other card keeps
              // its seat while re-distributing around that circle.
              if (pos.ringSpacing) {
                const rs = pos.ringSpacing;
                const movedNodes = prev.nodes.map((n) =>
                  n.id === pos.updatedId
                    ? {
                        ...n,
                        x: Math.round(pos.startX + pos.dx),
                        y: Math.round(pos.startY + pos.dy),
                      }
                    : n
                );
                const moved = movedNodes.find((n) => n.id === pos.updatedId);
                if (moved) {
                  const ringNodes = resizeRingSpacing(movedNodes, rs.layout, pos.updatedId, {
                    x: moved.x + moved.width / 2,
                    y: moved.y + moved.height / 2,
                  });
                  const ringData = {
                    ...prev,
                    nodes: ringNodes,
                    edges: syncLoopEdgeGeometry(ringNodes, prev.edges),
                  };
                  latestDataRef.current = ringData;
                  return ringData;
                }
              }

              const movedNodes = workingNodes.map((n) => {
                if (n.id === pos.updatedId) {
                  return {
                    ...n,
                    x: Math.round(pos.startX + pos.dx),
                    y: Math.round(pos.startY + pos.dy),
                  };
                }
                const contained = pos.containedMap.get(n.id);
                if (contained) {
                  return {
                    ...n,
                    x: Math.round(contained.startX + pos.dx),
                    y: Math.round(contained.startY + pos.dy),
                  };
                }
                return n;
              });

              const nextData = {
                ...prev,
                nodes: movedNodes,
                // Recompute ring/grid metadata against the new card positions
                // so a closed loop stays attached to its cards while dragged.
                edges: syncLoopEdgeGeometry(movedNodes, prev.edges),
              };
              latestDataRef.current = nextData;
              return nextData;
            });
          });
        }
        return;
      }

      // 3. Resizing node
      if (resizeDragRef.current) {
        const resizeInfo = resizeDragRef.current;
        const currentZoom = viewportRef.current.zoom;
        const dw = (e.clientX - resizeInfo.mouseStartX) / currentZoom;
        const dh = (e.clientY - resizeInfo.mouseStartY) / currentZoom;
        const updatedId = resizeInfo.nodeId;
        const startW = resizeInfo.startW;
        const startH = resizeInfo.startH;

        latestResizePosRef.current = { dw, dh, updatedId, startW, startH };

        if (!rafResizeIdRef.current) {
          rafResizeIdRef.current = requestAnimationFrame(() => {
            rafResizeIdRef.current = null;
            const pos = latestResizePosRef.current;
            if (!pos) return;
            setData((prev) => {
              const nextData = {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === pos.updatedId
                    ? {
                        ...n,
                        width: Math.max(180, Math.round(pos.startW + pos.dw)),
                        height: Math.max(100, Math.round(pos.startH + pos.dh)),
                      }
                    : n
                ),
              };
              latestDataRef.current = nextData;
              return nextData;
            });
          });
        }
        return;
      }

      // 4. Connecting edge
      if (connectingStateRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const currentZoom = viewportRef.current.zoom;
        const currentPanX = viewportRef.current.panX;
        const currentPanY = viewportRef.current.panY;
        const mouseCanvasX = (e.clientX - rect.left - currentPanX) / currentZoom;
        const mouseCanvasY = (e.clientY - rect.top - currentPanY) / currentZoom;
        setConnectingState((prev) =>
          prev ? { ...prev, currentX: mouseCanvasX, currentY: mouseCanvasY } : null
        );
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (rafDragIdRef.current) {
        cancelAnimationFrame(rafDragIdRef.current);
        rafDragIdRef.current = null;
      }
      if (rafResizeIdRef.current) {
        cancelAnimationFrame(rafResizeIdRef.current);
        rafResizeIdRef.current = null;
      }
      if (rafGroupDragIdRef.current) {
        cancelAnimationFrame(rafGroupDragIdRef.current);
        rafGroupDragIdRef.current = null;
      }
      latestDragPosRef.current = null;
      latestResizePosRef.current = null;
      latestGroupDragPosRef.current = null;

      // Complete a group drag from the hollow middle of a multi-selection.
      if (groupDragRef.current) {
        groupDragRef.current = null;
        if (hasDraggedRef.current) {
          pushHistory(latestDataRef.current);
        }
        // Either way the selection stays as it was: a background press used to
        // clear it, but inside the group that would drop the very selection
        // the user is working with.
        return;
      }

      // Complete step bend dragging
      if (stepBendDragRef.current) {
        const { edgeId, initialOffset } = stepBendDragRef.current;
        stepBendDragRef.current = null;
        const currentEdge = latestDataRef.current.edges.find((e) => e.id === edgeId);
        if (currentEdge && (currentEdge.stepOffset || 0) !== initialOffset) {
          pushHistory(latestDataRef.current);
        }
      }

      // Complete box selection
      if (selectionBoxRef.current) {
        const box = selectionBoxRef.current;
        selectionBoxRef.current = null;
        setSelectionBox(null);
        const minX = Math.min(box.startX, box.currentX);
        const maxX = Math.max(box.startX, box.currentX);
        const minY = Math.min(box.startY, box.currentY);
        const maxY = Math.max(box.startY, box.currentY);
        const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
        if (maxX - minX > 4 || maxY - minY > 4) {
          const hitIds = computeBoxSelectionHits(
            minX,
            maxX,
            minY,
            maxY,
            latestDataRef.current.nodes
          );
          setSelectedNodeIds(
            isModifier ? new Set([...baseSelectionBeforeBoxRef.current, ...hitIds]) : hitIds
          );
          const currentNodesMap = new Map(latestDataRef.current.nodes.map((n) => [n.id, n]));
          const hitEdgeIds = computeBoxSelectionEdgeHits(
            minX,
            maxX,
            minY,
            maxY,
            latestDataRef.current.edges,
            currentNodesMap
          );
          setSelectedEdgeIds(
            isModifier ? new Set([...baseEdgeSelectionBeforeBoxRef.current, ...hitEdgeIds]) : hitEdgeIds
          );
        } else {
          setSelectedNodeIds(baseSelectionBeforeBoxRef.current);
          setSelectedEdgeIds(baseEdgeSelectionBeforeBoxRef.current);
        }
      }

      if (isDraggingCanvasRef.current) {
        isDraggingCanvasRef.current = false;
        if (!canvasDragStartRef.current.hasMoved) {
          setSelectedNodeIds(new Set());
          setSelectedEdgeIds(new Set());
        }
      }
      if (nodeDragRef.current) {
        const dragInfo = nodeDragRef.current;
        const currentZoom = viewportRef.current.zoom;
        const dx = (e.clientX - dragInfo.mouseStartX) / currentZoom;
        const dy = (e.clientY - dragInfo.mouseStartY) / currentZoom;

        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          const updatedId = dragInfo.nodeId;
          const startX = dragInfo.startNodeX;
          const startY = dragInfo.startNodeY;
          const containedMap = dragInfo.containedMap ?? EMPTY_DRAG_MAP;

          let finalNodes: CanvasNode[];
          if (dragInfo.ringSpacing) {
            // Ring spacing drag: settle the ring on the final radius
            const rs = dragInfo.ringSpacing;
            const movedNodes = latestDataRef.current.nodes.map((n) =>
              n.id === updatedId
                ? { ...n, x: Math.round(startX + dx), y: Math.round(startY + dy) }
                : n
            );
            const moved = movedNodes.find((n) => n.id === updatedId);
            finalNodes = moved
              ? resizeRingSpacing(movedNodes, rs.layout, updatedId, {
                  x: moved.x + moved.width / 2,
                  y: moved.y + moved.height / 2,
                })
              : movedNodes;
          } else if (dragInfo.gridSpacing) {
            // Grid spacing drag: settle the grid on the final gutters
            const gs = dragInfo.gridSpacing;
            const startPos = gs.startPositions.find((p) => p.id === updatedId);
            const movedNodes = latestDataRef.current.nodes.map((n) =>
              n.id === updatedId && startPos
                ? {
                    ...n,
                    x: Math.round(startPos.startX + dx),
                    y: Math.round(startPos.startY + dy),
                  }
                : n
            );
            finalNodes = resizeGridSpacing(
              movedNodes,
              gs.layout,
              updatedId,
              dx,
              dy,
              gs.baseGapX,
              gs.baseGapY
            );
          } else {
            finalNodes = latestDataRef.current.nodes.map((n) => {
              if (n.id === updatedId) {
                return {
                  ...n,
                  x: Math.round(startX + dx),
                  y: Math.round(startY + dy),
                };
              }
              const contained = containedMap.get(n.id);
              if (contained) {
                return {
                  ...n,
                  x: Math.round(contained.startX + dx),
                  y: Math.round(contained.startY + dy),
                };
              }
              return n;
            });
          }

          // Re-sync straight/arc metadata with the settled layout so the
          // rendered frame matches where the cards ended up.
          const settledEdges = syncLoopEdgeGeometry(finalNodes, latestDataRef.current.edges);

          const finalData = {
            ...latestDataRef.current,
            nodes: finalNodes,
            edges: settledEdges,
          };
          latestDataRef.current = finalData;
          setData(finalData);
          emitChange(finalData);
          pushHistory(finalData);
        }

        nodeDragRef.current = null;
      }

      if (resizeDragRef.current) {
        const resizeInfo = resizeDragRef.current;
        const currentZoom = viewportRef.current.zoom;
        const dw = (e.clientX - resizeInfo.mouseStartX) / currentZoom;
        const dh = (e.clientY - resizeInfo.mouseStartY) / currentZoom;

        if (rafResizeIdRef.current) {
          cancelAnimationFrame(rafResizeIdRef.current);
          rafResizeIdRef.current = null;
        }

        if (Math.abs(dw) > 0 || Math.abs(dh) > 0) {
          const updatedId = resizeInfo.nodeId;
          const startW = resizeInfo.startW;
          const startH = resizeInfo.startH;
          const finalNodes = latestDataRef.current.nodes.map((n) => {
            if (n.id === updatedId) {
              return {
                ...n,
                width: Math.max(120, Math.round(startW + dw)),
                height: Math.max(60, Math.round(startH + dh)),
              };
            }
            return n;
          });
          const finalData = { ...latestDataRef.current, nodes: finalNodes };
          latestDataRef.current = finalData;
          setData(finalData);
          emitChange(finalData);
          pushHistory(finalData);
        } else {
          pushHistory(latestDataRef.current);
        }

        resizeDragRef.current = null;
      }
      // Unconditional: React bails out when the value is already null, and this
      // keeps `connectingState` out of the listener's dependency list so the
      // listeners are attached once instead of on every connection update.
      setConnectingState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [pushHistory]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global Save shortcut (Ctrl+S / Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
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
          setEditingText(node.type === "text" ? node.text : node.type === "group" ? node.label || "" : "");
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
  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

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
    [data.nodes, data.edges]
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
      return currentMultiRootNode.text.split("\n")[0].replace(/^[#\s*->]+/, "").slice(0, 8) || "卡片";
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

  // Seed for the batch custom-colour picker: reuse a custom colour already set
  // on one of the selected cards, otherwise start from a neutral blue.
  const batchCustomColor = useMemo(() => {
    const withHex = data.nodes.find(
      (n) => selectedNodeIds.has(n.id) && typeof n.color === "string" && n.color.startsWith("#")
    );
    return (withHex?.color as string | undefined) ?? "#3b82f6";
  }, [data.nodes, selectedNodeIds]);

  // Same idea for the selection of edges.
  const batchEdgeCustomColor = useMemo(() => {
    const withHex = data.edges.find(
      (e) => selectedEdgeIds.has(e.id) && typeof e.color === "string" && e.color.startsWith("#")
    );
    return (withHex?.color as string | undefined) ?? "#3b82f6";
  }, [data.edges, selectedEdgeIds]);

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
    []
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
    [selectedRingInfo, applyRingRadius]
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
      className={`knowspace-canvas-view theme-${theme} ${isNarrow ? "is-narrow" : ""}`}
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
    >
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
          title={isBoxSelectMode ? "退出框选模式 (可直接按 Shift+拖动)" : "开启框选模式 (或按住 Shift+鼠标拖动)"}
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
              <span className="canvas-btn-label">一对多关联 (以「{currentMultiRootTitle}」发起源)</span>
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
                    backgroundColor:
                      theme === "eink" ? "#f4f1ea" : !isDark ? "#ffffff" : "#1e293b",
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
                  {([
                    ["horizontal", "水平中线对齐", AlignJustify],
                    ["vertical", "垂直中线对齐", AlignCenter],
                  ] as const).map(([dir, label, Icon]) => (
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
                        <div
                          className="canvas-ctx-slider"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="canvas-ctx-section-label">
                            环半径 ·{" "}
                            {Math.round(ringRadiusDraft ?? selectedRingInfo.layout.radius)}px
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
                  {([
                    ["left", "左对齐", AlignLeft],
                    ["center", "水平居中", null],
                    ["right", "右对齐", AlignRight],
                    ["top", "顶端对齐", ArrowUpToLine],
                    ["bottom", "底端对齐", ArrowDownToLine],
                  ] as const).map(([dir, label, Icon]) => (
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
          style={{ fontSize: 12, fontWeight: 500, minWidth: 42, textAlign: "center", cursor: "pointer" }}
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
          <Maximize2 size={14} />
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

      {/* 2. INFINITE CANVAS 2D TRANSFORM VIEWPORT */}
      <div
        className="canvas-world"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          backgroundImage: `radial-gradient(${colors.dotColor} 1.2px, transparent 1.2px)`,
          backgroundSize: "28px 28px",
        }}
      >
        {/* SVG EDGES LAYER */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 100000,
            height: 100000,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <defs>
            <marker
              id="canvas-arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={colors.edgeColor} />
            </marker>
            <marker
              id="canvas-arrow-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            {Object.entries(CANVAS_COLOR_PALETTES).map(([key, col]) => (
              <marker
                key={key}
                id={`canvas-arrow-${key}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill={col.stroke} />
              </marker>
            ))}
            {Array.from(
              new Set(
                data.edges
                  .map((e) => e.color)
                  .filter((c): c is string => typeof c === "string" && c.startsWith("#"))
              )
            ).map((hex) => (
              <marker
                key={hex}
                id={`canvas-arrow-${hex.replace("#", "hex-")}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill={hex} />
              </marker>
            ))}
          </defs>

          {/* Render Existing Edges */}
          {data.edges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromNode);
            const toNode = nodeMap.get(edge.toNode);
            if (!fromNode || !toNode) return null;

            const optSides = getOptimalAnchorSides(fromNode, toNode);
            const fromSide = edge.fromSide || optSides.fromSide;
            const toSide = edge.toSide || optSides.toSide;
            const p1 = getNodeAnchorPoint(fromNode, fromSide);
            const p2 = getNodeAnchorPoint(toNode, toSide);
            // A rectangular grid layout connects its cards with straight
            // orthogonal segments so the loop reads as a rectangular frame;
            // any leftover arc metadata is ignored in that case.
            const ringArc = edge.gridPath ? undefined : getEdgeRing(edge);
            const effectiveStyle = edge.gridPath ? "straight" : edge.style;
            const pathData = computeEdgePath(p1, fromSide, p2, toSide, effectiveStyle, edge.stepOffset, ringArc);
            // On a ring the origin dot must sit on the circle, not on the raw
            // card anchor point.
            const originPoint = ringArc ? projectPointOntoRing(p1, ringArc) : p1;

            const isSelected = selectedEdgeIds.has(edge.id);
            const effectiveColorKey =
              (edge.fromNode && sourceDisplayColorMap.get(edge.fromNode)) || edge.color;
            const edgeColor =
              effectiveColorKey && CANVAS_COLOR_PALETTES[effectiveColorKey]
                ? CANVAS_COLOR_PALETTES[effectiveColorKey].stroke
                : effectiveColorKey?.startsWith("#")
                ? effectiveColorKey
                : colors.edgeColor;

            const getMarkerUrl = (col?: string, selected?: boolean) => {
              if (selected) return "url(#canvas-arrow-selected)";
              const activeCol = col || effectiveColorKey;
              if (!activeCol) return "url(#canvas-arrow-default)";
              if (CANVAS_COLOR_PALETTES[activeCol]) return `url(#canvas-arrow-${activeCol})`;
              if (activeCol.startsWith("#")) return `url(#canvas-arrow-${activeCol.replace("#", "hex-")})`;
              return "url(#canvas-arrow-default)";
            };

            const strokeDash =
              edge.strokePattern === "dashed"
                ? "7 4"
                : edge.strokePattern === "dotted"
                ? "2.5 4"
                : undefined;

            return (
              <g
                key={edge.id}
                style={{ pointerEvents: "all" }}
                onContextMenu={(e) => handleContextMenuEdge(e, edge)}
              >
                {/* Thick invisible hit area */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      setSelectedEdgeIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(edge.id)) next.delete(edge.id);
                        else next.add(edge.id);
                        return next;
                      });
                    } else {
                      setSelectedEdgeIds(new Set([edge.id]));
                      setSelectedNodeIds(new Set());
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingEdgeId(edge.id);
                    setEditingEdgeLabel(edge.label || "");
                  }}
                />
                {/* Selection Halo Glow */}
                {isSelected && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={7}
                    strokeOpacity={0.28}
                    strokeLinecap="round"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {/* Visual stroke */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={isSelected ? "#f59e0b" : edgeColor}
                  strokeWidth={isSelected ? 2.5 : hoveredNodeId === edge.fromNode ? 2.8 : 2}
                  strokeDasharray={strokeDash}
                  markerStart={
                    edge.fromEnd === "arrow"
                      ? getMarkerUrl(effectiveColorKey, isSelected)
                      : undefined
                  }
                  markerEnd={
                    edge.toEnd === "arrow"
                      ? getMarkerUrl(effectiveColorKey, isSelected)
                      : undefined
                  }
                  style={{
                    transition: "stroke 0.2s, stroke-width 0.2s, filter 0.2s",
                    filter: isSelected
                      ? "drop-shadow(0 0 5px rgba(245,158,11,0.5))"
                      : hoveredNodeId === edge.fromNode
                      ? `drop-shadow(0 0 6px ${edgeColor})`
                      : undefined,
                  }}
                />
                {/* Source Origin Anchor Dot (起点端点指示器: 明确发起源) */}
                {edge.fromEnd !== "arrow" && (
                  <circle
                    cx={originPoint.x}
                    cy={originPoint.y}
                    r={isSelected ? 4.5 : hoveredNodeId === edge.fromNode ? 4.2 : 3.8}
                    fill={isSelected ? "#f59e0b" : edgeColor}
                    stroke={isDark ? "#0f172a" : "#ffffff"}
                    strokeWidth={1.4}
                    style={{ pointerEvents: "none", transition: "r 0.15s ease" }}
                  />
                )}
                {/* Interactive Endpoint Anchor Handles when Selected */}
                {isSelected && editable && (
                  <g className="canvas-edge-anchor-handles">
                    <circle
                      cx={p1.x}
                      cy={p1.y}
                      r={5}
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCycleEdgeAnchor(edge.id, "fromSide");
                      }}
                    >
                      <title>{`起点锚点: ${fromSide} (点击切换边)`}</title>
                    </circle>
                    <circle
                      cx={p2.x}
                      cy={p2.y}
                      r={5}
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCycleEdgeAnchor(edge.id, "toSide");
                      }}
                    >
                      <title>{`终点锚点: ${toSide} (点击切换边)`}</title>
                    </circle>
                  </g>
                )}
                {/* Interactive Step Bend Drag Handle when Selected */}
                {isSelected && edge.style === "step" && editable && (() => {
                  const bendInfo = getStepBendHandleInfo(p1, fromSide, p2, toSide, edge.stepOffset);
                  const isHoriz = bendInfo.orientation === "horizontal";
                  return (
                    <g
                      className="canvas-step-bend-handle"
                      style={{ cursor: isHoriz ? "ew-resize" : "ns-resize" }}
                      onMouseDown={(e) =>
                        handleStepBendMouseDown(e, edge.id, bendInfo.orientation, edge.stepOffset || 0)
                      }
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleResetEdgeStepOffset(edge.id);
                      }}
                    >
                      <title>{`拖拽平移折线转折位置 (双击复位)`}</title>
                      <circle
                        cx={bendInfo.x}
                        cy={bendInfo.y}
                        r={11}
                        fill="transparent"
                      />
                      <rect
                        x={bendInfo.x - (isHoriz ? 4 : 8)}
                        y={bendInfo.y - (isHoriz ? 8 : 4)}
                        width={isHoriz ? 8 : 16}
                        height={isHoriz ? 16 : 8}
                        rx={4}
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))" }}
                      />
                      <circle
                        cx={bendInfo.x}
                        cy={bendInfo.y}
                        r={1.5}
                        fill="#f59e0b"
                        style={{ pointerEvents: "none" }}
                      />
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Active Connecting Dragging Line */}
          {connectingState && (() => {
            const fromNode = nodeMap.get(connectingState.fromNodeId);
            const startPt = fromNode
              ? getNodeAnchorPoint(fromNode, connectingState.fromSide)
              : { x: connectingState.currentX, y: connectingState.currentY };
            return (
              <path
                d={`M ${startPt.x} ${startPt.y} L ${connectingState.currentX} ${connectingState.currentY}`}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 5"
                markerEnd="url(#canvas-arrow-default)"
              />
            );
          })()}
        </svg>

        {/* 3. MULTIMODAL CARDS LAYER */}
        {data.nodes.map((node) => {
          const isSelected = selectedNodeIds.has(node.id);
          const isHovered = hoveredNodeId === node.id;
          const isEditing = editingNodeId === node.id;
          const palette = getNodePalette(node.color);

          // Render Group Container (z-index: 2)
          if (node.type === "group") {
            const isGroupConnectingTarget =
              connectingState !== null && connectingState.fromNodeId !== node.id;
            const groupOutgoingInfo = nodeOutgoingMap.get(node.id);
            const isGroupOneToManySource = !!groupOutgoingInfo && groupOutgoingInfo.count >= 2;
            const isGroupMultiRoot = selectedNodeIds.size >= 2 && currentMultiRootNode?.id === node.id;
            return (
              <div
                key={node.id}
                className={`canvas-node canvas-group ${isSelected ? "selected" : ""} ${isGroupConnectingTarget ? "connecting-target" : ""}`}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  zIndex: 2,
                  borderRadius: 16,
                  border: isSelected
                    ? "2px solid #f59e0b"
                    : isGroupConnectingTarget && isHovered
                    ? "2px solid #0284c7"
                    : isGroupConnectingTarget
                    ? "2px dashed rgba(2, 132, 199, 0.7)"
                    : palette
                    ? `2px dashed ${palette.stroke}`
                    : `2px dashed ${colors.groupBorder}`,
                  backgroundColor: palette ? palette.bg : colors.groupBg,
                  boxShadow: isSelected
                    ? "0 0 16px rgba(245,158,11,0.3)"
                    : isGroupConnectingTarget && isHovered
                    ? "0 0 0 3px rgba(2, 132, 199, 0.4), 0 0 16px rgba(2, 132, 199, 0.3)"
                    : undefined,
                  display: "flex",
                  flexDirection: "column",
                  cursor: isGroupConnectingTarget ? "crosshair" : "move",
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
                  if (e.shiftKey || e.ctrlKey || e.metaKey || hasDraggedRef.current) return;
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                }}
              >
                {/* Multi-select One-to-Many Root indicator on Group */}
                {isGroupMultiRoot && (
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

                {/* Drop-to-connect visual badge on group */}
                {isGroupConnectingTarget && isHovered && (
                  <div
                    style={{
                      position: "absolute",
                      top: -24,
                      left: "50%",
                      transform: "translateX(-50%)",
                      backgroundColor: "#0284c7",
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
                    松开以建立与此分组的关联
                  </div>
                )}

                {/* Group Title Badge */}
                <div
                  className="canvas-group-header"
                  style={{
                    padding: "6px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: palette ? palette.stroke : colors.edgeColor,
                    color: "#ffffff",
                    borderTopLeftRadius: 14,
                    borderTopRightRadius: 14,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "grab",
                  }}
                  onMouseDown={(e) => handleNodeDragStart(e, node)}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveNodeEdit();
                        if (e.key === "Escape") setEditingNodeId(null);
                      }}
                      onBlur={handleSaveNodeEdit}
                      autoFocus
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "none",
                        color: "#ffffff",
                        borderRadius: 4,
                        padding: "2px 6px",
                        flex: 1,
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingNodeId(node.id);
                          setEditingText(node.label || "");
                        }}
                        title="双击重命名 | 拖动移动分组"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        📁 {node.label || "未命名分组"}
                      </span>
                      {isGroupOneToManySource && (
                        <span
                          title={`该分组容器是一对多发起源，向外辐射连接了 ${groupOutgoingInfo.count} 项`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 8,
                            backgroundColor: "rgba(255, 255, 255, 0.25)",
                            color: "#ffffff",
                            border: "1px solid rgba(255, 255, 255, 0.5)",
                            marginLeft: 4,
                            whiteSpace: "nowrap",
                          }}
                        >
                          🌱 发起源 · {groupOutgoingInfo.count}
                        </span>
                      )}
                    </div>
                  )}
                  {isSelected && editable && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        style={{ background: "none", border: "none", color: "#ffffff", cursor: "pointer" }}
                        title="删除分组"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* 4 Connection Anchors on Group Container */}
                {editable &&
                  (isSelected || isHovered || connectingState !== null) &&
                  SIDES.map((side) => {
                    const dotStyle = getAnchorDotStyle(side, colors);
                    return (
                      <div
                        key={side}
                        className="canvas-anchor-dot"
                        style={{
                          ...dotStyle,
                          zIndex: 30,
                        }}
                        onMouseDown={(e) => handleAnchorMouseDown(e, node.id, side)}
                        onMouseUp={(e) => handleAnchorMouseUp(e, node.id, side)}
                        title={`从分组 ${side} 边缘拉出连线`}
                      />
                    );
                  })}

                {/* Resize Handle */}
                {isSelected && editable && (
                  <div
                    style={resizeHandleStyle}
                    onMouseDown={(e) => handleNodeResizeStart(e, node)}
                    title="拖拽拉伸分组尺寸"
                  />
                )}
              </div>
            );
          }

          // Render Normal Cards (Text, File, Link) (z-index: 10)
          const isConnectingTarget = connectingState !== null && connectingState.fromNodeId !== node.id;
          const outgoingInfo = nodeOutgoingMap.get(node.id);
          const isOneToManySource = !!outgoingInfo && outgoingInfo.count >= 2;
          const effectiveSourceColor = sourceDisplayColorMap.get(node.id) || outgoingInfo?.color;
          const sourceColorPalette =
            effectiveSourceColor && CANVAS_COLOR_PALETTES[effectiveSourceColor]
              ? CANVAS_COLOR_PALETTES[effectiveSourceColor]
              : undefined;
          const isMultiRoot = selectedNodeIds.size >= 2 && currentMultiRootNode?.id === node.id;
          return (
            <div
              key={node.id}
              className={`canvas-node card-${node.type} ${isSelected ? "selected" : ""} ${isConnectingTarget ? "connecting-target" : ""}`}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
                zIndex: 10,
                borderRadius: 12,
                backgroundColor: colors.cardBg,
                border: isSelected
                  ? "2px solid #f59e0b"
                  : isConnectingTarget && isHovered
                  ? "2px solid #0284c7"
                  : isConnectingTarget
                  ? "2px dashed rgba(2, 132, 199, 0.6)"
                  : isOneToManySource && sourceColorPalette
                  ? `2px solid ${sourceColorPalette.stroke}`
                  : palette
                  ? `2px solid ${palette.stroke}`
                  : `1px solid ${colors.cardBorder}`,
                boxShadow: isSelected
                  ? "0 12px 36px rgba(245,158,11,0.35)"
                  : isConnectingTarget && isHovered
                  ? "0 0 0 3px rgba(2, 132, 199, 0.4), 0 12px 36px rgba(2, 132, 199, 0.35)"
                  : isOneToManySource && sourceColorPalette
                  ? `0 0 0 1px ${sourceColorPalette.stroke}88, 0 8px 24px ${sourceColorPalette.stroke}22`
                  : colors.cardShadow,
                display: "flex",
                flexDirection: "column",
                color: colors.cardText,
                cursor: isConnectingTarget ? "crosshair" : isEditing ? "text" : "move",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
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
                if (e.shiftKey || e.ctrlKey || e.metaKey || hasDraggedRef.current) return;
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
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
                    backgroundColor: "#0284c7",
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
                  background: palette ? palette.bg : colors.cardHeaderBg,
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
                      {node.type === "file" && <FileText size={13} color="#10b981" />}
                      {node.type === "text" && <Edit2 size={13} color={colors.edgeColor} />}
                      {node.type === "link" && <Link size={13} color="#a855f7" />}
                      <span style={{ fontSize: 11, fontWeight: 600, color: colors.cardHeaderText }}>
                        {node.type === "file" ? node.file : node.type === "text" ? "便签卡片" : "外部参考"}
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
                            backgroundColor: sourceColorPalette ? sourceColorPalette.bg : "rgba(16, 185, 129, 0.15)",
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
                      {node.type === "file" && onOpenFile && (
                        <button
                          className="card-header-btn"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFile(node.file);
                          }}
                          title="在工作区打开对应笔记"
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
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
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
                    onBlur={handleSaveNodeEdit}
                    autoFocus
                    placeholder="输入 Markdown 内容（支持标题、清单、加粗、代码块）..."
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
                  <div
                    className="canvas-card-markdown"
                    onClick={(e) => handleCardClick(e, node)}
                    dangerouslySetInnerHTML={{ __html: renderCardMarkdown(node.text) }}
                  />
                ) : node.type === "file" ? (
                  <div style={{ opacity: 0.9, fontSize: 12 }}>
                    <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: colors.cardText }}>
                      {node.file}
                    </p>
                    <p style={{ margin: 0, opacity: 0.7, fontSize: 11.5 }}>
                      库内 Markdown 文档卡片。点击右上角图标可在主阅读区全屏打开。
                    </p>
                  </div>
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
              {isSelected && editable && (
                <div
                  style={resizeHandleStyle}
                  onMouseDown={(e) => handleNodeResizeStart(e, node)}
                  title="拖拽拉伸卡片尺寸"
                />
              )}
            </div>
          );
        })}

        {/* 4. EDGE LABELS OVERLAY LAYER (z-index: 25 - never occluded by cards) */}
        {data.edges.map((edge) => {
          const fromNode = nodeMap.get(edge.fromNode);
          const toNode = nodeMap.get(edge.toNode);
          if (!fromNode || !toNode) return null;

          const hasLabel = Boolean(edge.label && edge.label.trim().length > 0);
          const isEditing = editingEdgeId === edge.id;
          if (!hasLabel && !isEditing) return null;

          const optSides = getOptimalAnchorSides(fromNode, toNode);
          const fromSide = edge.fromSide || optSides.fromSide;
          const toSide = edge.toSide || optSides.toSide;
          const p1 = getNodeAnchorPoint(fromNode, fromSide);
          const p2 = getNodeAnchorPoint(toNode, toSide);
          // Place label exactly at geometric midpoint — the connection line passes THROUGH the label center
          const rawMid = computeEdgeMidpoint(
            p1,
            fromSide,
            p2,
            toSide,
            edge.gridPath ? "straight" : edge.style,
            edge.stepOffset,
            getEdgeRing(edge)
          );

          const isSelected = selectedEdgeIds.has(edge.id);
          const effectiveColorKey =
            (edge.fromNode && sourceDisplayColorMap.get(edge.fromNode)) || edge.color;
          const edgeColor =
            effectiveColorKey && CANVAS_COLOR_PALETTES[effectiveColorKey]
              ? CANVAS_COLOR_PALETTES[effectiveColorKey].stroke
              : effectiveColorKey?.startsWith("#")
              ? effectiveColorKey
              : colors.edgeColor;

          const shape = edge.labelShape || "pill";
          const badgeBg = isDark ? "rgba(30, 41, 59, 0.98)" : "rgba(255, 255, 255, 0.98)";
          const badgeBorder = isSelected ? "#f59e0b" : edgeColor;
          const badgeColor = isSelected ? "#f59e0b" : colors.edgeLabelText;

          return (
            <div
              key={`edge-label-${edge.id}`}
              className={`canvas-edge-label-badge shape-${shape}`}
              style={{
                position: "absolute",
                left: rawMid.x,
                top: rawMid.y,
                transform: "translate(-50%, -50%)",
                zIndex: isSelected || isEditing ? 35 : 25,
                pointerEvents: "all",
                userSelect: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  setSelectedEdgeIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(edge.id)) next.delete(edge.id);
                    else next.add(edge.id);
                    return next;
                  });
                } else {
                  setSelectedEdgeIds(new Set([edge.id]));
                  setSelectedNodeIds(new Set());
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingEdgeId(edge.id);
                setEditingEdgeLabel(edge.label || "");
              }}
              onContextMenu={(e) => handleContextMenuEdge(e, edge)}
            >
              {isEditing ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: colors.cardBg,
                    border: "2px solid #f59e0b",
                    borderRadius: shape === "pill" ? 16 : shape === "rect" ? 6 : 10,
                    padding: "2px 8px",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editingEdgeLabel}
                    onChange={(e) => setEditingEdgeLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdgeLabel();
                      if (e.key === "Escape") setEditingEdgeId(null);
                    }}
                    onBlur={handleSaveEdgeLabel}
                    autoFocus
                    placeholder="关系标签..."
                    style={{
                      width: 110,
                      border: "none",
                      background: "transparent",
                      color: colors.cardText,
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleSaveEdgeLabel}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#10b981",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Check size={13} />
                  </button>
                </div>
              ) : shape === "diamond" ? (
                <div
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "5px 18px",
                    color: badgeColor,
                    fontSize: 11.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    filter: isSelected
                      ? "drop-shadow(0 3px 10px rgba(245, 158, 11, 0.45))"
                      : "drop-shadow(0 2px 6px rgba(0,0,0,0.14))",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="双击编辑关系说明 (右键呼出关系菜单)"
                >
                  <svg
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                      pointerEvents: "none",
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <polygon
                      points="50,1.5 98.5,50 50,98.5 1.5,50"
                      vectorEffect="non-scaling-stroke"
                      fill={badgeBg}
                      stroke={badgeBorder}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span style={{ position: "relative", zIndex: 1 }}>{edge.label}</span>
                </div>
              ) : (
                <div
                  style={{
                    padding: shape === "rect" ? "3px 9px" : "3px 12px",
                    borderRadius: shape === "rect" ? 4 : 9999,
                    backgroundColor: badgeBg,
                    backdropFilter: "blur(6px)",
                    border: `1.5px solid ${badgeBorder}`,
                    color: badgeColor,
                    fontSize: 11.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    boxShadow: isSelected
                      ? "0 4px 12px rgba(245, 158, 11, 0.35)"
                      : "0 2px 8px rgba(0,0,0,0.12)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="双击编辑关系说明 (右键呼出关系菜单)"
                >
                  {edge.label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 5. BOTTOM-RIGHT INTERACTIVE MINIMAP */}
      <div
        className="canvas-minimap"
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          width: 180,
          height: 130,
          zIndex: 90,
          borderRadius: 10,
          backgroundColor:
            theme === "eink"
              ? "rgba(244, 241, 234, 0.9)"
              : !isDark
              ? "rgba(255, 255, 255, 0.94)"
              : "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${!isDark ? "#e2e8f0" : colors.cardBorder}`,
          boxShadow: !isDark ? "0 4px 16px rgba(0,0,0,0.06)" : "0 6px 20px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = (e.clientX - rect.left - minimapOffsetX) / minimapScale + minimapBBox.minX;
          const clickY = (e.clientY - rect.top - minimapOffsetY) / minimapScale + minimapBBox.minY;
          if (containerRef.current) {
            const viewW = containerRef.current.clientWidth;
            const viewH = containerRef.current.clientHeight;
            setViewport((prev) => ({
              ...prev,
              panX: viewW / 2 - clickX * prev.zoom,
              panY: viewH / 2 - clickY * prev.zoom,
            }));
          }
        }}
      >
        <svg style={{ width: "100%", height: "100%" }}>
          {/* Layer A: Group Containers */}
          {data.nodes
            .filter((n): n is CanvasGroupNode => n.type === "group")
            .map((group) => {
              const rx = minimapOffsetX + (group.x - minimapBBox.minX) * minimapScale;
              const ry = minimapOffsetY + (group.y - minimapBBox.minY) * minimapScale;
              const rw = Math.max(6, group.width * minimapScale);
              const rh = Math.max(6, group.height * minimapScale);
              const pal = getNodePalette(group.color);
              return (
                <rect
                  key={`mini-grp-${group.id}`}
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  fill={pal ? pal.bg : isDark ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.08)"}
                  stroke={pal ? pal.stroke : "#3b82f6"}
                  strokeWidth={0.8}
                  strokeDasharray="2 2"
                  rx={3}
                />
              );
            })}

          {/* Layer B: Edges preview */}
          {data.edges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromNode);
            const toNode = nodeMap.get(edge.toNode);
            if (!fromNode || !toNode) return null;
            const x1 = minimapOffsetX + (fromNode.x + fromNode.width / 2 - minimapBBox.minX) * minimapScale;
            const y1 = minimapOffsetY + (fromNode.y + fromNode.height / 2 - minimapBBox.minY) * minimapScale;
            const x2 = minimapOffsetX + (toNode.x + toNode.width / 2 - minimapBBox.minX) * minimapScale;
            const y2 = minimapOffsetY + (toNode.y + toNode.height / 2 - minimapBBox.minY) * minimapScale;
            return (
              <line
                key={`mini-edge-${edge.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colors.edgeColor}
                strokeWidth={0.8}
                opacity={0.4}
              />
            );
          })}

          {/* Layer C: All Information Cards (Inside Groups & Standalone Outside Containers) */}
          {data.nodes
            .filter((n) => n.type !== "group")
            .map((card) => {
              const rx = minimapOffsetX + (card.x - minimapBBox.minX) * minimapScale;
              const ry = minimapOffsetY + (card.y - minimapBBox.minY) * minimapScale;
              const rw = Math.max(5, card.width * minimapScale);
              const rh = Math.max(4, card.height * minimapScale);
              const isSelected = selectedNodeIds.has(card.id);
              const pal = getNodePalette(card.color);
              const cardColor = isSelected
                ? "#f59e0b"
                : pal
                ? pal.stroke
                : card.type === "file"
                ? "#10b981"
                : card.type === "link"
                ? "#8b5cf6"
                : colors.edgeColor;
              return (
                <rect
                  key={`mini-card-${card.id}`}
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  fill={cardColor}
                  stroke={!isDark ? "#ffffff" : "#0f172a"}
                  strokeWidth={0.8}
                  rx={2}
                  style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
                />
              );
            })}

          {/* Layer D: Viewport Camera Box */}
          {containerRef.current && (() => {
            const viewW = containerRef.current.clientWidth;
            const viewH = containerRef.current.clientHeight;
            const camX = -viewport.panX / viewport.zoom;
            const camY = -viewport.panY / viewport.zoom;
            const camW = viewW / viewport.zoom;
            const camH = viewH / viewport.zoom;

            const vrx = minimapOffsetX + (camX - minimapBBox.minX) * minimapScale;
            const vry = minimapOffsetY + (camY - minimapBBox.minY) * minimapScale;
            const vrw = Math.max(12, camW * minimapScale);
            const vrh = Math.max(8, camH * minimapScale);

            return (
              <rect
                x={vrx}
                y={vry}
                width={vrw}
                height={vrh}
                fill="rgba(245, 158, 11, 0.08)"
                stroke="#f59e0b"
                strokeWidth={1.2}
                strokeDasharray="3 2"
                rx={2}
                pointerEvents="none"
              />
            );
          })()}
        </svg>
      </div>

      {/* 5. MODAL: INSERT NOTE FILE PICKER */}
      {showFilePicker && (
        <div
          style={modalOverlayStyle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setShowFilePicker(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div style={modalContentStyle(theme, colors)} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <FileText size={18} color="#10b981" /> 引入知识库笔记至白板
              </h3>
              <button
                onClick={() => setShowFilePicker(false)}
                style={{ background: "none", border: "none", color: colors.cardText, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索笔记标题或路径..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: `1px solid ${colors.cardBorder}`,
                  background: theme === "light" ? "#ffffff" : "rgba(0,0,0,0.2)",
                  color: colors.cardText,
                  outline: "none",
                  fontSize: 13,
                }}
              />
            </div>

            <div
              style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}
              onWheel={(e) => e.stopPropagation()}
            >
              {allChapters
                .filter(
                  (c) =>
                    !searchKeyword ||
                    c.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                    c.src.toLowerCase().includes(searchKeyword.toLowerCase())
                )
                .map((ch) => (
                  <div
                    key={ch.src}
                    onClick={() => handleAddFileCard(ch)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      backgroundColor: theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{ch.title}</span>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{ch.src}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: EXTRACT CANVAS TO ARTICLE PREVIEW */}
      {showExtractModal && (
        <div
          style={modalOverlayStyle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setShowExtractModal(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            style={{ ...modalContentStyle(theme, colors), width: 620, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <BookOpen size={18} color="#10b981" /> 白板结构化萃取专著
              </h3>
              <button
                onClick={() => setShowExtractModal(false)}
                style={{ background: "none", border: "none", color: colors.cardText, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <textarea
              readOnly
              value={extractedMarkdown}
              onWheel={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                height: 320,
                backgroundColor: theme === "light" ? "#ffffff" : "rgba(0,0,0,0.3)",
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: 8,
                padding: 12,
                color: colors.cardText,
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 13,
                resize: "vertical",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                onClick={handleCopyExtracted}
                style={{
                  ...toolBtnStyle(theme, colors),
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: `1px solid ${colors.cardBorder}`,
                }}
              >
                {copiedNotification ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                {copiedNotification ? "已复制到剪贴板！" : "复制全文"}
              </button>
              {onExtractToNote && (
                <button
                  onClick={handleSaveAsNote}
                  style={{
                    ...toolBtnStyle(theme, colors),
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  另存为新笔记
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6.5. MODAL: EXPORT CANVAS AS IMAGE */}
      {showExportModal && (
        <div
          style={modalOverlayStyle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setShowExportModal(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            style={{ ...modalContentStyle(theme, colors), width: 520, maxWidth: "92vw" }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <ImageIcon size={18} color="#0284c7" /> 导出白板为图片
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                style={{ background: "none", border: "none", color: colors.cardText, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Whiteboard overview info */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                backgroundColor: theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)",
                fontSize: 12.5,
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              <div>📊 <b>画板统计：</b>共 <b>{data.nodes.length}</b> 个节点卡片，<b>{data.edges.length}</b> 条逻辑关联线</div>
              <div style={{ opacity: 0.7, fontSize: 11.5, marginTop: 2 }}>
                💡 导出引擎将依据画板所有元素的包围盒自动生成高清全景图，背景与连线穿心对齐无缝呈现。
              </div>
            </div>

            {/* Format selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                导出格式
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setExportFormat("png")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: exportFormat === "png" ? "2px solid #0284c7" : `1px solid ${colors.cardBorder}`,
                    background: exportFormat === "png" ? "rgba(2,132,199,0.12)" : "transparent",
                    color: colors.cardText,
                    fontWeight: exportFormat === "png" ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    📸 PNG 高清位图 (2x Retina)
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>
                    适合社交分享、插入文档报告
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat("svg")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: exportFormat === "svg" ? "2px solid #0284c7" : `1px solid ${colors.cardBorder}`,
                    background: exportFormat === "svg" ? "rgba(2,132,199,0.12)" : "transparent",
                    color: colors.cardText,
                    fontWeight: exportFormat === "svg" ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    📐 SVG 矢量图形
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>
                    无限放大不失真、设计工具二次编辑
                  </div>
                </button>
              </div>
            </div>

            {/* Background options */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                背景底色
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                {(
                  [
                    { id: "theme", label: "跟随当前主题底色" },
                    { id: "white", label: "纯白底色" },
                    { id: "transparent", label: "透明背景" },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setExportBg(b.id)}
                    style={{
                      flex: 1,
                      padding: "7px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      border: exportBg === b.id ? "1.5px solid #0284c7" : `1px solid ${colors.cardBorder}`,
                      background: exportBg === b.id ? "rgba(2,132,199,0.1)" : "transparent",
                      color: exportBg === b.id ? "#0284c7" : colors.cardText,
                      fontWeight: exportBg === b.id ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              {exportFormat === "png" && (
                <button
                  type="button"
                  onClick={handleCopyExport}
                  disabled={isExporting}
                  style={{
                    ...toolBtnStyle(theme, colors),
                    padding: "7px 14px",
                    borderRadius: 6,
                    border: `1px solid ${colors.cardBorder}`,
                    cursor: isExporting ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {exportCopyFeedback ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  <span>{exportCopyFeedback ? "已复制到剪贴板！" : "复制图片到剪贴板"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadExport}
                disabled={isExporting}
                style={{
                  ...toolBtnStyle(theme, colors),
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  padding: "7px 16px",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: isExporting ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Save size={14} />
                <span>{isExporting ? "正在导出..." : `下载 ${exportFormat.toUpperCase()} 文件`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6.6. MODAL: BATCH SPAWN BRANCHES */}
      {spawnModalState && (
        <div
          style={modalOverlayStyle}
          onClick={() => setSpawnModalState(null)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            style={{ ...modalContentStyle(theme, colors), width: 440, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Share2 size={16} color="#8b5cf6" />
                <span style={{ fontSize: 15, fontWeight: 600 }}>批量派生分支 (一对多)</span>
              </div>
              <button
                type="button"
                onClick={() => setSpawnModalState(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.cardText, opacity: 0.6 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Branch Count Input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                派生分支数量 (1 ~ 20)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={spawnModalState.count}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSpawnModalState((prev) =>
                      prev ? { ...prev, count: isNaN(val) ? 1 : Math.max(1, Math.min(20, val)) } : null
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmBatchSpawn();
                    if (e.key === "Escape") setSpawnModalState(null);
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: `1px solid ${colors.cardBorder}`,
                    backgroundColor: colors.cardBg,
                    color: colors.cardText,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              {/* Quick count pills */}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {[2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSpawnModalState((prev) => (prev ? { ...prev, count: num } : null))}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 14,
                      fontSize: 11.5,
                      fontWeight: spawnModalState.count === num ? 600 : 400,
                      backgroundColor: spawnModalState.count === num ? "rgba(139, 92, 246, 0.2)" : "transparent",
                      color: spawnModalState.count === num ? "#8b5cf6" : colors.cardText,
                      border: spawnModalState.count === num ? "1px solid #8b5cf6" : `1px solid ${colors.cardBorder}`,
                      cursor: "pointer",
                    }}
                  >
                    {num} 个分支
                  </button>
                ))}
              </div>
            </div>

            {/* Direction Selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                展开方向
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { dir: "right", label: "向右横向展开" },
                  { dir: "bottom", label: "向下纵向展开" },
                ].map((d) => (
                  <button
                    key={d.dir}
                    type="button"
                    onClick={() =>
                      setSpawnModalState((prev) =>
                        prev ? { ...prev, direction: d.dir as "right" | "bottom" } : null
                      )
                    }
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      fontSize: 12.5,
                      border:
                        spawnModalState.direction === d.dir
                          ? "1.5px solid #8b5cf6"
                          : `1px solid ${colors.cardBorder}`,
                      background:
                        spawnModalState.direction === d.dir ? "rgba(139, 92, 246, 0.12)" : "transparent",
                      color: spawnModalState.direction === d.dir ? "#8b5cf6" : colors.cardText,
                      fontWeight: spawnModalState.direction === d.dir ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setSpawnModalState(null)}
                style={{
                  ...toolBtnStyle(theme, colors),
                  padding: "7px 14px",
                  borderRadius: 6,
                  border: `1px solid ${colors.cardBorder}`,
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchSpawn}
                style={{
                  ...toolBtnStyle(theme, colors),
                  backgroundColor: "#8b5cf6",
                  color: "#ffffff",
                  padding: "7px 18px",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Share2 size={13} />
                <span>确认派生 ({spawnModalState.count} 个)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MARQUEE SELECTION BOX */}
      {selectionBox && (
        <div
          className="canvas-selection-box"
          style={{
            position: "absolute",
            left: Math.min(selectionBox.startX, selectionBox.currentX) * viewport.zoom + viewport.panX,
            top: Math.min(selectionBox.startY, selectionBox.currentY) * viewport.zoom + viewport.panY,
            width: Math.abs(selectionBox.currentX - selectionBox.startX) * viewport.zoom,
            height: Math.abs(selectionBox.currentY - selectionBox.startY) * viewport.zoom,
            zIndex: 80,
            pointerEvents: "none",
          }}
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
          >
          {contextMenu.targetEdgeId ? (
            // 1. Edge Context Menu (Batch or Single)
            (() => {
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
                              handleBatchSetEdgeColor(e.target.value);
                              // Let the native chooser finish closing first
                              closeMenuAfterColorPick();
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
            })()
          ) : contextMenu.targetNodeId ? (
            // 2. Card / Group Context Menu
            (() => {
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
                                handleNodeColorChange(targetNode.id, e.target.value);
                                // Wait for the native chooser to finish closing
                                closeMenuAfterColorPick();
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
                                handleBatchColorChange(e.target.value);
                                // Let the native chooser finish closing first
                                closeMenuAfterColorPick();
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
                                    handleNodeColorChange(targetNode.id, e.target.value);
                                    // Wait for the native chooser to finish closing
                                    closeMenuAfterColorPick();
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
            })()
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
                    onClick={() => handlePasteClipboardAsCard(contextMenu.canvasX, contextMenu.canvasY)}
                  >
                    <Clipboard size={13} color="#10b981" />
                    <span>从剪贴板粘贴为卡片</span>
                    <span className="canvas-ctx-shortcut">Ctrl+V</span>
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
          document.body
        )}

      {/* 8.5 Floating Batch Toolbar for Multiple Selected Edges */}
      {selectedEdgeIds.size > 1 && (
        <div
          className="canvas-edge-batch-toolbar"
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 24,
            background: theme === "eink" ? "#f4f1ea" : !isDark ? "#ffffff" : "#1e293b",
            border: `1px solid ${colors.cardBorder}`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            pointerEvents: "all",
            whiteSpace: "nowrap",
            fontSize: 12,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontWeight: 600,
              color: "#f59e0b",
              paddingRight: 4,
            }}
          >
            <Link size={14} />
            <span>已选中 {selectedEdgeIds.size} 条连线</span>
          </div>

          <div style={{ width: 1, height: 16, background: colors.cardBorder, margin: "0 2px" }} />

          {/* Line Style options */}
          <div style={{ display: "flex", gap: 3 }}>
            {(["bezier", "step", "straight"] as const).map((st) => (
              <button
                key={st}
                onClick={() => handleBatchSetEdgeStyle(st)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "3px 7px",
                  borderRadius: 6,
                  border: `1px solid ${colors.cardBorder}`,
                  background: "transparent",
                  color: colors.cardText,
                  cursor: "pointer",
                  fontSize: 11,
                }}
                title={`批量设为: ${st === "bezier" ? "贝塞尔曲线" : st === "step" ? "直角折线" : "直线"}`}
              >
                <Spline size={11} />
                <span>{st === "bezier" ? "曲线" : st === "step" ? "折线" : "直线"}</span>
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: colors.cardBorder, margin: "0 2px" }} />

          {/* Stroke pattern cycle */}
          <button
            onClick={handleBatchCycleStrokePattern}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 7px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              background: "transparent",
              color: colors.cardText,
              cursor: "pointer",
              fontSize: 11,
            }}
            title="批量切换虚实 (实线 / 虚线 / 点线)"
          >
            <span style={{ fontSize: 10, letterSpacing: 1 }}>- -</span>
            <span>虚实</span>
          </button>

          {/* Arrow toggle */}
          <button
            onClick={handleBatchToggleArrow}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 7px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              background: "transparent",
              color: colors.cardText,
              cursor: "pointer",
              fontSize: 11,
            }}
            title="批量切换箭头 (无 / 单向 / 双向)"
          >
            <ArrowLeftRight size={12} />
            <span>箭头</span>
          </button>

          {/* Reverse flow */}
          <button
            onClick={handleBatchReverseEdges}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 7px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              background: "transparent",
              color: "#0284c7",
              cursor: "pointer",
              fontSize: 11,
            }}
            title="批量反转连线流向 (R)"
          >
            <Shuffle size={12} />
            <span>反向</span>
          </button>

          <div style={{ width: 1, height: 16, background: colors.cardBorder, margin: "0 2px" }} />

          {/* Color dots — wraps onto a second row now that the palette carries
              twelve swatches. */}
          <div className="canvas-ctx-colors" style={{ gap: 4, maxWidth: 190 }}>
            {Object.entries(CANVAS_COLOR_PALETTES).map(([k, c]) => (
              <div
                key={k}
                onClick={() => handleBatchSetEdgeColor(k)}
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: "50%",
                  backgroundColor: c.stroke,
                  cursor: "pointer",
                  border: "1px solid rgba(0,0,0,0.15)",
                }}
                title={`批量设为: ${c.label}`}
              />
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: colors.cardBorder, margin: "0 2px" }} />

          {/* Delete edges */}
          <button
            onClick={handleBatchDeleteEdges}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 7px",
              borderRadius: 6,
              border: "none",
              background: "none",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: 11,
            }}
            title="批量删除所选连线 (Delete)"
          >
            <Trash2 size={13} />
            <span>删除</span>
          </button>

          {/* Dismiss / clear selection */}
          <button
            onClick={() => setSelectedEdgeIds(new Set())}
            style={{
              background: "none",
              border: "none",
              padding: "2px",
              cursor: "pointer",
              color: colors.cardText,
              opacity: 0.6,
              display: "flex",
              alignItems: "center",
              marginLeft: 2,
            }}
            title="取消选择"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* 9. Floating Toast Feedback */}
      {toastMessage && (
        <div
          className="canvas-toast-msg"
          style={{
            position: "absolute",
            bottom: selectedEdgeIds.size > 1 ? 76 : 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: isDark ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.9)",
            color: "#ffffff",
            padding: "7px 16px",
            borderRadius: 20,
            fontSize: 12.5,
            fontWeight: 500,
            zIndex: 1100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            backdropFilter: "blur(8px)",
          }}
        >
          <Check size={13} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
});

// Helpers & Styles
/** Extracts the circular-arc descriptor from an edge, when it has one. */
function getEdgeRing(edge: CanvasEdge): { center: { x: number; y: number }; radius: number } | undefined {
  return edge.ringCenter && edge.ringRadius
    ? { center: edge.ringCenter, radius: edge.ringRadius }
    : undefined;
}

// getCanvasThemeColors now lives in ../services/canvasTheme so that the SVG/PNG
// exporter reads exactly the same palette the screen does.

function toolBtnStyle(theme: ThemeMode, colors: ReturnType<typeof getCanvasThemeColors>): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "none",
    border: "none",
    borderRadius: 6,
    color: colors.cardText,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
}

function cardHeaderBtnStyle(colors: ReturnType<typeof getCanvasThemeColors>): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    color: colors.cardHeaderText,
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
  };
}

const resizeHandleStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  width: 14,
  height: 14,
  cursor: "nwse-resize",
  borderRight: "3px solid #f59e0b",
  borderBottom: "3px solid #f59e0b",
  borderBottomRightRadius: 8,
};

function getAnchorDotStyle(
  side: CanvasNodeSide,
  colors: ReturnType<typeof getCanvasThemeColors>
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: "50%",
    backgroundColor: colors.anchorDotBg,
    border: "2px solid #ffffff",
    cursor: "crosshair",
    zIndex: 20,
    boxShadow: "0 0 6px rgba(0,0,0,0.35)",
    transition: "transform 0.15s ease",
  };

  switch (side) {
    case "top":
      return { ...base, top: -5.5, left: "50%", transform: "translateX(-50%)" };
    case "bottom":
      return { ...base, bottom: -5.5, left: "50%", transform: "translateX(-50%)" };
    case "left":
      return { ...base, left: -5.5, top: "50%", transform: "translateY(-50%)" };
    case "right":
    default:
      return { ...base, right: -5.5, top: "50%", transform: "translateY(-50%)" };
  }
}

const modalOverlayStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundColor: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};

function modalContentStyle(
  theme: ThemeMode,
  colors: ReturnType<typeof getCanvasThemeColors>
): React.CSSProperties {
  return {
    width: 440,
    backgroundColor: colors.cardBg,
    color: colors.cardText,
    borderRadius: 12,
    border: `1px solid ${colors.cardBorder}`,
    boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
    padding: 20,
  };
}
