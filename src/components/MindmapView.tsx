import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// The icons the style panel draws with went with it; what is left here is the
// canvas, the toolbar and the inline editor.
import type { Heading, ThemeMode } from "../core/types";
import {
  buildMindmapTree,
  parseMarkdownToMindmapTree,
  addChildNode,
  findNode,
  calculateNodeDimensions,
} from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import { MindmapCanvasMenu } from "./MindmapCanvasMenu";
import { MindmapNodeStyleMenu } from "./MindmapNodeStyleMenu";
import { MindmapInlineEditor } from "./MindmapInlineEditor";
import { MindmapToolbar } from "./MindmapToolbar";
import { branchColorFor, freezeAppearance } from "../core/mindmapThemes";
import { type MindmapLayoutNode } from "../services/mindmapLayout";
import {
  allTags,
  areRelated,
  iconFor,
  linkFor,
  markersFor,
  noteFor,
  setNodeIcon,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeProgress,
  setNodeTags,
  tagsFor,
  floatingTopics,
} from "../services/mindmapSidecar";
import { boundsOfBoxes, unionBounds } from "../core/mindmapBounds";
import { MindmapFloatingTopics, type FloatingBox } from "./MindmapFloatingTopics";
import { MindmapSummaries } from "./MindmapSummaries";
import { MindmapBoundaries } from "./MindmapBoundaries";
import { MindmapFloatingAnnotationMenu } from "./MindmapFloatingAnnotationMenu";
import { parseMindmapLink } from "../core/mindmapLinks";
import { NodeIcon, NodeLinkMark, NodeMarks, NodeNoteMark, NodeTags } from "./MindmapMarks";
import { MindmapRelationLines } from "./MindmapRelationLines";
import { useMindmapAppearance } from "./mindmap/useMindmapAppearance";
import { useMindmapSearch } from "./mindmap/useMindmapSearch";
import { useMindmapExport } from "./mindmap/useMindmapExport";
import { useMindmapShortcuts } from "./mindmap/useMindmapShortcuts";
import { useMindmapSidecar } from "./mindmap/useMindmapSidecar";
import { useMindmapAnnotations, type MindmapContextMenu } from "./mindmap/useMindmapAnnotations";
import { useMindmapTreeOps } from "./mindmap/useMindmapTreeOps";
import { useMindmapViewport } from "./mindmap/useMindmapViewport";

/**
 * A node's icon, drawn on its leading edge and outside its box.
 *
 * Outside on purpose: a node's size is the layout's business, and growing the
 * box to fit a drawing would move every node in the map — the golden layout
 * snapshots exist to stop exactly that kind of drift. An id this build does not
 * know draws nothing rather than breaking the map.
 */
export type MindmapViewProps = {
  title: string;
  headings?: Heading[];
  source?: string;
  onSourceChange?: (newSource: string) => void;
  editable?: boolean;
  onJumpToHeading?: (headingId: string, line?: number) => void;
  /**
   * Opens another document, for `[[wiki links]]` on a node.
   *
   * Supplied by the caller because only it knows how this app resolves a name to
   * a file — the reader already asks the same question when a wiki link is
   * clicked, so it hands over the same answer rather than a second resolver
   * growing here. Without it, a wiki link is shown and described but not
   * followable, and the panel says so instead of failing on click.
   */
  onWikiLinkClick?: (target: string) => void;
  onClose?: () => void;
  theme?: ThemeMode;
  /**
   * Identifies the document whose folds are being shown.
   *
   * A path, from the caller that has one. It cannot be derived from `title`:
   * a vault with several `README` or `索引` files would share a single set of
   * folds between all of them. Omitted means folds are not persisted for this
   * mind map, which is the right behaviour for a preview with no file behind it.
   */
  documentKey?: string;
  /**
   * The appearance the map falls back to for anything a node has not styled
   * itself. Defaults to the classic theme, so a caller that has not been taught
   * about themes yet still renders as it always did.
   */
  themeId?: string;
};

// Rich 18-color modern curated palette for node card background fill (includes transparent)

// Curated node border colors (includes default branch color and transparent border)

// Curated high-contrast font colors

// Rich 14-color line palette

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

/**
 * Where the collapse toggle sits on a node: just outside the edge its children
 * are on.
 *
 * The answer comes from the layout — either the `side` field the connector pass
 * also uses, or, when the children are spread around the node rather than on one
 * edge, the offset the radial layout worked out. Only the layout knows which way
 * a branch grows; reading it here rather than re-deriving it from coordinates is
 * what keeps the toggle and the connectors agreeing after a layout switch.
 */
function collapseToggleAnchor(node: MindmapLayoutNode): string {
  if (node.toggleOffset) return `translate(${node.toggleOffset.x}, ${node.toggleOffset.y})`;
  if (node.side === "left") return `translate(-1, ${node.height / 2})`;
  if (node.side === "top") return `translate(${node.width / 2}, -1)`;
  if (node.side === "bottom") return `translate(${node.width / 2}, ${node.height + 1})`;
  return `translate(${node.width + 1}, ${node.height / 2})`;
}

