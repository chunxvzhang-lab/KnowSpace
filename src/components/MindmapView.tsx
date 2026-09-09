import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ListTree,
  PlusCircle,
  CornerDownRight,
  Edit3,
  Trash2,
  Palette,
  Check,
  X,
  CheckSquare,
  Bold,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignJustify,
  RotateCcw,
  Search,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";
import type { Heading, ThemeMode, MindmapNodeShape, MindmapLineStyle, MindmapTextAlign } from "../core/types";
import {
  BRANCH_COLORS,
  buildMindmapTree,
  layoutMindmap,
  parseMarkdownToMindmapTree,
  mindmapTreeToMarkdown,
  addChildNode,
  addSiblingNode,
  deleteNode,
  updateNodeText,
  updateNodeStyle,
  updateNodesStyle,
  findNode,
  findParent,
  findSibling,
  reparentNode,
  searchMindmapNodes,
  exportMindmapToOpml,
  exportMindmapToFreeMind,
  exportMindmapToMarkdownOutline,
  type MindmapLayoutNode,
} from "../services/mindmapService";
import type { MindmapNode } from "../core/types";

export type MindmapViewProps = {
  title: string;
  headings?: Heading[];
  source?: string;
  onSourceChange?: (newSource: string) => void;
  editable?: boolean;
  onJumpToHeading?: (headingId: string, line?: number) => void;
  onClose?: () => void;
  theme?: ThemeMode;
};

// Rich 18-color modern curated palette for node card background fill (includes transparent)
const PRESET_COLORS = [
  { label: "默认", value: "" },
  { label: "透明", value: "transparent" },
  { label: "天蓝", value: "#38bdf8" },
  { label: "极客蓝", value: "#3b82f6" },
  { label: "靛青", value: "#6366f1" },
  { label: "青空", value: "#06b6d4" },
  { label: "翡翠绿", value: "#10b981" },
  { label: "薄荷绿", value: "#14b8a6" },
  { label: "鲜柠绿", value: "#84cc16" },
  { label: "琥珀黄", value: "#f59e0b" },
  { label: "暖日光", value: "#eab308" },
  { label: "珊瑚橙", value: "#f97316" },
  { label: "朱砂红", value: "#ef4444" },
  { label: "玫瑰粉", value: "#f43f5e" },
  { label: "兰花紫", value: "#a855f7" },
  { label: "丁香紫", value: "#c084fc" },
  { label: "石墨灰", value: "#64748b" },
  { label: "曜石黑", value: "#334155" },
];

// Curated node border colors (includes default branch color and transparent border)
const PRESET_BORDER_COLORS = [
  { label: "默认", value: "" },
  { label: "无边框", value: "transparent" },
  { label: "天蓝", value: "#38bdf8" },
  { label: "极客蓝", value: "#3b82f6" },
  { label: "青空", value: "#06b6d4" },
  { label: "翡翠绿", value: "#10b981" },
  { label: "薄荷绿", value: "#14b8a6" },
  { label: "鲜柠绿", value: "#84cc16" },
  { label: "琥珀黄", value: "#f59e0b" },
  { label: "珊瑚橙", value: "#f97316" },
  { label: "朱砂红", value: "#ef4444" },
  { label: "玫瑰粉", value: "#f43f5e" },
  { label: "兰花紫", value: "#a855f7" },
  { label: "石墨灰", value: "#64748b" },
  { label: "曜石黑", value: "#334155" },
  { label: "纯白", value: "#ffffff" },
];

const PRESET_SHAPES: { label: string; value: MindmapNodeShape }[] = [
  { label: "胶囊", value: "capsule" },
  { label: "圆角", value: "rounded" },
  { label: "直角", value: "rect" },
  { label: "下划线", value: "underline" },
];

const PRESET_FONT_SIZES = [
  { label: "12", value: 12 },
  { label: "14", value: 14 },
  { label: "16", value: 16 },
  { label: "18", value: 18 },
  { label: "20", value: 20 },
];

// Curated high-contrast font colors
const PRESET_TEXT_COLORS = [
  { label: "默认", value: "" },
  { label: "纯黑", value: "#0f172a" },
  { label: "纯白", value: "#ffffff" },
  { label: "极客蓝", value: "#2563eb" },
  { label: "翡翠绿", value: "#059669" },
  { label: "珊瑚橙", value: "#ea580c" },
  { label: "朱砂红", value: "#dc2626" },
  { label: "玫瑰粉", value: "#e11d48" },
  { label: "兰花紫", value: "#9333ea" },
  { label: "琥珀黄", value: "#d97706" },
  { label: "石墨灰", value: "#64748b" },
];

const PRESET_ALIGNMENTS: { label: string; value: MindmapTextAlign; icon: typeof AlignCenter }[] = [
  { label: "居中", value: "center", icon: AlignCenter },
  { label: "左对齐", value: "left", icon: AlignLeft },
  { label: "右对齐", value: "right", icon: AlignRight },
  { label: "双边对齐", value: "justify", icon: AlignJustify },
];

const PRESET_LINE_STYLES: { label: string; value: MindmapLineStyle }[] = [
  { label: "曲线", value: "bezier" },
  { label: "折线", value: "step" },
  { label: "直线", value: "straight" },
];

// Rich 14-color line palette
const PRESET_LINE_COLORS = [
  { label: "继承", value: "" },
  { label: "天蓝", value: "#38bdf8" },
  { label: "极客蓝", value: "#3b82f6" },
  { label: "青空", value: "#06b6d4" },
  { label: "翡翠绿", value: "#10b981" },
  { label: "薄荷绿", value: "#14b8a6" },
  { label: "鲜柠绿", value: "#84cc16" },
  { label: "琥珀黄", value: "#f59e0b" },
  { label: "珊瑚橙", value: "#f97316" },
  { label: "朱砂红", value: "#ef4444" },
  { label: "玫瑰粉", value: "#f43f5e" },
  { label: "兰花紫", value: "#a855f7" },
  { label: "石墨灰", value: "#94a3b8" },
  { label: "曜石黑", value: "#334155" },
];

/**
 * Calculates optimal contrast text color (dark vs white) based on background luminance.
 */
function getContrastTextColor(hexColor?: string): string {
  if (!hexColor || hexColor === "transparent") return "";
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

export const MindmapView = memo(function MindmapView({
  title,
  headings,
  source,
  onSourceChange,
  editable = true,
  onJumpToHeading,
  onClose,
  theme = "system",
}: MindmapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedSourceRef = useRef<string>("");

  // Initialize tree from source or headings
  const initialTree = useMemo(() => {
    if (source && source.trim()) {
      return parseMarkdownToMindmapTree(source, title);
    }
    if (headings && headings.length > 0) {
      return buildMindmapTree(title, headings);
    }
    return {
      id: "root-mindmap-node",
      text: title || "中心主题",
      level: 0,
      children: [],
    };
  }, [source, title, headings]);

  const [tree, setTree] = useState<MindmapNode>(initialTree);

  // Keep tree in sync if external source changes, but prevent feedback loop echo
  useEffect(() => {
    if (source && source.trim() && source !== lastEmittedSourceRef.current) {
      setTree(parseMarkdownToMindmapTree(source, title));
    }
  }, [source, title]);

  // Selected node(s), inline editing, and context menu states
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set([tree.id]));
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [isExportMenuOpen]);

  // Safe boundary calculation for context menu to prevent bottom/right clipping
  useLayoutEffect(() => {
    if (!contextMenu) return;
    const container = containerRef.current;
    if (!container) return;

    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    const menuEl = menuRef.current;
    const mWidth = menuEl?.offsetWidth || 256;
    const mHeight = menuEl?.offsetHeight || 440;

    let left = contextMenu.x;
    let top = contextMenu.y;

    // Prevent overflowing right boundary
    if (left + mWidth > cWidth - 16) {
      left = Math.max(16, cWidth - mWidth - 16);
    }
    // Prevent overflowing bottom boundary: flip upwards if near bottom
    if (top + mHeight > cHeight - 16) {
      top = Math.max(16, contextMenu.y - mHeight);
      if (top + mHeight > cHeight - 16) {
        top = Math.max(16, cHeight - mHeight - 16);
      }
    }

    setMenuPos({ left: Math.round(left), top: Math.round(top) });
  }, [contextMenu]);

  // Primary single selected node for single-target actions
  const primarySelectedId = useMemo(() => {
    if (selectedNodeIds.size === 0) return null;
    const arr = Array.from(selectedNodeIds);
    return arr[arr.length - 1];
  }, [selectedNodeIds]);

  // Undo / Redo history stacks (retained for keyboard shortcuts Ctrl+Z / Ctrl+Y)
  const undoStackRef = useRef<MindmapNode[]>([]);
  const redoStackRef = useRef<MindmapNode[]>([]);

  // Pan & Zoom transform state
  const [transform, setTransform] = useState({ x: 60, y: 80, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startTransformX: 0, startTransformY: 0 });

  // Node collapse state
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Node manual resizing state
  const [resizingNode, setResizingNode] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Compute 2D layout coordinates
  const layout = useMemo(() => {
    return layoutMindmap(tree, collapsedIds);
  }, [tree, collapsedIds]);

  // Drag-and-drop reparenting state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragGhostPos, setDragGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const nodeDragStartRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);

  // In-canvas search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const focusOnNode = useCallback((nodeId: string) => {
    if (!layout || !containerRef.current) return;
    const target = layout.nodes.find((n) => n.id === nodeId);
    if (!target) return;
    const cWidth = containerRef.current.clientWidth;
    const cHeight = containerRef.current.clientHeight;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;
    setTransform((prev) => ({
      ...prev,
      x: Math.round(cWidth / 2 - targetCenterX * prev.scale),
      y: Math.round(cHeight / 2 - targetCenterY * prev.scale),
    }));
    setSelectedNodeIds(new Set([nodeId]));
  }, [layout]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchMatchIds([]);
      setCurrentSearchIndex(0);
      return;
    }
    const matches = searchMindmapNodes(tree, q);
    setSearchMatchIds(matches);
    setCurrentSearchIndex(0);
    if (matches.length > 0) {
      focusOnNode(matches[0]);
    }
  }, [focusOnNode, tree]);

  const handleNextSearch = useCallback(() => {
    if (searchMatchIds.length === 0) return;
    const nextIdx = (currentSearchIndex + 1) % searchMatchIds.length;
    setCurrentSearchIndex(nextIdx);
    focusOnNode(searchMatchIds[nextIdx]);
  }, [currentSearchIndex, focusOnNode, searchMatchIds]);

  const handlePrevSearch = useCallback(() => {
    if (searchMatchIds.length === 0) return;
    const prevIdx = (currentSearchIndex - 1 + searchMatchIds.length) % searchMatchIds.length;
    setCurrentSearchIndex(prevIdx);
    focusOnNode(searchMatchIds[prevIdx]);
  }, [currentSearchIndex, focusOnNode, searchMatchIds]);

  // Select all nodes handler
  const handleSelectAll = useCallback(() => {
    if (!layout || layout.nodes.length === 0) return;
    setSelectedNodeIds(new Set(layout.nodes.map((n) => n.id)));
  }, [layout]);

  // Fit to screen helper
  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    const { width: lWidth, height: lHeight, minX, minY } = layout.bounds;

    if (lWidth === 0 || lHeight === 0) return;

    const scaleX = (cWidth - 140) / lWidth;
    const scaleY = (cHeight - 140) / lHeight;
    const newScale = Math.max(0.4, Math.min(1.15, Math.min(scaleX, scaleY)));

    const newX = (cWidth - lWidth * newScale) / 2 - minX * newScale;
    const newY = (cHeight - lHeight * newScale) / 2 - minY * newScale;

    setTransform({ x: Math.round(newX), y: Math.round(newY), scale: Number(newScale.toFixed(2)) });
  }, [layout]);

  // Initial fit on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Tree mutation & Markdown synchronization
  const applyTreeChange = useCallback(
    (nextTree: MindmapNode) => {
      undoStackRef.current.push(tree);
      redoStackRef.current = [];
      setTree(nextTree);

      if (onSourceChange) {
        const md = mindmapTreeToMarkdown(nextTree);
        lastEmittedSourceRef.current = md;
        onSourceChange(md);
      }
    },
    [tree, onSourceChange]
  );

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(tree);
    setTree(prev);
    if (onSourceChange) {
      const md = mindmapTreeToMarkdown(prev);
      lastEmittedSourceRef.current = md;
      onSourceChange(md);
    }
  }, [tree, onSourceChange]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(tree);
    setTree(next);
    if (onSourceChange) {
      const md = mindmapTreeToMarkdown(next);
      lastEmittedSourceRef.current = md;
      onSourceChange(md);
    }
  }, [tree, onSourceChange]);

  // Interactive Topic Actions
  const handleAddChild = useCallback(
    (parentId?: string) => {
      if (!editable) return;
      const targetId = parentId || primarySelectedId || tree.id;
      // Uncollapse if collapsed
      if (collapsedIds.has(targetId)) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
      const { nextTree, newNodeId } = addChildNode(tree, targetId, "新建子主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      setEditingNodeId(newNodeId);
      setEditingText("新建子主题");
      setContextMenu(null);
    },
    [editable, primarySelectedId, tree, collapsedIds, applyTreeChange]
  );

  const handleAddSibling = useCallback(
    (targetId?: string) => {
      if (!editable) return;
      const id = targetId || primarySelectedId || tree.id;
      const { nextTree, newNodeId } = addSiblingNode(tree, id, "新建同级主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      setEditingNodeId(newNodeId);
      setEditingText("新建同级主题");
      setContextMenu(null);
    },
    [editable, primarySelectedId, tree, applyTreeChange]
  );

  const handleDeleteNode = useCallback(
    (nodeId?: string) => {
      if (!editable) return;
      const targetIds = nodeId ? [nodeId] : Array.from(selectedNodeIds);
      if (targetIds.length === 0) return;

      let currTree = tree;
      let lastFallback: string | null = tree.id;

      for (const id of targetIds) {
        if (id === tree.id || id === "root-mindmap-node") continue;
        const { nextTree, fallbackSelectedId } = deleteNode(currTree, id);
        currTree = nextTree;
        lastFallback = fallbackSelectedId;
      }

      applyTreeChange(currTree);
      setSelectedNodeIds(lastFallback ? new Set([lastFallback]) : new Set());
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [editable, selectedNodeIds, tree, applyTreeChange]
  );

  const startEditing = useCallback(
    (nodeId?: string) => {
      if (!editable) return;
      const id = nodeId || primarySelectedId || tree.id;
      const node = findNode(tree, id);
      if (node) {
        setSelectedNodeIds(new Set([id]));
        setEditingNodeId(id);
        setEditingText(node.text);
        setContextMenu(null);
      }
    },
    [editable, primarySelectedId, tree]
  );

  const handleCommitEdit = useCallback(() => {
    if (!editingNodeId) return;
    if (editingText.trim()) {
      const nextTree = updateNodeText(tree, editingNodeId, editingText.trim());
      applyTreeChange(nextTree);
    }
    setEditingNodeId(null);
  }, [editingNodeId, editingText, tree, applyTreeChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  // Update Appearance & Typography Styles (Batch-updates all selected nodes if multiple nodes are selected!)
  const handleUpdateStyle = useCallback(
    (
      nodeId: string,
      styles: {
        color?: string;
        shape?: MindmapNodeShape;
        lineColor?: string;
        lineStyle?: MindmapLineStyle;
        fontSize?: number;
        fontWeight?: "normal" | "bold";
        textColor?: string;
        borderColor?: string;
        textAlign?: MindmapTextAlign;
        customWidth?: number;
        customHeight?: number;
      }
    ) => {
      // If multiple nodes are selected, apply to ALL selected nodes at once!
      const targetIds =
        selectedNodeIds.size > 1
          ? Array.from(selectedNodeIds)
          : [nodeId];

      const nextTree = updateNodesStyle(tree, targetIds, styles);
      applyTreeChange(nextTree);
    },
    [tree, selectedNodeIds, applyTreeChange]
  );

  // Keyboard navigation
  const handleNavigate = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const currId = primarySelectedId || tree.id;
      if (direction === "left") {
        const parent = findParent(tree, currId);
        if (parent) setSelectedNodeIds(new Set([parent.id]));
      } else if (direction === "right") {
        const curr = findNode(tree, currId);
        if (curr?.children && curr.children.length > 0) {
          setSelectedNodeIds(new Set([curr.children[0].id]));
        }
      } else if (direction === "up") {
        const prev = findSibling(tree, currId, -1);
        if (prev) setSelectedNodeIds(new Set([prev.id]));
      } else if (direction === "down") {
        const next = findSibling(tree, currId, 1);
        if (next) setSelectedNodeIds(new Set([next.id]));
      }
    },
    [primarySelectedId, tree]
  );

  // Global Mindmap Keydown shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleCommitEdit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleCancelEdit();
        }
        return;
      }

      // Ctrl+F In-Canvas Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 60);
        return;
      }

      // Ctrl+A Select All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // Escape closes search, context menu, deselects nodes, or closes view
      if (e.key === "Escape") {
        e.preventDefault();
        if (isSearchOpen) {
          setIsSearchOpen(false);
          setSearchQuery("");
          setSearchMatchIds([]);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (selectedNodeIds.size > 0) {
          setSelectedNodeIds(new Set());
          return;
        }
        if (onClose) {
          onClose();
          return;
        }
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (
        (e.ctrlKey && e.key.toLowerCase() === "y") ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === "Tab" || e.key === "Insert") {
        e.preventDefault();
        handleAddChild();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddSibling();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteNode();
        return;
      }
      if (e.key === "F2" || e.key === " ") {
        e.preventDefault();
        startEditing();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleNavigate("up");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleNavigate("down");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigate("left");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigate("right");
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    editingNodeId,
    contextMenu,
    selectedNodeIds,
    handleSelectAll,
    handleCommitEdit,
    handleCancelEdit,
    handleUndo,
    handleRedo,
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    startEditing,
    handleNavigate,
    onClose,
    isSearchOpen,
  ]);

  // Focus and select input on entering edit mode
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  // Pan interaction handlers & blank canvas click deselect
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | SVGElement;
    if (
      target.closest(".mindmap-node-interactive") ||
      target.closest(".mindmap-toolbar") ||
      target.closest(".mindmap-inline-edit-input") ||
      target.closest(".mindmap-context-menu")
    ) {
      return;
    }
    // Clicking blank canvas background commits edit, closes menu, and cancels selection!
    if (editingNodeId) {
      handleCommitEdit();
    }
    if (contextMenu) {
      setContextMenu(null);
    }
    setSelectedNodeIds(new Set());

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startTransformX: transform.x,
      startTransformY: transform.y,
    };
  }, [transform.x, transform.y, editingNodeId, contextMenu, handleCommitEdit]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (resizingNode) {
        const dx = (e.clientX - resizingNode.startX) / transform.scale;
        const dy = (e.clientY - resizingNode.startY) / transform.scale;
        const newWidth = Math.max(60, Math.round(resizingNode.startWidth + dx));
        const newHeight = Math.max(30, Math.round(resizingNode.startHeight + dy));
        handleUpdateStyle(resizingNode.nodeId, {
          customWidth: newWidth,
          customHeight: newHeight,
        });
        return;
      }

      if (nodeDragStartRef.current) {
        const dx = e.clientX - nodeDragStartRef.current.startX;
        const dy = e.clientY - nodeDragStartRef.current.startY;
        if (!nodeDragStartRef.current.hasMoved && Math.hypot(dx, dy) > 8) {
          nodeDragStartRef.current.hasMoved = true;
          setDraggingNodeId(nodeDragStartRef.current.nodeId);
        }
        if (nodeDragStartRef.current.hasMoved) {
          setDragGhostPos({ x: e.clientX, y: e.clientY });

          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect && layout) {
            const canvasX = (e.clientX - containerRect.left - transform.x) / transform.scale;
            const canvasY = (e.clientY - containerRect.top - transform.y) / transform.scale;

            let targetFound: string | null = null;
            for (const node of layout.nodes) {
              if (node.id === nodeDragStartRef.current.nodeId) continue;
              if (
                canvasX >= node.x - 25 &&
                canvasX <= node.x + node.width + 25 &&
                canvasY >= node.y - 25 &&
                canvasY <= node.y + node.height + 25
              ) {
                targetFound = node.id;
                break;
              }
            }
            setDropTargetId(targetFound);
          }
          return;
        }
      }

      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTransform((prev) => ({
        ...prev,
        x: Math.round(dragStartRef.current.startTransformX + dx),
        y: Math.round(dragStartRef.current.startTransformY + dy),
      }));
    },
    [isDragging, resizingNode, transform.scale, transform.x, transform.y, layout, handleUpdateStyle]
  );

  const handleMouseUp = useCallback(() => {
    if (resizingNode) {
      setResizingNode(null);
    }
    if (nodeDragStartRef.current) {
      if (nodeDragStartRef.current.hasMoved && draggingNodeId && dropTargetId) {
        const nextTree = reparentNode(tree, draggingNodeId, dropTargetId);
        applyTreeChange(nextTree);
      }
      nodeDragStartRef.current = null;
      setDraggingNodeId(null);
      setDropTargetId(null);
      setDragGhostPos(null);
    }
    setIsDragging(false);
  }, [applyTreeChange, draggingNodeId, dropTargetId, resizingNode, tree]);

  // Wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setTransform((prev) => {
      const nextScale = Math.max(0.25, Math.min(2.5, Number((prev.scale * zoomFactor).toFixed(3))));
      const scaleRatio = nextScale / prev.scale;
      const nextX = cursorX - (cursorX - prev.x) * scaleRatio;
      const nextY = cursorY - (cursorY - prev.y) * scaleRatio;
      return {
        x: Math.round(nextX),
        y: Math.round(nextY),
        scale: nextScale,
      };
    });
  }, []);

  // Toggle collapse for a specific node
  const handleToggleCollapse = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Expand all nodes
  const handleExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  // Collapse to Level 2
  const handleCollapseToLevel2 = useCallback(() => {
    const toCollapse = new Set<string>();
    for (const n of layout.nodes) {
      if (n.level >= 2 && n.hasChildren) {
        toCollapse.add(n.id);
      }
    }
    setCollapsedIds(toCollapse);
  }, [layout.nodes]);

  // Export as PNG (100% Transparent Background, correct node & text fills, zero black blocks)
  const handleExportPng = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !layout) return;

    const pad = 40;
    const { width: lWidth, height: lHeight, minX, minY } = layout.bounds;
    const exportWidth = lWidth + pad * 2;
    const exportHeight = lHeight + pad * 2;
    const exportMinX = minX - pad;
    const exportMinY = minY - pad;

    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("viewBox", `${exportMinX} ${exportMinY} ${exportWidth} ${exportHeight}`);
    clone.setAttribute("width", `${exportWidth}`);
    clone.setAttribute("height", `${exportHeight}`);

    const g = clone.querySelector("g.mindmap-viewport");
    if (g) {
      g.removeAttribute("transform");
    }

    // Strip out interactive-only elements: selection rings, add buttons, and resize handles
    clone.querySelectorAll(".mindmap-node-selection-ring").forEach((el) => el.remove());
    clone.querySelectorAll(".mindmap-node-add-btn").forEach((el) => el.remove());
    clone.querySelectorAll(".mindmap-node-resize-handle").forEach((el) => el.remove());

    // Resolve theme colors for standalone SVG serialization
    const isDark = theme === "twitter" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    const nodeBg = isDark ? "#1e293b" : "#ffffff";
    const defaultTextFill = isDark ? "#f8fafc" : "#0f172a";
    const rootTextFill = "#38bdf8";

    // Set explicit inline fill and stroke on rects, texts, and circles
    clone.querySelectorAll("rect.mindmap-node-rect").forEach((rect) => {
      const customFill = (rect as SVGRectElement).style.fill;
      const customStroke = (rect as SVGRectElement).style.stroke;
      const customStrokeWidth = (rect as SVGRectElement).style.strokeWidth;

      rect.setAttribute("fill", customFill || nodeBg);
      if (customStroke) rect.setAttribute("stroke", customStroke);
      if (customStrokeWidth) rect.setAttribute("stroke-width", customStrokeWidth);
    });
    clone.querySelectorAll("rect.mindmap-node-rect-underline").forEach((rect) => {
      rect.setAttribute("fill", "transparent");
    });
    clone.querySelectorAll("circle.mindmap-collapse-circle").forEach((circle) => {
      circle.setAttribute("fill", nodeBg);
    });
    clone.querySelectorAll("text.mindmap-node-title-text").forEach((textEl) => {
      const isRootText = textEl.classList.contains("root-title");
      const customFill = (textEl as SVGTextElement).style.fill;
      const customFontSize = (textEl as SVGTextElement).style.fontSize;
      const customFontWeight = (textEl as SVGTextElement).style.fontWeight;

      textEl.setAttribute("fill", customFill || (isRootText ? rootTextFill : defaultTextFill));
      textEl.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
      textEl.setAttribute("font-size", customFontSize || (isRootText ? "14px" : "12.5px"));
      textEl.setAttribute("font-weight", customFontWeight || (isRootText ? "700" : "500"));
    });

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 2;
      canvas.width = exportWidth * dpr;
      canvas.height = exportHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      // Transparent background: clearRect without any fillRect
      ctx.clearRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${title || "mindmap"}-思维导图.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = url;
  }, [layout, title, theme]);

  const handleExportOpml = useCallback(() => {
    const xml = exportMindmapToOpml(tree, title);
    const blob = new Blob([xml], { type: "text/x-opml+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}.opml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  }, [tree, title]);

  const handleExportFreeMind = useCallback(() => {
    const xml = exportMindmapToFreeMind(tree);
    const blob = new Blob([xml], { type: "application/x-freemind;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}.mm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  }, [tree, title]);

  const handleExportMarkdownOutline = useCallback(() => {
    const md = exportMindmapToMarkdownOutline(tree);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}-outline.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  }, [tree, title]);

  const editingNode = useMemo(() => {
    if (!editingNodeId) return null;
    return layout.nodes.find((n) => n.id === editingNodeId) || null;
  }, [editingNodeId, layout.nodes]);

  const contextTargetNode = useMemo(() => {
    if (!contextMenu) return null;
    return findNode(tree, contextMenu.nodeId);
  }, [contextMenu, tree]);

  const isBatchMode = selectedNodeIds.size > 1;

  const [isCompact, setIsCompact] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setIsCompact(w < 860);
        setIsNarrow(w < 660);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`mindmap-view-container ${isDragging ? "is-dragging" : ""} ${isCompact ? "is-compact" : ""} ${isNarrow ? "is-narrow" : ""}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Top Floating Clean & Spacious Control Bar */}
      <header className="mindmap-toolbar">
        <div className="mindmap-toolbar-left">
          <div className="mindmap-toolbar-title" title={tree.text || title}>
            <ListTree size={16} className="text-cyan" />
            <strong>{tree.text || title || "思维导图"}</strong>
          </div>
          <span className="mindmap-node-count-badge">
            {layout.nodes.length} 节点
          </span>
          {selectedNodeIds.size > 1 && (
            <span className="mindmap-node-count-badge text-cyan">
              已选 {selectedNodeIds.size} 项
            </span>
          )}
        </div>

        <div className="mindmap-toolbar-center">
          {editable && (
            <>
              <div className="mindmap-toolbar-btn-group">
                <button
                  type="button"
                  className="mindmap-tool-btn text-btn highlight-btn"
                  onClick={() => handleAddSibling()}
                  title="添加同级主题 (Enter)"
                >
                  <PlusCircle size={14} />
                  <span>同级主题</span>
                </button>
                <button
                  type="button"
                  className="mindmap-tool-btn text-btn highlight-btn"
                  onClick={() => handleAddChild()}
                  title="添加子主题 (Tab)"
                >
                  <CornerDownRight size={14} />
                  <span>子主题</span>
                </button>
              </div>

              <div className="mindmap-toolbar-divider" />

              <div className="mindmap-toolbar-btn-group">
                <button
                  type="button"
                  className="mindmap-tool-btn text-btn secondary-action"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    setContextMenu({
                      x: rect.left - (containerRect?.left ?? 0),
                      y: rect.bottom - (containerRect?.top ?? 0) + 6,
                      nodeId: primarySelectedId || tree.id,
                    });
                  }}
                  title="自定义节点背景、边框、形状、字体及连线风格 (也可在节点上右键)"
                >
                  <Palette size={14} className="text-cyan" />
                  <span>{isBatchMode ? `批量样式 (${selectedNodeIds.size})` : "外观样式"}</span>
                </button>
              </div>

              <div className="mindmap-toolbar-divider" />
            </>
          )}

          <div className="mindmap-toolbar-btn-group">
            <button
              type="button"
              className="mindmap-tool-btn text-btn secondary-action"
              onClick={handleSelectAll}
              title="选中所有节点 (Ctrl+A)"
            >
              <CheckSquare size={13} />
              <span>全选</span>
            </button>
            <button
              type="button"
              className="mindmap-tool-btn text-btn secondary-action"
              onClick={handleCollapseToLevel2}
              title="仅保留 1~2 级主题"
            >
              <FoldVertical size={13} />
              <span>折叠至2级</span>
            </button>
            <button
              type="button"
              className="mindmap-tool-btn text-btn secondary-action"
              onClick={handleExpandAll}
              title="展开所有分支"
            >
              <UnfoldVertical size={13} />
              <span>全部展开</span>
            </button>
          </div>

          <div className="mindmap-toolbar-divider" />

          {/* In-Canvas Search Toolbar Group */}
          <div className="mindmap-toolbar-btn-group mindmap-search-group">
            <button
              type="button"
              className={`mindmap-tool-btn text-btn ${isSearchOpen ? "highlight-btn" : ""}`}
              onClick={() => {
                setIsSearchOpen((prev) => {
                  const next = !prev;
                  if (next) setTimeout(() => searchInputRef.current?.focus(), 60);
                  return next;
                });
              }}
              title="搜索导图节点"
            >
              <Search size={13} className="text-cyan" />
              <span>搜索</span>
            </button>
            {isSearchOpen && (
              <div className="mindmap-search-box">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="搜索导图节点..."
                  className="mindmap-search-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (e.shiftKey) handlePrevSearch();
                      else handleNextSearch();
                    } else if (e.key === "Escape") {
                      setIsSearchOpen(false);
                      setSearchQuery("");
                      setSearchMatchIds([]);
                    }
                  }}
                />
                {searchMatchIds.length > 0 && (
                  <span className="mindmap-search-count">
                    {currentSearchIndex + 1}/{searchMatchIds.length}
                  </span>
                )}
                <button
                  type="button"
                  className="mindmap-search-nav-btn"
                  onClick={handlePrevSearch}
                  disabled={searchMatchIds.length === 0}
                  title="上一个 (Shift+Enter)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="mindmap-search-nav-btn"
                  onClick={handleNextSearch}
                  disabled={searchMatchIds.length === 0}
                  title="下一个 (Enter)"
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="mindmap-search-nav-btn close-btn"
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                    setSearchMatchIds([]);
                  }}
                  title="关闭搜索 (Esc)"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mindmap-toolbar-right" ref={exportMenuRef}>
          <div className="mindmap-export-dropdown">
            <button
              type="button"
              className={`mindmap-tool-btn text-btn export-btn ${isExportMenuOpen ? "active" : ""}`}
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              title="导出导图为 PNG、OPML 2.0、FreeMind (.mm) 或 Markdown 大纲"
              aria-haspopup="true"
              aria-expanded={isExportMenuOpen}
            >
              <Download size={14} />
              <span>导出 ▾</span>
            </button>
            {isExportMenuOpen && (
              <div className="mindmap-export-menu" role="menu">
                <button
                  type="button"
                  className="mindmap-export-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleExportPng();
                  }}
                >
                  <span className="export-item-title">导出 PNG 图片</span>
                  <span className="export-item-desc">高清透明背景位图 (.png)</span>
                </button>
                <button
                  type="button"
                  className="mindmap-export-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleExportOpml();
                  }}
                >
                  <span className="export-item-title">导出 OPML 2.0</span>
                  <span className="export-item-desc">兼容 MindNode、OmniOutliner (.opml)</span>
                </button>
                <button
                  type="button"
                  className="mindmap-export-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleExportFreeMind();
                  }}
                >
                  <span className="export-item-title">导出 FreeMind (.mm)</span>
                  <span className="export-item-desc">兼容 XMind、FreeMind、Freeplane (.mm)</span>
                </button>
                <button
                  type="button"
                  className="mindmap-export-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleExportMarkdownOutline();
                  }}
                >
                  <span className="export-item-title">导出 Markdown 大纲</span>
                  <span className="export-item-desc">多级层级纯文本大纲 (.md)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main SVG Infinite Mindmap Canvas */}
      <svg
        ref={svgRef}
        className="mindmap-svg-canvas"
        width="100%"
        height="100%"
      >
        <defs>
          <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g
          className="mindmap-viewport"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          {/* Render Bezier / Step / Straight Connecting Edges */}
          <g className="mindmap-edges-group">
            {layout.edges.map((edge) => {
              const defaultColor = BRANCH_COLORS[edge.colorIndex % BRANCH_COLORS.length];
              const color = edge.color || defaultColor;
              const isHighlighted =
                hoveredNodeId === edge.fromId ||
                hoveredNodeId === edge.toId ||
                selectedNodeIds.has(edge.fromId) ||
                selectedNodeIds.has(edge.toId);
              return (
                <path
                  key={`${edge.fromId}->${edge.toId}`}
                  d={edge.d}
                  className={`mindmap-branch-path ${isHighlighted ? "is-highlighted" : ""}`}
                  stroke={color}
                  strokeWidth={isHighlighted ? 2.5 : 1.8}
                  fill="none"
                  strokeOpacity={isHighlighted ? 0.95 : 0.65}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Render Mindmap Nodes */}
          <g className="mindmap-nodes-group">
            {layout.nodes.map((node) => {
              const defaultBranchColor =
                node.level === 0
                  ? "#38bdf8"
                  : BRANCH_COLORS[node.colorIndex % BRANCH_COLORS.length];
              const customBg = node.color || "";
              const isCustomTransparent = customBg === "transparent";
              const isHovered = hoveredNodeId === node.id;
              const isSelected = selectedNodeIds.has(node.id);
              const isRoot = node.level === 0;

              // Border stroke calculation
              let strokeColor = defaultBranchColor;
              let strokeWidth = isSelected ? 2.2 : isHovered ? 1.8 : isRoot ? 1.6 : 1.2;

              if (node.borderColor === "transparent") {
                strokeColor = "transparent";
                strokeWidth = 0;
              } else if (node.borderColor) {
                strokeColor = node.borderColor;
              } else if (customBg && !isCustomTransparent) {
                strokeColor = isSelected
                  ? "#38bdf8"
                  : isHovered
                  ? "rgba(255, 255, 255, 0.75)"
                  : "rgba(0, 0, 0, 0.18)";
              }

              // Automatic high-contrast text color when custom background is set
              const autoContrastTextColor =
                customBg && !isCustomTransparent ? getContrastTextColor(customBg) : "";
              const resolvedTextColor =
                node.textColor ||
                autoContrastTextColor ||
                (isRoot ? "#38bdf8" : undefined);

              return (
                <g
                  key={node.id}
                  className={`mindmap-node-interactive ${isRoot ? "is-root" : ""} ${
                    isSelected ? "is-selected" : ""
                  } ${isHovered ? "is-hovered" : ""} ${dropTargetId === node.id ? "is-drop-target" : ""} ${
                    searchMatchIds.includes(node.id) ? "is-search-match" : ""
                  }`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    if (!isRoot && editable) {
                      nodeDragStartRef.current = {
                        nodeId: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        hasMoved: false,
                      };
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey || e.ctrlKey) {
                      setSelectedNodeIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      });
                    } else {
                      setSelectedNodeIds(new Set([node.id]));
                    }
                    setContextMenu(null);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (editable) {
                      startEditing(node.id);
                    } else if (!isRoot && onJumpToHeading) {
                      onJumpToHeading(node.id, node.line);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selectedNodeIds.has(node.id)) {
                      setSelectedNodeIds(new Set([node.id]));
                    }
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    const cX = containerRect ? e.clientX - containerRect.left : e.clientX;
                    const cY = containerRect ? e.clientY - containerRect.top : e.clientY;
                    setContextMenu({ x: cX, y: cY, nodeId: node.id });
                  }}
                >
                  <title>
                    {isRoot
                      ? "中心主题 (右键设置样式，按 Tab 添加子主题)"
                      : `${node.text} (可按住拖拽至其他主题移为子分支，双击编辑，右键设置样式)`}
                  </title>

                  {/* Drop Target Adsorption Glowing Ring */}
                  {dropTargetId === node.id && (
                    <g className="mindmap-drop-target-indicator">
                      <rect
                        x={-7}
                        y={-7}
                        width={node.width + 14}
                        height={node.height + 14}
                        rx={12}
                        ry={12}
                        fill="rgba(56, 189, 248, 0.22)"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        strokeDasharray="5 3"
                      />
                      <text
                        x={node.width / 2}
                        y={-10}
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize={11}
                        fontWeight="bold"
                      >
                        + 移为子主题
                      </text>
                    </g>
                  )}

                  {/* In-Canvas Search Match Ring */}
                  {searchMatchIds.includes(node.id) && (
                    <rect
                      x={-5}
                      y={-5}
                      width={node.width + 10}
                      height={node.height + 10}
                      rx={10}
                      ry={10}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={searchMatchIds[currentSearchIndex] === node.id ? 3 : 1.8}
                      strokeDasharray={searchMatchIds[currentSearchIndex] === node.id ? "none" : "4 2"}
                    />
                  )}

                  {/* Selection Glow Outline */}
                  {isSelected && (
                    <rect
                      x={-3}
                      y={-3}
                      width={node.width + 6}
                      height={node.height + 6}
                      rx={
                        node.shape === "capsule"
                          ? (node.height + 6) / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "underline"
                          ? 4
                          : isRoot
                          ? 11
                          : 9
                      }
                      ry={
                        node.shape === "capsule"
                          ? (node.height + 6) / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "underline"
                          ? 4
                          : isRoot
                          ? 11
                          : 9
                      }
                      className="mindmap-node-selection-ring"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Node Capsule / Rounded / Rect / Underline Background */}
                  {node.shape === "underline" ? (
                    <>
                      <rect
                        width={node.width}
                        height={node.height}
                        fill="transparent"
                        className="mindmap-node-rect-underline"
                      />
                      <line
                        x1={0}
                        y1={node.height - 2}
                        x2={node.width}
                        y2={node.height - 2}
                        stroke={node.borderColor || (customBg && !isCustomTransparent ? customBg : defaultBranchColor)}
                        strokeWidth={isSelected ? 2.8 : isHovered ? 2.2 : 1.8}
                      />
                    </>
                  ) : (
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={
                        node.shape === "capsule"
                          ? node.height / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "rounded"
                          ? 6
                          : isRoot
                          ? 8
                          : 6
                      }
                      ry={
                        node.shape === "capsule"
                          ? node.height / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "rounded"
                          ? 6
                          : isRoot
                          ? 8
                          : 6
                      }
                      className="mindmap-node-rect"
                      data-custom-color={!!customBg}
                      data-transparent={isCustomTransparent}
                      style={{
                        fill: isCustomTransparent ? "transparent" : (customBg || undefined),
                        stroke: strokeColor,
                        strokeWidth: strokeWidth,
                      }}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      filter={isSelected || isHovered ? "url(#node-glow)" : undefined}
                    />
                  )}

                  {/* Node Label Text - Rendered via <tspan> for multi-line and text alignments */}
                  {(() => {
                    const lines = node.lines && node.lines.length > 0 ? node.lines : [node.text];
                    const align = node.textAlign || "center";
                    const effectiveFontSize = node.fontSize || (isRoot ? 15 : 13);
                    const lineHeight = Math.round(effectiveFontSize * 1.38);
                    const padX = isRoot ? 18 : 12;
                    const innerWidth = Math.max(20, node.width - padX * 2);

                    // Vertical centering: each line is placed at the center of its
                    // line box and rendered with dominant-baseline: central.
                    const totalTextHeight = lines.length * lineHeight;
                    const firstLineCenterY = (node.height - totalTextHeight) / 2 + lineHeight / 2;

                    let textAnchor: "middle" | "start" | "end" = "middle";
                    let xPos = node.width / 2;

                    if (align === "left") {
                      textAnchor = "start";
                      xPos = padX;
                    } else if (align === "right") {
                      textAnchor = "end";
                      xPos = node.width - padX;
                    } else if (align === "justify") {
                      textAnchor = "start";
                      xPos = padX;
                    }

                    return (
                      <text
                        className={`mindmap-node-title-text ${isRoot ? "root-title" : ""}`}
                        style={{
                          fontSize: `${effectiveFontSize}px`,
                          fontWeight: node.fontWeight ? (node.fontWeight === "bold" ? 700 : 400) : (isRoot ? 700 : 500),
                          fill: resolvedTextColor || undefined,
                          // Inline styles beat author CSS, guaranteeing the chosen
                          // alignment actually takes effect on the SVG text.
                          textAnchor,
                          dominantBaseline: "central",
                        }}
                      >
                        {lines.map((line, idx) => {
                          const isNotLast = idx < lines.length - 1;
                          const isJustified = align === "justify" && isNotLast && line.trim().length > 1;

                          return (
                            <tspan
                              key={idx}
                              x={xPos}
                              y={firstLineCenterY + idx * lineHeight}
                              textLength={isJustified ? innerWidth : undefined}
                              lengthAdjust={isJustified ? "spacing" : undefined}
                            >
                              {line}
                            </tspan>
                          );
                        })}
                      </text>
                    );
                  })()}

                  {/* Children Collapse/Expand Toggle Button (+ / - geometrically centered via SVG vector lines) */}
                  {node.hasChildren && (
                    <g
                      className="mindmap-collapse-btn"
                      transform={`translate(${node.width + 1}, ${node.height / 2})`}
                      onClick={(e) => handleToggleCollapse(node.id, e)}
                    >
                      <circle
                        r={7}
                        className="mindmap-collapse-circle"
                        stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                        strokeWidth={1.2}
                      />
                      {/* Horizontal bar of minus / plus - guaranteed centered at y=0 */}
                      <line
                        x1={-3.2}
                        y1={0}
                        x2={3.2}
                        y2={0}
                        stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                        strokeWidth={1.4}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      {/* Vertical bar of plus when collapsed - guaranteed centered at x=0 */}
                      {node.collapsed && (
                        <line
                          x1={0}
                          y1={-3.2}
                          x2={0}
                          y2={3.2}
                          stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                          strokeWidth={1.4}
                          strokeLinecap="round"
                          pointerEvents="none"
                        />
                      )}
                      <title>{node.collapsed ? "展开子分支" : "折叠子分支"}</title>
                    </g>
                  )}

                  {/* Quick Add Subtopic Button on Hover/Selection (+ geometrically centered via SVG vector lines) */}
                  {editable && (isHovered || isSelected) && (
                    <g
                      className="mindmap-node-add-btn"
                      transform={`translate(${node.hasChildren ? node.width + 22 : node.width + 10}, ${node.height / 2})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAddChild(node.id);
                      }}
                    >
                      <circle r={7.5} className="mindmap-add-circle" fill="#38bdf8" />
                      {/* Cross lines of plus - guaranteed centered at (0, 0) */}
                      <line
                        x1={-3.2}
                        y1={0}
                        x2={3.2}
                        y2={0}
                        stroke="#ffffff"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      <line
                        x1={0}
                        y1={-3.2}
                        x2={0}
                        y2={3.2}
                        stroke="#ffffff"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      <title>添加子主题 (Tab)</title>
                    </g>
                  )}

                  {/* Manual Resize Handle at bottom-right corner */}
                  {editable && (isHovered || isSelected) && (
                    <g
                      className="mindmap-node-resize-handle"
                      transform={`translate(${node.width - 9}, ${node.height - 9})`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizingNode({
                          nodeId: node.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          startWidth: node.width,
                          startHeight: node.height,
                        });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleUpdateStyle(node.id, {
                          customWidth: undefined,
                          customHeight: undefined,
                        });
                      }}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={9}
                        height={9}
                        fill="transparent"
                        className="mindmap-resize-hitarea"
                      />
                      {/* Diagonal grip marks */}
                      <line
                        x1={7}
                        y1={2}
                        x2={2}
                        y2={7}
                        stroke="#38bdf8"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                      />
                      <line
                        x1={7}
                        y1={5}
                        x2={5}
                        y2={7}
                        stroke="#38bdf8"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                      />
                      <title>拖动调整节点大小（双击恢复自动自适应）</title>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Dragging Ghost Node Badge Following Cursor */}
      {draggingNodeId && dragGhostPos && (
        <div
          className="mindmap-drag-ghost"
          style={{
            position: "fixed",
            left: dragGhostPos.x + 14,
            top: dragGhostPos.y + 14,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          <span className="ghost-icon">📦</span>
          <span className="ghost-text">
            {layout.nodes.find((n) => n.id === draggingNodeId)?.text || "主题"}
          </span>
          {dropTargetId && <span className="ghost-target-hint">➔ 移为子主题</span>}
        </div>
      )}

      {/* Inline Text Editing Overlay Input */}
      {editingNode && (
        <textarea
          ref={editInputRef}
          className="mindmap-inline-edit-input"
          style={{
            position: "absolute",
            left: transform.x + editingNode.x * transform.scale,
            top: transform.y + editingNode.y * transform.scale,
            width: Math.max(120, editingNode.width * transform.scale),
            height: Math.max(30, editingNode.height * transform.scale),
            fontSize: `${Math.max(11, Math.round((editingNode.fontSize || 13) * transform.scale))}px`,
            fontWeight: editingNode.fontWeight === "bold" ? 700 : 500,
            textAlign: (editingNode.textAlign === "justify" ? "left" : editingNode.textAlign) || "center",
            resize: "none",
          }}
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onBlur={handleCommitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleCommitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancelEdit();
            }
          }}
        />
      )}

      {/* Right Click Appearance & Typography Customization Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="mindmap-context-menu"
          style={{
            left: menuPos.left,
            top: menuPos.top,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mindmap-ctx-header">
            <span
              className="mindmap-ctx-title"
              title={
                isBatchMode
                  ? `批量样式定制 (已选 ${selectedNodeIds.size} 个节点)`
                  : contextTargetNode?.text || "主题样式定制"
              }
            >
              <Palette size={13} className="text-cyan" />
              {isBatchMode
                ? `批量样式定制 (${selectedNodeIds.size}节点)`
                : contextTargetNode?.text || "主题样式定制"}
            </span>
            <button
              type="button"
              className="mindmap-ctx-close"
              onClick={() => setContextMenu(null)}
              title="关闭"
            >
              <X size={13} />
            </button>
          </div>

          {/* Node Background Color */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label-row">
              <span className="mindmap-ctx-label">节点背景颜色</span>
              <label className="mindmap-custom-color-trigger" title="拾取任意自定义背景颜色">
                <input
                  type="color"
                  className="mindmap-hidden-color-input"
                  value={contextTargetNode?.color && contextTargetNode.color !== "transparent" ? contextTargetNode.color : "#38bdf8"}
                  onChange={(e) => handleUpdateStyle(contextMenu.nodeId, { color: e.target.value })}
                />
                <span className="mindmap-custom-color-badge">🎨 自定义</span>
              </label>
            </div>
            <div className="mindmap-ctx-palette">
              {PRESET_COLORS.map((c) => {
                const isActive = (contextTargetNode?.color || "") === c.value;
                const isTransparent = c.value === "transparent";
                return (
                  <button
                    key={c.label}
                    type="button"
                    className={`mindmap-color-swatch ${isTransparent ? "is-transparent-swatch" : ""} ${isActive ? "is-active" : ""}`}
                    style={{ background: isTransparent ? undefined : (c.value || "var(--surface-2)") }}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { color: c.value })}
                    title={`背景: ${c.label}`}
                  >
                    {isActive && <Check size={11} color={c.value === "transparent" ? "#0f172a" : (c.value ? "#ffffff" : "var(--text)")} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Node Border Color */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label-row">
              <span className="mindmap-ctx-label">节点边框颜色</span>
              <label className="mindmap-custom-color-trigger" title="拾取任意边框颜色">
                <input
                  type="color"
                  className="mindmap-hidden-color-input"
                  value={contextTargetNode?.borderColor && contextTargetNode.borderColor !== "transparent" ? contextTargetNode.borderColor : "#38bdf8"}
                  onChange={(e) => handleUpdateStyle(contextMenu.nodeId, { borderColor: e.target.value })}
                />
                <span className="mindmap-custom-color-badge">🎨 自定义</span>
              </label>
            </div>
            <div className="mindmap-ctx-palette">
              {PRESET_BORDER_COLORS.map((c) => {
                const isActive = (contextTargetNode?.borderColor || "") === c.value;
                const isTransparent = c.value === "transparent";
                return (
                  <button
                    key={c.label}
                    type="button"
                    className={`mindmap-color-swatch ${isTransparent ? "is-transparent-swatch" : ""} ${isActive ? "is-active" : ""}`}
                    style={{ background: isTransparent ? undefined : (c.value || "var(--surface-2)") }}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { borderColor: c.value })}
                    title={`边框: ${c.label}`}
                  >
                    {isActive && <Check size={11} color={c.value === "transparent" ? "#0f172a" : (c.value ? "#ffffff" : "var(--text)")} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Node Shape */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label">节点形状</div>
            <div className="mindmap-ctx-pills">
              {PRESET_SHAPES.map((s) => {
                const currentShape = contextTargetNode?.shape || (contextTargetNode?.level === 0 ? "capsule" : "rounded");
                const isActive = currentShape === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    className={`mindmap-pill-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { shape: s.value })}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography: Font Size & Bold Toggle */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label-row">
              <span className="mindmap-ctx-label">字号与加粗</span>
              <button
                type="button"
                className={`mindmap-bold-toggle-btn ${contextTargetNode?.fontWeight === "bold" ? "is-active" : ""}`}
                onClick={() => {
                  const nextWeight = contextTargetNode?.fontWeight === "bold" ? "normal" : "bold";
                  handleUpdateStyle(contextMenu.nodeId, { fontWeight: nextWeight });
                }}
                title={contextTargetNode?.fontWeight === "bold" ? "取消加粗" : "文字加粗 (Bold)"}
              >
                <Bold size={11} strokeWidth={2.6} />
                <span>加粗</span>
              </button>
            </div>
            <div className="mindmap-ctx-pills">
              {PRESET_FONT_SIZES.map((fs) => {
                const currentSize = contextTargetNode?.fontSize || (contextTargetNode?.level === 0 ? 16 : 14);
                const isActive = currentSize === fs.value;
                return (
                  <button
                    key={fs.value}
                    type="button"
                    className={`mindmap-pill-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { fontSize: fs.value })}
                  >
                    {fs.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography: Text Alignment (居中、左对齐、右对齐、双边对齐) */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label">文字对齐</div>
            <div className="mindmap-ctx-pills">
              {PRESET_ALIGNMENTS.map((al) => {
                const currentAlign = contextTargetNode?.textAlign || "center";
                const isActive = currentAlign === al.value;
                const IconComponent = al.icon;
                return (
                  <button
                    key={al.value}
                    type="button"
                    className={`mindmap-pill-btn mindmap-align-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { textAlign: al.value })}
                    title={al.label}
                  >
                    <IconComponent size={12} />
                    <span>{al.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography: Font/Text Color */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label-row">
              <span className="mindmap-ctx-label">文字颜色</span>
              <label className="mindmap-custom-color-trigger" title="拾取任意文字颜色">
                <input
                  type="color"
                  className="mindmap-hidden-color-input"
                  value={contextTargetNode?.textColor || "#0f172a"}
                  onChange={(e) => handleUpdateStyle(contextMenu.nodeId, { textColor: e.target.value })}
                />
                <span className="mindmap-custom-color-badge">🎨 自定义</span>
              </label>
            </div>
            <div className="mindmap-ctx-palette font-palette">
              {PRESET_TEXT_COLORS.map((tc) => {
                const isActive = (contextTargetNode?.textColor || "") === tc.value;
                return (
                  <button
                    key={tc.label}
                    type="button"
                    className={`mindmap-color-swatch text-color-swatch ${isActive ? "is-active" : ""}`}
                    style={{ background: tc.value || "var(--surface-2)" }}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { textColor: tc.value })}
                    title={`文字: ${tc.label}`}
                  >
                    {isActive && <Check size={11} color={tc.value === "#ffffff" ? "#0f172a" : "#ffffff"} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Branch Connector Line Shape */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label">分支连线形状</div>
            <div className="mindmap-ctx-pills">
              {PRESET_LINE_STYLES.map((l) => {
                const currentStyle = contextTargetNode?.lineStyle || "bezier";
                const isActive = currentStyle === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    className={`mindmap-pill-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { lineStyle: l.value })}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Branch Connector Line Color */}
          <div className="mindmap-ctx-section">
            <div className="mindmap-ctx-label-row">
              <span className="mindmap-ctx-label">连线颜色</span>
              <label className="mindmap-custom-color-trigger" title="拾取任意连线颜色">
                <input
                  type="color"
                  className="mindmap-hidden-color-input"
                  value={contextTargetNode?.lineColor || "#38bdf8"}
                  onChange={(e) => handleUpdateStyle(contextMenu.nodeId, { lineColor: e.target.value })}
                />
                <span className="mindmap-custom-color-badge">🎨 自定义</span>
              </label>
            </div>
            <div className="mindmap-ctx-palette">
              {PRESET_LINE_COLORS.map((c) => {
                const isActive = (contextTargetNode?.lineColor || "") === c.value;
                return (
                  <button
                    key={c.label}
                    type="button"
                    className={`mindmap-color-swatch ${isActive ? "is-active" : ""}`}
                    style={{ background: c.value || "var(--surface-2)" }}
                    onClick={() => handleUpdateStyle(contextMenu.nodeId, { lineColor: c.value })}
                    title={`连线: ${c.label}`}
                  >
                    {isActive && <Check size={11} color={c.value ? "#ffffff" : "var(--text)"} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mindmap-ctx-divider" />

          {/* Actions */}
          <div className="mindmap-ctx-actions">
            {!isBatchMode && (
              <>
                <button
                  type="button"
                  className="mindmap-ctx-action-item"
                  onClick={() => {
                    const nid = contextMenu.nodeId;
                    setContextMenu(null);
                    handleAddChild(nid);
                  }}
                >
                  <CornerDownRight size={13} />
                  <span>添加子主题 (Tab)</span>
                </button>
                <button
                  type="button"
                  className="mindmap-ctx-action-item"
                  onClick={() => {
                    const nid = contextMenu.nodeId;
                    setContextMenu(null);
                    handleAddSibling(nid);
                  }}
                >
                  <PlusCircle size={13} />
                  <span>添加同级主题 (Enter)</span>
                </button>
                <button
                  type="button"
                  className="mindmap-ctx-action-item"
                  onClick={() => {
                    const nid = contextMenu.nodeId;
                    setContextMenu(null);
                    startEditing(nid);
                  }}
                >
                  <Edit3 size={13} />
                  <span>重命名 (F2)</span>
                </button>
              </>
            )}
            {(contextTargetNode?.customWidth || contextTargetNode?.customHeight) && (
              <button
                type="button"
                className="mindmap-ctx-action-item"
                onClick={() => {
                  handleUpdateStyle(contextMenu.nodeId, {
                    customWidth: undefined,
                    customHeight: undefined,
                  });
                }}
              >
                <RotateCcw size={13} />
                <span>恢复自适应大小</span>
              </button>
            )}
            <button
              type="button"
              className="mindmap-ctx-action-item is-delete"
              onClick={() => {
                const nid = contextMenu.nodeId;
                setContextMenu(null);
                handleDeleteNode(nid);
              }}
            >
              <Trash2 size={13} />
              <span>{isBatchMode ? `删除选中的 ${selectedNodeIds.size} 个主题 (Del)` : "删除主题 (Del)"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