export const MindmapView = memo(function MindmapView({
  title,
  headings,
  source,
  onSourceChange,
  editable = true,
  onJumpToHeading,
  onWikiLinkClick,
  onClose,
  theme = "system",
  documentKey,
  themeId,
}: MindmapViewProps) {
  // The companion file and the one writer every annotation edit goes through:
  // the sidecar state, the load-and-merge on document change, the debounced
  // save and `applySidecarEdit`. Extracted to useMindmapSidecar (batch 3,
  // wave 2b). Called here — ahead of useMindmapAppearance — so its load effect
  // keeps running before the appearance hook's load effects, the order they
  // have always run in. The annotation editors' state (the picked and edited
  // relation, floating topic, summary and boundary, and the floating drag)
  // lives in useMindmapAnnotations, called further down at the position its
  // callbacks have always occupied, which keeps the floating drag's
  // window listener the last effect this component registers.
  const { sidecar, applySidecarEdit, sidecarSaveFailed } = useMindmapSidecar({ documentKey });

  /**
   * A note edit arrives on every keystroke, since the panel holds no state of its
   * own; only the disk write waits, which is why the text never lags the typing.
   */
  const handleNoteChange = useCallback(
    (nodeId: string, text: string) =>
      applySidecarEdit(["notes"], (current) => setNodeNote(current, nodeId, text)),
    [applySidecarEdit],
  );

  /**
   * An icon edit. One icon per node: picking the one a node already wears takes
   * it off, which is the only way to say "none" without a menu of its own.
   */
  const handleIconChange = useCallback(
    (nodeId: string, iconId: string) =>
      applySidecarEdit(["icons"], (current) => setNodeIcon(current, nodeId, iconId)),
    [applySidecarEdit],
  );

  /** A node's link, as typed. Stored verbatim; read when someone follows it. */
  const handleLinkChange = useCallback(
    (nodeId: string, text: string) =>
      applySidecarEdit(["links"], (current) => setNodeLink(current, nodeId, text)),
    [applySidecarEdit],
  );

  // The side-of-root writer (`handleSideChange`) and the two-sided layout's
  // "which side does this new branch go on" question (`sideChooser`) live in
  // useMindmapTreeOps (batch 3, wave 2c): their only readers are the tree
  // handlers that write both the tree and the companion file, which moved there
  // with them.

  /**
   * Follows a link to a heading in this document.
   *
   * The document's headings become this map's nodes, so an anchor names a node
   * — which is why following one is the same jump the reader's outline makes,
   * and needs no resolution beyond finding that node. The text must match
   * entirely (case aside): a link that lands somewhere approximate is worse than
   * one that does nothing, because the reader would not know it missed.
   */
  const followAnchor = useCallback(
    (root: MindmapNode, text: string) => {
      const wanted = text.trim().toLowerCase();
      if (!wanted) return;

      const matches: MindmapNode[] = [];
      const walk = (node: MindmapNode) => {
        if (node.text.trim().toLowerCase() === wanted) matches.push(node);
        node.children.forEach(walk);
      };
      walk(root);

      const target = matches[0];
      if (target && onJumpToHeading) onJumpToHeading(target.id, target.line);
    },
    [onJumpToHeading],
  );

  /**
   * Follows a node's link, through whichever channel its form calls for.
   *
   * All three already exist in the app — the shell opens a URL, the reader's own
   * resolver opens a wiki link, and a heading is a node here — so following a
   * link on the map is a matter of picking one, not of building a fourth way to
   * navigate.
   */
  const handleOpenLink = useCallback(
    (root: MindmapNode, nodeId: string) => {
      const link = parseMindmapLink(linkFor(sidecar, nodeId));
      if (!link) return;

      if (link.kind === "external") {
        const bridge =
          typeof window !== "undefined"
            ? (window.knowSpaceDesktop ?? window.bookMDDesktop)
            : undefined;
        void bridge?.openExternal?.(link.target);
        return;
      }

      if (link.kind === "wiki") {
        // The anchor rides along: resolving `doc#heading` is the reader's
        // business, and it already does exactly that for a wiki link in text.
        onWikiLinkClick?.(link.anchor ? `${link.target}#${link.anchor}` : link.target);
        return;
      }

      followAnchor(root, link.target);
    },
    [followAnchor, onWikiLinkClick, sidecar],
  );

  /** A node's tags, replaced wholesale — the list is what the panel edits. */
  const handleTagsChange = useCallback(
    (nodeId: string, tags: string[]) =>
      applySidecarEdit(["tags"], (current) => setNodeTags(current, nodeId, tags)),
    [applySidecarEdit],
  );

  /**
   * Every tag the document uses, most used first.
   *
   * Derived from the sidecar rather than stored, so it cannot fall out of step
   * with the tags it describes, and computed once per change rather than once
   * per keystroke in the note field.
   */
  const documentTags = useMemo(() => allTags(sidecar), [sidecar]);

  /**
   * A priority or a progress edit. One handler for both, because they differ
   * only in which setter they reach — a node carries one of each at the same
   * time, so neither is a separate kind of thing to the panel.
   */
  const handleMarkChange = useCallback(
    (nodeId: string, field: "priority" | "progress", value: number | null) =>
      applySidecarEdit(["markers"], (current) =>
        field === "priority"
          ? setNodePriority(current, nodeId, value)
          : setNodeProgress(current, nodeId, value),
      ),
    [applySidecarEdit],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);

  // Pan & Zoom transform state.
  //
  // Held by the view rather than by useMindmapViewport, deliberately: the tree
  // ops hook runs before the viewport hook (the pan handlers need its callbacks
  // and its layout) and its `handleAddChild` positions the two-sided layout's
  // side question with the transform, so the state has to exist above both.
  // Threading it in is the only acyclic order.
  const [transform, setTransform] = useState({ x: 60, y: 80, scale: 1 });

  // Per-document look & feel: the theme, layout and numbering the reader picks,
  // remembered under the document's key, plus the responsive breakpoints the
  // container class and the toolbar listen to. Extracted to useMindmapAppearance
  // (batch 3, wave 2a); it reads `tree` only for the numbering it derives.
  const {
    handlePickTheme,
    activeThemeId,
    mindmapTheme,
    handlePickLayout,
    activeLayoutId,
    showNumbering,
    handleToggleNumbering,
    numbering,
    isSemiCompact,
    isCompact,
    isNarrow,
    isUltraNarrow,
  } = useMindmapAppearance({ documentKey, themeId, containerRef, tree });

  // The source-sync effect (external document changes re-parse into the tree
  // unless this map has unsynced edits) and the fold persistence moved to
  // useMindmapTreeOps (batch 3, wave 2c), which owns that domain; they keep
  // their relative order there.

  // Selected node(s), inline editing, and context menu states
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set([tree.id]));
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  /**
   * The open context menu, and what it is about.
   *
   * `isCanvas` marks a menu opened on empty canvas. The canvas menu is a
   * different menu rather than the node menu without a subject: it creates,
   * pastes and folds the whole map, none of which need a node.
   *
   * A flag rather than a nullable `nodeId`, because the node menu reads
   * `nodeId` as a plain string in a dozen places. Making it nullable would have
   * forced a narrowing guard into every one of them to describe a state none of
   * them can be in.
   *
   * The shape itself lives with the annotation editors (`MindmapContextMenu` in
   * useMindmapAnnotations), which open this same menu for a line and for a free
   * topic and write the same fields.
   */
  const [contextMenu, setContextMenu] = useState<MindmapContextMenu | null>(null);

  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

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

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // The sides are read from the companion file rather than from the tree: which side a
  // first-level branch hangs on is not something a document can say, and only the
  // two-sided layout has an opinion about it — the others ignore the map entirely.
  const statedSides = sidecar?.sides;

  // The tree domain — Markdown synchronisation, undo/redo, the clipboard, the
  // CRUD/navigation/style handlers, the collapse state and the derived layout —
  // extracted to useMindmapTreeOps (batch 3, wave 2c). Called after
  // useMindmapAppearance, whose `activeLayoutId` the layout needs, and before
  // useMindmapViewport, whose pan handlers need the callbacks and the layout
  // returned here. `tree`/`hasUnsyncedChanges` stay above on purpose: the
  // appearance hook derives the outline numbering from the tree and has to run
  // before this call, so the state cannot live below it.
  const {
    layout,
    collapsedIds,
    handleToggleCollapse,
    handleExpandAll,
    handleCollapseToLevel2,
    sideChooser,
    setSideChooser,
    handleAddChild,
    handleAddSibling,
    handleMoveToSide,
    applyTreeChange,
    handleUndo,
    handleRedo,
    handleSyncToDocument,
    handleMoveSibling,
    clipboardRef,
    clipboardReady,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    startEditing,
    startEditingRef,
    handleCommitEdit,
    handleCancelEdit,
    handleUpdateStyle,
    handleNavigate,
    handleDeleteNode,
  } = useMindmapTreeOps({
    documentKey,
    source,
    title,
    onSourceChange,
    editable,
    applySidecarEdit,
    tree,
    setTree,
    hasUnsyncedChanges,
    setHasUnsyncedChanges,
    activeLayoutId,
    statedSides,
    transform,
    containerRef,
    selectedNodeIds,
    setSelectedNodeIds,
    primarySelectedId,
    editingNodeId,
    setEditingNodeId,
    editingText,
    setEditingText,
    setContextMenu,
    editInputRef,
  });

  // In-canvas search: the field's state, the match set, walking between the
  // matches, and select-all — which shares the "point at topics the reader
  // named" gesture. Extracted to useMindmapSearch (batch 3, wave 2a); the
  // viewport, selection and container stay with the view and thread in here.
  // Called directly after the tree ops hook now, because it needs the layout
  // that hook returns; it registers no effects, so the move changes nothing.
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    searchMatchIds,
    currentSearchIndex,
    searchInputRef,
    handleSearch,
    handleNextSearch,
    handlePrevSearch,
    handleCloseSearch,
    handleSelectAll,
  } = useMindmapSearch({
    tree,
    sidecar,
    layout,
    containerRef,
    setTransform,
    setSelectedNodeIds,
  });

  /**
   * The floating topics, measured the same way the layout measures nodes.
   *
   * Measured rather than stored: a topic's box follows its text, so renaming one
   * resizes it and the file never has to hold a size its own text contradicts.
   * The measurement is the service's, so a free topic looks like the branches
   * beside it instead of like a second opinion about the theme.
   */
  const floatingBoxes = useMemo<FloatingBox[]>(() => {
    return floatingTopics(sidecar).map(({ id, topic }) => {
      const { width, height, lines } = calculateNodeDimensions({
        id,
        text: topic.text,
        level: 1,
        children: [],
      });
      return {
        id,
        text: topic.text,
        lines,
        x: topic.x,
        y: topic.y,
        width,
        height,
        // What it carries, read here rather than in the component: a floating
        // topic's annotations live in the same sections as a node's, so the view
        // reads them the same way and the component draws boxes.
        iconId: iconFor(sidecar, id),
        markers: markersFor(sidecar, id),
        hasNote: Boolean(noteFor(sidecar, id)),
        hasLink: Boolean(parseMindmapLink(linkFor(sidecar, id))),
        tags: tagsFor(sidecar, id),
      };
    });
  }, [sidecar]);

  /**
   * The bounds anything framing the canvas has to use.
   *
   * The layout's bounds cover the tree and nothing else — it has never heard of a
   * free topic — so the export, the printed page and "fit to screen" all take the
   * union. Without it, a topic dragged into open space would be cropped out of the
   * very picture meant to show it.
   */
  const frameBounds = useMemo(() => {
    const floating = boundsOfBoxes(floatingBoxes, 60);
    return floating ? unionBounds(layout.bounds, floating) : layout.bounds;
  }, [floatingBoxes, layout.bounds]);

  /** Where each laid-out node is, for the relation lines to be drawn between. */
  const relationBoxes = useMemo(
    () =>
      new Map(
        layout.nodes.map((node) => [
          node.id,
          { x: node.x, y: node.y, width: node.width, height: node.height },
        ]),
      ),
    [layout],
  );

  /** The stored relations, or nothing while the file is still being read. */
  const relations = sidecar?.relations ?? [];

  // The camera and the container-level gestures — the pan & zoom handlers, the
  // wheel zoom, "fit to screen", the marquee press, the print view-box swap,
  // and the container mouse trio (which multiplexes the node-resize stream and
  // the node drag-and-drop hit-testing alongside the pan) — extracted to
  // useMindmapViewport (batch 3, wave 2c). The trio cannot be split without
  // composing handlers in the view and changing the order its branches run in,
  // so the whole of it lives there and the drag/resize states moved with the
  // gesture that drives them; the view reads them back for the ghost badge and
  // the drop indicators. The transform itself stays above, threaded into both
  // this hook and the tree ops hook (see the note on the state).
  const {
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleZoomStep,
    handleFitToScreen,
    isBlankCanvasTarget,
    handleCanvasMouseDown,
    marquee,
    setMarquee,
    marqueeStartRef,
    marqueeRectRef,
    setResizingNode,
    draggingNodeId,
    dragGhostPos,
    dropTargetId,
    dropPosition,
    nodeDragStartRef,
  } = useMindmapViewport({
    containerRef,
    svgRef,
    transform,
    setTransform,
    layout,
    frameBounds,
    tree,
    applyTreeChange,
    handleUpdateStyle,
    handleCommitEdit,
    editingNodeId,
    contextMenu,
    setContextMenu,
    sideChooser,
    setSideChooser,
    setSelectedNodeIds,
  });

  // Initial fit on mount. Still in the view on purpose: in a new file
  // exhaustive-deps is an error, and adding `handleFitToScreen` would re-run
  // this effect on every layout change — re-fitting the canvas after each
  // edit instead of once on mount, which is the behaviour this timing guards.
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // applyTreeChange, handleMoveSibling, handleZoomStep, the clipboard and its
  // copy/cut/paste, `isBlankCanvasTarget` and `startEditingRef` moved to
  // useMindmapTreeOps and useMindmapViewport (batch 3, wave 2c); they arrive
  // back from those calls above. `isBlankCanvasTarget` is a pure predicate, so
  // the canvas-level gestures below keep asking it first, exactly as before.

  /** Double-clicking empty canvas adds a branch under the root, ready to name. */
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editable || !isBlankCanvasTarget(e.target)) return;
      e.preventDefault();

      const { nextTree, newNodeId } = addChildNode(tree, tree.id, "新建子主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      startEditingRef.current(newNodeId);
    },
    [applyTreeChange, editable, isBlankCanvasTarget, tree],
  );

  /**
   * Right-clicking empty canvas opens the canvas menu.
   *
   * Reported with a null nodeId rather than the root's, because the canvas menu
   * offers actions with no subject — paste, expand all, fit to screen — and
   * quietly addressing the root would put "delete" one mis-click away from a
   * gesture aimed at nothing.
   */
  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!isBlankCanvasTarget(e.target)) return;
      e.preventDefault();

      const containerRect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: containerRect ? e.clientX - containerRect.left : e.clientX,
        y: containerRect ? e.clientY - containerRect.top : e.clientY,
        nodeId: tree.id,
        isCanvas: true,
      });
    },
    [isBlankCanvasTarget],
  );

  // The marquee's state, refs and press handler moved to useMindmapViewport
  // (batch 3, wave 2c) and come back from that call. The release effect below
  // stays here on purpose: it puts the picked relation down via
  // `setSelectedRelation`, which useMindmapAnnotations returns further down —
  // the same late-bound closure the wave 2b extraction documented — and a hook
  // called before that one cannot receive the setter without changing when
  // these window listeners attach relative to the floating-drag listener,
  // which must stay the last one registered.
  const isMarqueeSelecting = marquee !== null;

  useEffect(() => {
    if (!isMarqueeSelecting) return;

    const handleMove = (e: MouseEvent) => {
      const start = marqueeStartRef.current;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!start || !containerRect) return;

      // Pressing on bare canvas puts the picked line down, as it does the picked
      // group: there is one selection on this map, and the reader has moved on.
      setSelectedRelation(null);

      const rect = {
        x1: start.x,
        y1: start.y,
        x2: (e.clientX - containerRect.left - transform.x) / transform.scale,
        y2: (e.clientY - containerRect.top - transform.y) / transform.scale,
      };
      marqueeRectRef.current = rect;
      setMarquee(rect);
    };

    const handleUp = () => {
      const rect = marqueeRectRef.current;
      if (rect && layout) {
        const left = Math.min(rect.x1, rect.x2);
        const right = Math.max(rect.x1, rect.x2);
        const top = Math.min(rect.y1, rect.y2);
        const bottom = Math.max(rect.y1, rect.y2);

        // Intersection, not containment: requiring a node to be fully inside
        // means a box drawn across a row of branches selects nothing, which is
        // the opposite of what drawing it feels like.
        const hit = layout.nodes
          .filter(
            (n) => n.x < right && n.x + n.width > left && n.y < bottom && n.y + n.height > top,
          )
          .map((n) => n.id);
        if (hit.length) setSelectedNodeIds(new Set(hit));
      }
      marqueeStartRef.current = null;
      marqueeRectRef.current = null;
      setMarquee(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isMarqueeSelecting, layout, transform.scale, transform.x, transform.y]);

  // handleUndo/handleRedo/handleSyncToDocument and the interactive topic
  // actions — add child (with the two-sided layout's side question), add
  // sibling, delete, rename, style, keyboard navigation, and the move-to-other-
  // side row — moved to useMindmapTreeOps (batch 3, wave 2c); they arrive back
  // from that call above, and useMindmapShortcuts below composes them exactly
  // as it always did.

  // Global Mindmap Keydown shortcuts. The handler body — guards, order,
  // preventDefaults — lives verbatim in useMindmapShortcuts (batch 3, wave 2a);
  // everything it composes threads in from the view's own hooks and locals.
  useMindmapShortcuts({
    editingNodeId,
    isSearchOpen,
    sideChooser,
    contextMenu,
    selectedNodeIds,
    setIsSearchOpen,
    searchInputRef,
    handleCloseSearch,
    setSideChooser,
    setContextMenu,
    setSelectedNodeIds,
    handleSelectAll,
    handleCommitEdit,
    handleCancelEdit,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    handleUndo,
    handleRedo,
    handleSyncToDocument,
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    startEditing,
    handleZoomStep,
    handleFitToScreen,
    handleMoveSibling,
    handleNavigate,
    onClose,
  });

  // The edit-input focus effect moved to useMindmapTreeOps (batch 3, wave 2c),
  // where it keeps its place in that hook's effect sequence after the sync and
  // fold effects. The container mouse trio, the wheel zoom and the collapse
  // handlers moved to useMindmapTreeOps and useMindmapViewport and arrive back
  // from the calls above; the container's props below read them unchanged.

  // The seven ways a map leaves the app — PNG, SVG, print/PDF, OPML, FreeMind,
  // XMind and the Markdown outline. Extracted to useMindmapExport (batch 3,
  // wave 2a); isDarkUi went with it, as the image exports' only reader.
  const {
    handleExportPng,
    handleExportSvg,
    handlePrintPdf,
    handleExportOpml,
    handleExportFreeMind,
    handleExportXmind,
    handleExportMarkdownOutline,
  } = useMindmapExport({ title, tree, theme, svgRef, layout, frameBounds, collapsedIds, sidecar });

  const editingNode = useMemo(() => {
    if (!editingNodeId) return null;
    return layout.nodes.find((n) => n.id === editingNodeId) || null;
  }, [editingNodeId, layout.nodes]);

  const contextTargetNode = useMemo(() => {
    if (!contextMenu) return null;
    return findNode(tree, contextMenu.nodeId);
  }, [contextMenu, tree]);

  const isBatchMode = selectedNodeIds.size > 1;

  /**
   * Opens the style panel under whatever the toolbar pressed.
   *
   * The bar measures its own button and hands the rect over; converting it into
   * canvas coordinates belongs here, because the canvas offset is this view's to
   * know. The panel targets the primary selection, or the root when nothing is
   * selected — the same target the node context menu uses.
   */
  /**
   * Writes the current theme's appearance into the selected nodes.
   *
   * Confirmed first, because it is the one action here that changes what later
   * theme switches do to these nodes: after it they stop following. It cannot
   * lose anything a reader set by hand — `freezeAppearance` gives a node's own
   * value priority, so writing the answer back is a no-op for every field the
   * node had already chosen.
   */
  const handleFreezeTheme = useCallback(() => {
    const targetIds =
      selectedNodeIds.size > 1 ? Array.from(selectedNodeIds) : [primarySelectedId || tree.id];

    const confirmed = window.confirm(
      `将把当前主题的外观固化到 ${targetIds.length} 个节点的样式上。\n\n` +
        "此后切换主题时，这些节点不再跟随；你手工设置过的颜色、形状与字号不会改变。\n\n是否继续？",
    );
    if (!confirmed) return;

    applyTreeChange(freezeAppearance(tree, targetIds, mindmapTheme));
  }, [tree, selectedNodeIds, primarySelectedId, mindmapTheme, applyTreeChange]);

  const handleStylePanelRequest = useCallback(
    (anchor: DOMRect) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: anchor.left - (containerRect?.left ?? 0),
        y: anchor.bottom - (containerRect?.top ?? 0) + 6,
        nodeId: primarySelectedId || tree.id,
      });
    },
    [primarySelectedId, tree.id],
  );

  /**
   * The node the style panel describes and every annotation control writes to:
   * the node the menu was opened on, or the root when nothing is selected — the
   * same target the node context menu uses. Declared here rather than with the
   * other derived values because both of the things it is derived from are
   * declared later than them.
   */
  const panelNodeId = contextMenu?.nodeId ?? tree.id;

  const panelLink = linkFor(sidecar, panelNodeId);
  const parsedPanelLink = parseMindmapLink(panelLink);

  /**
   * Whether this build can actually go where the panel's link points.
   *
   * Worked out here rather than in the panel, because it is a fact about what
   * this app was handed: a wiki link needs a caller that can open documents, and
   * an anchor needs a caller that can jump. The button is offered disabled with
   * the reason, rather than hidden — a control that vanishes teaches nothing.
   */
  /**
   * The annotation editors: relations, free topics, summaries and boundaries —
   * their picked/edited state, their callbacks, the free topic's drag window
   * listener and the box each inline editor draws over. Extracted to
   * useMindmapAnnotations (batch 3, wave 2b); called here, at the position its
   * callbacks have always occupied, so the drag listener stays the last effect
   * this component registers. `setSelectedRelation` is read above this line by
   * the marquee effect; that reference sits inside the effect's closure, which
   * only ever runs after this call has returned.
   */
  const {
    selectedRelation,
    setSelectedRelation,
    handleToggleRelation,
    handleRelationChange,
    handleRelationContextMenu,
    handleRemoveSelectedRelation,
    handleStartRelationEdit,
    handleCancelRelationEdit,
    handleCommitRelationEdit,
    editingRelationBox,
    selectedRelationInfo,
    selectedFloatingId,
    setSelectedFloatingId,
    handleFloatingDragStart,
    handleStartFloatingEdit,
    handleCancelFloatingEdit,
    handleCommitFloatingEdit,
    handleRemoveFloatingTopic,
    handleFloatingContextMenu,
    handleDeleteFloatingTopic,
    handleNewFloatingTopic,
    editingFloatingBox,
    selectedSummaryId,
    setSelectedSummaryId,
    handleAddSummary,
    handleRemoveSummary,
    handleStartSummaryEdit,
    handleCancelSummaryEdit,
    handleCommitSummaryEdit,
    summaryBoxes,
    editingSummaryBox,
    selectedBoundaryId,
    setSelectedBoundaryId,
    handleAddBoundary,
    handleRemoveBoundary,
    handleBoundaryColorChange,
    handleStartBoundaryEdit,
    handleCancelBoundaryEdit,
    handleCommitBoundaryEdit,
    boundaryBoxes,
    editingBoundaryBox,
  } = useMindmapAnnotations({
    applySidecarEdit,
    selectedNodeIds,
    containerRef,
    transform,
    menuPos,
    editingText,
    setEditingText,
    setContextMenu,
    treeId: tree.id,
    sidecar,
    layout,
    relationBoxes,
    floatingBoxes,
  });

  /**
   * The one inline editor, and what it is editing.
   *
   * One render site rather than one per kind. A node, a free topic and a
   * summary's label are all a box with text in it, and the editor never wanted
   * more than that — deciding here, in one place, is also what makes it
   * impossible for two editors to be open at once.
   */
  const inlineEdit = editingNode
    ? { box: editingNode, onCommit: handleCommitEdit, onCancel: handleCancelEdit }
    : editingFloatingBox
      ? {
          box: editingFloatingBox,
          onCommit: handleCommitFloatingEdit,
          onCancel: handleCancelFloatingEdit,
        }
      : editingSummaryBox
        ? {
            box: editingSummaryBox,
            onCommit: handleCommitSummaryEdit,
            onCancel: handleCancelSummaryEdit,
          }
        : editingBoundaryBox
          ? {
              box: editingBoundaryBox,
              onCommit: handleCommitBoundaryEdit,
              onCancel: handleCancelBoundaryEdit,
            }
          : editingRelationBox
            ? {
                box: editingRelationBox,
                onCommit: handleCommitRelationEdit,
                onCancel: handleCancelRelationEdit,
              }
            : null;

  const selectedIds = [...selectedNodeIds];
  const selectionRelated =
    selectedIds.length === 2 ? areRelated(sidecar, selectedIds[0], selectedIds[1]) : false;

  const canOpenPanelLink =
    parsedPanelLink?.kind === "external" ||
    (parsedPanelLink?.kind === "anchor" && !!onJumpToHeading) ||
    (parsedPanelLink?.kind === "wiki" && !!onWikiLinkClick);

  /**
   * Where a floating topic's link can go.
   *
   * The same question minus the anchor: `#标题` is followed by looking the heading
   * up in the outline, and a topic that is not in the outline has no heading to
   * find. Saying so in the panel is better than offering the button and then
   * doing nothing.
   */
  const canOpenFloatingLink =
    parsedPanelLink?.kind === "external" || (parsedPanelLink?.kind === "wiki" && !!onWikiLinkClick);

  /** The floating topic the menu is about, for a title and a delete. */
  const contextTargetFloating =
    floatingBoxes.find((topic) => topic.id === contextMenu?.nodeId) ?? null;

  return (
    <div
      ref={containerRef}
      className={`mindmap-view-container ${isDragging ? "is-dragging" : ""} ${
        isSemiCompact ? "is-semi-compact" : ""
      } ${isCompact ? "is-compact" : ""} ${isNarrow ? "is-narrow" : ""} ${
        isUltraNarrow ? "is-ultra-narrow" : ""
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Top Floating Clean & Spacious Control Bar */}
      <MindmapToolbar
        title={tree.text || title}
        nodeCount={layout.nodes.length}
        selectedCount={selectedNodeIds.size}
        editable={editable}
        canSyncToDocument={editable && !!onSourceChange}
        hasUnsyncedChanges={hasUnsyncedChanges}
        isUltraNarrow={isUltraNarrow}
        scale={transform.scale}
        themeId={activeThemeId}
        layoutId={activeLayoutId}
        search={{
          isOpen: isSearchOpen,
          query: searchQuery,
          matchIds: searchMatchIds,
          currentIndex: currentSearchIndex,
          inputRef: searchInputRef,
          onToggle: () => {
            setIsSearchOpen((prev) => {
              const next = !prev;
              // Focus after the field exists, hence the delay: it is rendered
              // by the same state change that this returns.
              if (next) setTimeout(() => searchInputRef.current?.focus(), 60);
              return next;
            });
          },
          onQueryChange: handleSearch,
          onPrev: handlePrevSearch,
          onNext: handleNextSearch,
          onClose: handleCloseSearch,
        }}
        onSyncToDocument={handleSyncToDocument}
        onAddSibling={() => handleAddSibling()}
        onAddChild={() => handleAddChild()}
        onStylePanelRequest={handleStylePanelRequest}
        onSelectAll={handleSelectAll}
        onCollapseToLevel2={handleCollapseToLevel2}
        onExpandAll={handleExpandAll}
        onPickTheme={handlePickTheme}
        onPickLayout={handlePickLayout}
        numbering={showNumbering}
        onToggleNumbering={handleToggleNumbering}
        onZoomStep={handleZoomStep}
        onFitToScreen={handleFitToScreen}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onPrintPdf={handlePrintPdf}
        onExportOpml={handleExportOpml}
        onExportFreeMind={handleExportFreeMind}
        onExportXmind={handleExportXmind}
        onExportMarkdownOutline={handleExportMarkdownOutline}
      />

      {/* Main SVG Infinite Mindmap Canvas */}
      <svg
        ref={svgRef}
        className="mindmap-svg-canvas"
        width="100%"
        height="100%"
        // Canvas-level gestures. Each one asks isBlankCanvasTarget first, so
        // a click on a node does not also count as a click on the canvas.
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={handleCanvasContextMenu}
      >
        <defs>
          <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Marquee box. Inside the viewport group so its coordinates are the
            same canvas coordinates the nodes are laid out in — drawing it
            outside would mean converting by hand on every frame. */}
        {marquee && (
          <rect
            className="mindmap-marquee"
            x={Math.min(marquee.x1, marquee.x2)}
            y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)}
            height={Math.abs(marquee.y2 - marquee.y1)}
            fill="rgba(56, 189, 248, 0.12)"
            stroke="#38bdf8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        <g
          className="mindmap-viewport"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          {/* Boundaries are the backmost layer, since a box is a background for
              the group it encloses: the branches leaving those topics pass over
              it, as they do on paper. */}
          <MindmapBoundaries
            boundaries={boundaryBoxes}
            selectedId={selectedBoundaryId}
            onSelect={setSelectedBoundaryId}
            onStartEdit={handleStartBoundaryEdit}
          />

          {/* Relations next, so they pass under the outline rather than across
              it — a line over a label costs both of them their legibility. */}
          <MindmapRelationLines
            relations={relations}
            boxes={relationBoxes}
            selectedKey={
              selectedRelation ? `${selectedRelation.fromId}\u0000${selectedRelation.toId}` : null
            }
            onSelect={setSelectedRelation}
            onStartLabelEdit={handleStartRelationEdit}
            onOpenMenu={handleRelationContextMenu}
          />

          {/* Render Bezier / Step / Straight Connecting Edges */}
          <g className="mindmap-edges-group">
            {layout.edges.map((edge) => {
              // The theme is where branch colours come from. An edge that
              // carries its own colour keeps it; only the default changes.
              const defaultColor = branchColorFor(mindmapTheme, edge.colorIndex);
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
                  ? (mindmapTheme.root.fill ?? mindmapTheme.node.fill)
                  : branchColorFor(mindmapTheme, node.colorIndex);
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
                node.textColor || autoContrastTextColor || (isRoot ? "#38bdf8" : undefined);

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
                        {dropPosition === "before"
                          ? "↑ 插入到此主题之前"
                          : dropPosition === "after"
                            ? "↓ 插入到此主题之后"
                            : "+ 移为子主题"}
                      </text>
                    </g>
                  )}

                  {/* Where exactly the dragged node would land. The ring above
                      says which node is the target; this says whether the drop
                      reorders among its siblings or reparents under it. */}
                  {dropTargetId === node.id && dropPosition !== "child" && (
                    <line
                      className="mindmap-drop-insert-line"
                      x1={-6}
                      x2={node.width + 6}
                      y1={dropPosition === "before" ? -8 : node.height + 8}
                      y2={dropPosition === "before" ? -8 : node.height + 8}
                      stroke="#38bdf8"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
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
                      strokeDasharray={
                        searchMatchIds[currentSearchIndex] === node.id ? "none" : "4 2"
                      }
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
                        stroke={
                          node.borderColor ||
                          (customBg && !isCustomTransparent ? customBg : defaultBranchColor)
                        }
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
                        fill: isCustomTransparent ? "transparent" : customBg || undefined,
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
                          fontWeight: node.fontWeight
                            ? node.fontWeight === "bold"
                              ? 700
                              : 400
                            : isRoot
                              ? 700
                              : 500,
                          fill: resolvedTextColor || undefined,
                          // Inline styles beat author CSS, guaranteeing the chosen
                          // alignment actually takes effect on the SVG text.
                          textAnchor,
                          dominantBaseline: "central",
                        }}
                      >
                        {lines.map((line, idx) => {
                          const isNotLast = idx < lines.length - 1;
                          const isJustified =
                            align === "justify" && isNotLast && line.trim().length > 1;

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

                  {/* What the node carries but the document cannot say: an icon
                      on its leading edge, a note badge and the marks on its corners.
                      The same drawings a floating topic wears — see
                      MindmapFloatingTopics, which is handed the same decorations. */}
                  <NodeIcon iconId={iconFor(sidecar, node.id)} />
                  <NodeMarks width={node.width} markers={markersFor(sidecar, node.id)} />
                  <NodeTags height={node.height} tags={tagsFor(sidecar, node.id)} />
                  {/* Only for a link this build recognises: the badge says "this
                      goes somewhere", and a mark that promised a trip for text
                      that leads nowhere would be the one lie on the map. Text
                      that is not a link still shows in the panel, with the hint. */}
                  {parseMindmapLink(linkFor(sidecar, node.id)) ? (
                    // Clickable: the badge is where a reader sees "this goes somewhere",
                    // so it should be where they can go. The panel keeps its own 打开
                    // button for the same journey with the destination written out first.
                    <NodeLinkMark
                      height={node.height}
                      onOpen={() => handleOpenLink(tree, node.id)}
                      label={linkFor(sidecar, node.id)}
                    />
                  ) : null}

                  {/* Outline numbering, drawn above the node's left corner.
                      Beside the text and not inside it: the text is what gets
                      written back to the document, and a number in it would be
                      a number the reader never typed. The corner is the one
                      place nothing else claims — the note badge sits on it, the
                      marks are opposite, and the icon is further left. */}
                  {numbering?.[node.id] ? (
                    <text className="mindmap-node-number" x={4} y={-5}>
                      {numbering[node.id]}
                    </text>
                  ) : null}

                  {/* A note is the one thing about a node the document cannot
                      show, so the map says where one is: a badge on the node's
                      leading corner, drawn for the eye rather than the cursor. */}
                  {noteFor(sidecar, node.id) ? <NodeNoteMark /> : null}

                  {/* Children Collapse/Expand Toggle Button (+ / - geometrically centered via SVG vector lines).
                      Hung off the edge the children are actually on: the default layout grows
                      everything right, so nothing moves there, while a branch on the left of a
                      bidirectional map and every parent in the vertical layout would otherwise
                      end up with the toggle in the middle of the row below it. */}
                  {node.hasChildren && (
                    <g
                      className="mindmap-collapse-btn"
                      transform={collapseToggleAnchor(node)}
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

          {/* Summary brackets, then free topics: both are the reader's own
              additions and sit above the outline, and a free topic is the one a
              reader drags over other things. */}
          <MindmapSummaries
            summaries={summaryBoxes}
            selectedId={selectedSummaryId}
            onSelect={setSelectedSummaryId}
            onStartEdit={handleStartSummaryEdit}
          />

          {/* Free topics last, so they sit above the outline: they are the
              reader's own additions, and one dragged over a branch should stay
              visible rather than slide underneath it. */}
          <MindmapFloatingTopics
            topics={floatingBoxes}
            selectedId={selectedFloatingId}
            onSelect={setSelectedFloatingId}
            onStartEdit={handleStartFloatingEdit}
            onStartDrag={handleFloatingDragStart}
            onOpenMenu={handleFloatingContextMenu}
            onOpenLink={(id) => handleOpenLink(tree, id)}
          />
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

      {/* Inline text editing, over whatever was asked for: a node's text, a free
          topic's text, or a summary's label. One editor, because all three are a
          box with text in it. */}
      {inlineEdit && (
        <MindmapInlineEditor
          node={inlineEdit.box}
          transform={transform}
          value={editingText}
          inputRef={editInputRef}
          onChange={setEditingText}
          onCommit={inlineEdit.onCommit}
          onCancel={inlineEdit.onCancel}
        />
      )}

      {/* Where a new first-level branch goes, asked before it is made. It wears the menus'
          own class deliberately: it inherits their look, and their wheel handling — which is
          what keeps the map still while a popover is up. */}
      {sideChooser && (
        <div
          className="mindmap-context-menu mindmap-side-chooser"
          style={{ left: sideChooser.x, top: sideChooser.y }}
          onMouseDown={(event) => event.stopPropagation()}
          role="group"
          aria-label="这一支放哪边"
        >
          <div className="mindmap-ctx-header">
            <span className="mindmap-ctx-title">这一支放哪边？</span>
            <button
              type="button"
              className="mindmap-ctx-close"
              onClick={() => setSideChooser(null)}
              title="关闭 (Esc)"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="mindmap-ctx-actions">
            <button
              type="button"
              className="mindmap-ctx-item"
              onClick={() => handleAddChild(sideChooser.parentId, "left")}
            >
              放到左侧
            </button>
            <button
              type="button"
              className="mindmap-ctx-item"
              onClick={() => handleAddChild(sideChooser.parentId, "right")}
            >
              放到右侧
            </button>
          </div>
        </div>
      )}

      {/* Canvas menu, for a right-click on empty space. */}
      {contextMenu?.isCanvas && (
        <MindmapCanvasMenu
          left={menuPos.left}
          top={menuPos.top}
          menuRef={menuRef}
          canPaste={Boolean(clipboardRef.current)}
          onClose={() => setContextMenu(null)}
          onNewTopic={() => {
            setContextMenu(null);
            handleAddChild(tree.id);
          }}
          onPaste={() => {
            setContextMenu(null);
            handlePasteNode();
          }}
          selectedCount={selectedIds.length}
          selectionRelated={selectionRelated}
          canBound={selectedIds.length >= 1}
          onAddBoundary={() => {
            setContextMenu(null);
            handleAddBoundary();
          }}
          selectedBoundary={
            boundaryBoxes.find((boundary) => boundary.id === selectedBoundaryId) ?? null
          }
          onBoundaryColorChange={(colorId) => {
            setContextMenu(null);
            handleBoundaryColorChange(colorId);
          }}
          onRemoveBoundary={() => {
            setContextMenu(null);
            handleRemoveBoundary();
          }}
          selectedRelation={selectedRelationInfo}
          onEditRelationLabel={() => {
            if (selectedRelation) handleStartRelationEdit(selectedRelation);
          }}
          onRelationChange={handleRelationChange}
          onRemoveRelation={() => {
            setContextMenu(null);
            handleRemoveSelectedRelation();
          }}
          canSummarise={selectedIds.length >= 2}
          onAddSummary={() => {
            setContextMenu(null);
            handleAddSummary();
          }}
          selectedSummaryText={
            summaryBoxes.find((summary) => summary.id === selectedSummaryId)?.text || null
          }
          onRemoveSummary={() => {
            setContextMenu(null);
            handleRemoveSummary();
          }}
          selectedFloatingText={
            floatingBoxes.find((topic) => topic.id === selectedFloatingId)?.text ?? null
          }
          onNewFloatingTopic={() => {
            setContextMenu(null);
            handleNewFloatingTopic();
          }}
          onRemoveFloatingTopic={() => {
            setContextMenu(null);
            handleRemoveFloatingTopic();
          }}
          onToggleRelation={() => {
            setContextMenu(null);
            handleToggleRelation();
          }}
          onExpandAll={() => {
            setContextMenu(null);
            handleExpandAll();
          }}
          onCollapseToLevel2={() => {
            setContextMenu(null);
            handleCollapseToLevel2();
          }}
          onFitToScreen={() => {
            setContextMenu(null);
            handleFitToScreen();
          }}
        />
      )}

      {/* Right Click Appearance & Typography Customization Context Menu */}
      <MindmapNodeStyleMenu
        open={!!contextMenu && !contextMenu.isCanvas && !contextMenu.floating}
        position={menuPos}
        menuRef={menuRef}
        nodeId={contextMenu?.nodeId ?? tree.id}
        target={contextTargetNode}
        isBatchMode={isBatchMode}
        selectedCount={selectedNodeIds.size}
        canPasteBranch={clipboardReady}
        onCopyBranch={() => handleCopyNode(contextMenu?.nodeId)}
        onCutBranch={() => handleCutNode(contextMenu?.nodeId)}
        onPasteBranch={() => handlePasteNode(contextMenu?.nodeId)}
        icon={iconFor(sidecar, panelNodeId)}
        note={noteFor(sidecar, panelNodeId)}
        link={panelLink}
        parsedLink={parsedPanelLink}
        canOpenLink={canOpenPanelLink}
        tags={tagsFor(sidecar, panelNodeId)}
        knownTags={documentTags}
        markers={markersFor(sidecar, panelNodeId)}
        saveFailed={sidecarSaveFailed}
        onIconChange={handleIconChange}
        onNoteChange={handleNoteChange}
        onLinkChange={handleLinkChange}
        onOpenLink={(nodeId) => handleOpenLink(tree, nodeId)}
        onTagsChange={handleTagsChange}
        onMarkChange={handleMarkChange}
        onUpdateStyle={handleUpdateStyle}
        onDelete={handleDeleteNode}
        onAddChild={handleAddChild}
        onAddSibling={handleAddSibling}
        onStartRename={startEditing}
        // Offered only where a side is a thing: the two-sided layout, for a first-level
        // branch. A deeper topic follows its branch, so it has no other side of its own to
        // be moved to.
        onMoveToSide={
          activeLayoutId === "bidirectional" &&
          tree.children.some((child) => child.id === panelNodeId)
            ? handleMoveToSide
            : undefined
        }
        onFreezeTheme={handleFreezeTheme}
        onClose={() => setContextMenu(null)}
      />

      {/* Right Click on a Floating Topic: its own panel. The annotations are the
          same five as a node's, read from the same sections of the same file by
          the same expressions above — only the header and the one action are this
          panel's own. */}
      <MindmapFloatingAnnotationMenu
        open={!!contextMenu?.floating}
        position={menuPos}
        menuRef={menuRef}
        topicText={contextTargetFloating?.text ?? ""}
        nodeId={panelNodeId}
        isBatchMode={false}
        icon={iconFor(sidecar, panelNodeId)}
        note={noteFor(sidecar, panelNodeId)}
        link={panelLink}
        parsedLink={parsedPanelLink}
        canOpenLink={canOpenFloatingLink}
        tags={tagsFor(sidecar, panelNodeId)}
        knownTags={documentTags}
        markers={markersFor(sidecar, panelNodeId)}
        saveFailed={sidecarSaveFailed}
        onIconChange={handleIconChange}
        onNoteChange={handleNoteChange}
        onLinkChange={handleLinkChange}
        onOpenLink={(nodeId) => handleOpenLink(tree, nodeId)}
        onTagsChange={handleTagsChange}
        onMarkChange={handleMarkChange}
        onDelete={() => handleDeleteFloatingTopic(panelNodeId)}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
});
